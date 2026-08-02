"""Native Analytics-KPIs je Kunde – automatisch aus einem veröffentlichten
Google-Sheet (CSV) importiert und im Marken-Design dargestellt (kein iframe)."""
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, KpiSnapshot, User
from app.schemas import KpiSnapshotOut, KpiSourceIn, KpiSourceOut
from app.services import kpi

router = APIRouter(prefix="/api/clients/{client_id}/kpis", tags=["kpis"])

_STALE_AFTER = timedelta(hours=6)   # so oft wird beim Agentur-Aufruf automatisch aktualisiert
_MAX_BYTES = 4 * 1024 * 1024


def _sync(client: Client, db: Session) -> int:
    """Google-Sheet abrufen, parsen und Snapshots aktualisieren. Gibt die Zahl
    der Zeiträume zurück. Wirft bei Netz-/Formatfehlern."""
    csv_url = kpi.to_csv_url(client.kpi_sheet_url)
    if not csv_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keine Sheet-URL hinterlegt.")
    try:
        with httpx.Client(timeout=15, follow_redirects=True) as c:
            r = c.get(csv_url, headers={"User-Agent": "NorthFlow/1.0"})
            r.raise_for_status()
            text = r.text[: _MAX_BYTES]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Sheet konnte nicht geladen werden. Ist es im Web veroeffentlicht?") from exc
    rows = kpi.parse_csv(text)
    if not rows:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Keine verwertbaren Daten gefunden (erste Spalte = Monat, dann Kennzahlen).")
    existing = {s.period: s for s in db.query(KpiSnapshot).filter(KpiSnapshot.client_id == client.id).all()}
    for row in rows:
        payload = {"m": row["metrics"], "x": row["extras"]}
        snap = existing.get(row["period"])
        if snap:
            snap.metrics = payload
        else:
            db.add(KpiSnapshot(organization_id=client.organization_id, client_id=client.id,
                               period=row["period"], metrics=payload))
    client.kpi_synced_at = datetime.now(timezone.utc)
    db.commit()
    return len(rows)


def _out(snap: KpiSnapshot) -> KpiSnapshotOut:
    data = snap.metrics or {}
    return KpiSnapshotOut(period=snap.period, metrics=data.get("m", {}), extras=data.get("x", {}))


@router.get("", response_model=list[KpiSnapshotOut])
def list_kpis(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Kennzahlen (chronologisch) – auch für den Kunden sichtbar. Liest nur die
    gespeicherten Werte, kein Netzabruf (schnell)."""
    get_scoped_client(client_id, user, db)
    snaps = (db.query(KpiSnapshot).filter(KpiSnapshot.client_id == client_id)
             .order_by(KpiSnapshot.period.asc()).all())
    return [_out(s) for s in snaps]


@router.get("/source", response_model=KpiSourceOut)
def get_source(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Quelle anzeigen. Ist sie veraltet, wird im Hintergrund aktualisiert."""
    client = get_scoped_client(client_id, user, db)
    err = ""
    if client.kpi_sheet_url:
        stale = client.kpi_synced_at is None or (
            datetime.now(timezone.utc) - _aware(client.kpi_synced_at) > _STALE_AFTER)
        if stale:
            try:
                _sync(client, db)
            except HTTPException as e:
                err = str(e.detail)
    return KpiSourceOut(url=client.kpi_sheet_url, has_url=bool(client.kpi_sheet_url),
                        synced_at=client.kpi_synced_at, error=err)


@router.put("/source", response_model=KpiSourceOut)
def set_source(client_id: str, data: KpiSourceIn,
               user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    client.kpi_sheet_url = (data.url or "").strip()
    client.kpi_synced_at = None
    db.commit()
    err = ""
    if client.kpi_sheet_url:
        try:
            _sync(client, db)
        except HTTPException as e:
            err = str(e.detail)
    return KpiSourceOut(url=client.kpi_sheet_url, has_url=bool(client.kpi_sheet_url),
                        synced_at=client.kpi_synced_at, error=err)


@router.post("/sync", response_model=KpiSourceOut)
def sync_now(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    _sync(client, db)
    return KpiSourceOut(url=client.kpi_sheet_url, has_url=bool(client.kpi_sheet_url),
                        synced_at=client.kpi_synced_at)


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
