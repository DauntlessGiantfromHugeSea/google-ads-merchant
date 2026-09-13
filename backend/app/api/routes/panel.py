"""NorthLab Control Panel (panel.north-lab.de) – Webhook-Empfänger + Ansichten.

Das Panel verwaltet die WordPress-Seiten der Kunden (Updates, Verfügbarkeit,
Security, Wartung) und schickt alles per signiertem Webhook hierher.

Sicherheit (zwingend, in dieser Reihenfolge):
  a) rohen Body VOR dem Parsen sichern – die Signatur gilt für die Bytes
  b) HMAC-SHA256 über "<timestamp>.<body>" mit geteiltem Secret, timing-sicher
  c) Zeitstempel > 5 Min. alt -> ablehnen (Replay-Schutz)
  d) Delivery-ID speichern; bereits gesehen -> 200 ohne erneute Verarbeitung

Angenommen wird schnell (annehmen, wegschreiben, 200); die Auswertung läuft
asynchron im Hintergrund.
"""
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import (
    Client, Organization, PanelClient, PanelEvent, PanelIncident, PanelSite,
    PanelSiteUpdate, PanelUptimeDaily, User, UserRole,
)

settings = get_settings()
router = APIRouter(prefix="/api/panel", tags=["panel"])
public_router = APIRouter(prefix="/api/panel", tags=["panel"])

_MAX_AGE = 300  # Sekunden (Replay-Schutz)


# ---------- Zeit-Helfer (alles UTC) ----------
def _parse_iso(s) -> datetime | None:
    if not s or not isinstance(s, str):
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        # "YYYY-MM-DD HH:MM:SS" (ohne T/Zone) als UTC deuten
        try:
            return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _target_org(db: Session) -> Organization | None:
    """Einzel-Agentur-Setup: das Panel-Secret liegt in der Umgebung, die Daten
    gehören zur (einzigen) Agentur-Organisation."""
    return db.query(Organization).first()


# ---------- Upserts ----------
def _upsert_site(db: Session, org_id: str, s: dict) -> PanelSite:
    sid = s.get("id")
    row = db.query(PanelSite).filter(
        PanelSite.organization_id == org_id, PanelSite.panel_site_id == sid).first()
    if not row:
        row = PanelSite(organization_id=org_id, panel_site_id=sid)
        db.add(row)
    if "client_id" in s:
        row.panel_client_id = s.get("client_id")
    for src, dst in (("name", "name"), ("url", "url"), ("status", "status"),
                     ("uptime_status", "uptime_status"), ("wp_version", "wp_version"),
                     ("php_version", "php_version")):
        if s.get(src) is not None:
            setattr(row, dst, s[src])
    if s.get("security_score") is not None:
        row.security_score = int(s["security_score"])
    if s.get("pending_updates") is not None:
        row.pending_updates = int(s["pending_updates"])
    av = s.get("availability") or {}
    if av.get("percent") is not None:
        row.uptime_percent = float(av["percent"])
    if av.get("downtime_seconds") is not None:
        row.downtime_seconds = int(av["downtime_seconds"])
    if av.get("avg_response_ms") is not None:
        row.avg_response_ms = int(av["avg_response_ms"])
    row.updated_at = datetime.now(timezone.utc)
    return row


def _upsert_client(db: Session, org_id: str, c: dict) -> None:
    cid = c.get("id")
    if cid is None:
        return
    row = db.query(PanelClient).filter(
        PanelClient.organization_id == org_id, PanelClient.panel_client_id == cid).first()
    if not row:
        row = PanelClient(organization_id=org_id, panel_client_id=cid)
        db.add(row)
    for k in ("name", "contact", "email"):
        if c.get(k) is not None:
            setattr(row, k, c[k])
    row.updated_at = datetime.now(timezone.utc)


def _replace_incidents(db: Session, org_id: str, sid: int, incidents: list) -> None:
    db.query(PanelIncident).filter(
        PanelIncident.organization_id == org_id, PanelIncident.panel_site_id == sid).delete()
    for it in incidents or []:
        db.add(PanelIncident(
            organization_id=org_id, panel_site_id=sid,
            started_at=_parse_iso(it.get("started_at")), ended_at=_parse_iso(it.get("ended_at")),
            seconds=int(it.get("seconds") or 0), reason=(it.get("reason") or "")[:255],
            source=(it.get("source") or "")[:40]))


def _add_updates(db: Session, org_id: str, sid: int, items: list) -> None:
    for u in items or []:
        db.add(PanelSiteUpdate(
            organization_id=org_id, panel_site_id=sid,
            type=(u.get("type") or "")[:24], slug=(u.get("slug") or "")[:200],
            name=(u.get("name") or "")[:255],
            from_version=(u.get("from_version") or "")[:40],
            to_version=(u.get("to_version") or "")[:40],
            applied_at=_parse_iso(u.get("at")) or datetime.now(timezone.utc)))


def _open_incident(db: Session, org_id: str, sid: int, reason: str, source: str, at: datetime) -> None:
    existing = db.query(PanelIncident).filter(
        PanelIncident.organization_id == org_id, PanelIncident.panel_site_id == sid,
        PanelIncident.ended_at.is_(None)).first()
    if existing:
        return  # läuft schon
    db.add(PanelIncident(organization_id=org_id, panel_site_id=sid,
                         started_at=at, reason=reason[:255], source=source[:40]))


def _close_incident(db: Session, org_id: str, sid: int, downtime: int, at: datetime) -> None:
    inc = (db.query(PanelIncident).filter(
        PanelIncident.organization_id == org_id, PanelIncident.panel_site_id == sid,
        PanelIncident.ended_at.is_(None))
        .order_by(PanelIncident.started_at.desc()).first())
    if not inc:
        return
    inc.ended_at = at
    if downtime:
        inc.seconds = downtime
    elif inc.started_at:
        inc.seconds = int((at - inc.started_at).total_seconds())


def _apply_snapshot(db: Session, org_id: str, data: dict) -> None:
    """snapshot.full / report.generated: Wahrheitsquelle – Bestand abgleichen."""
    for c in data.get("clients") or []:
        _upsert_client(db, org_id, c)
    for s in data.get("sites") or []:
        sid = s.get("id")
        if sid is None:
            continue
        site = _upsert_site(db, org_id, s)
        site.last_snapshot_at = datetime.now(timezone.utc)
        _replace_incidents(db, org_id, sid, s.get("incidents"))
        # Uptime-Tageswerte (falls mitgeliefert) upserten
        for d in s.get("uptime_daily") or []:
            day = d.get("day") or ""
            row = db.query(PanelUptimeDaily).filter(
                PanelUptimeDaily.organization_id == org_id,
                PanelUptimeDaily.panel_site_id == sid, PanelUptimeDaily.day == day).first()
            if not row:
                row = PanelUptimeDaily(organization_id=org_id, panel_site_id=sid, day=day)
                db.add(row)
            row.percent = d.get("percent")
            row.downtime_seconds = int(d.get("downtime_seconds") or 0)


# ---------- Event-Verarbeitung (asynchron) ----------
def _dispatch(db: Session, org_id: str, event: str, site: dict | None, data: dict, occurred: datetime) -> None:
    sid = (site or {}).get("id")
    if site and sid is not None:
        _upsert_site(db, org_id, site)   # Stammdaten aus der Hülle aktuell halten

    if event in ("snapshot.full", "report.generated"):
        _apply_snapshot(db, org_id, data)

    elif event == "update.applied" and sid is not None:
        _add_updates(db, org_id, sid, [i for i in (data.get("items") or []) if i.get("success", True)])

    elif event == "updates.available" and sid is not None:
        row = _site_row(db, org_id, sid)
        if row and data.get("pending") is not None:
            row.pending_updates = int(data["pending"])

    elif event == "site.offline" and sid is not None:
        row = _site_row(db, org_id, sid)
        if row:
            row.uptime_status = "down"
        _open_incident(db, org_id, sid, data.get("reason") or "offline",
                       data.get("source") or "", occurred)

    elif event == "site.online" and sid is not None:
        row = _site_row(db, org_id, sid)
        if row:
            row.uptime_status = "up"
        _close_incident(db, org_id, sid, int(data.get("downtime_seconds") or 0), occurred)

    elif event == "security.changed" and sid is not None:
        row = _site_row(db, org_id, sid)
        if row and data.get("score") is not None:
            row.security_score = int(data["score"])

    elif event == "site.connected" and sid is not None:
        row = _site_row(db, org_id, sid)
        if row:
            row.status = "connected"

    elif event == "site.disconnected" and sid is not None:
        row = _site_row(db, org_id, sid)
        if row:
            row.status = "error"
    # update.failed / sync.failed / maintenance.done: nur als Event protokolliert
    # (liegt bereits in panel_events). Unbekannte Events werden ignoriert.


def _site_row(db: Session, org_id: str, sid: int) -> PanelSite | None:
    return db.query(PanelSite).filter(
        PanelSite.organization_id == org_id, PanelSite.panel_site_id == sid).first()


def process_event(event_id: str) -> None:
    """Läuft nach der 200-Antwort: wertet ein gespeichertes Paket aus."""
    from app.database import SessionLocal  # noqa: PLC0415
    db = SessionLocal()
    try:
        ev = db.get(PanelEvent, event_id)
        if not ev or ev.processed:
            return
        payload = ev.payload or {}
        try:
            _dispatch(db, ev.organization_id, ev.event, payload.get("site"),
                      payload.get("data") or {}, ev.occurred_at or datetime.now(timezone.utc))
        except Exception:
            pass  # ein fehlerhaftes Paket darf den Rest nicht blockieren
        ev.processed = True
        db.commit()
    finally:
        db.close()


# ---------- Webhook-Endpunkt ----------
@public_router.post("/webhook")
async def webhook(request: Request, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    raw = await request.body()                      # a) rohe Bytes zuerst sichern
    secret = settings.northlab_panel_secret
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Panel-Secret nicht konfiguriert")

    ts = request.headers.get("x-northlab-timestamp", "")
    sig = request.headers.get("x-northlab-signature", "")
    delivery = request.headers.get("x-northlab-delivery", "")

    # b) HMAC über "<timestamp>.<body>" timing-sicher vergleichen
    expected = "sha256=" + hmac.new(secret.encode(), f"{ts}.".encode() + raw,
                                    hashlib.sha256).hexdigest()
    if not (sig and hmac.compare_digest(sig, expected)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Ungültige Signatur")

    # c) Replay-Schutz: Zeitstempel höchstens 5 Minuten alt
    try:
        if abs(time.time() - float(ts)) > _MAX_AGE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zeitstempel abgelaufen")
    except (TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zeitstempel fehlt/ungültig") from exc

    # Delivery-ID ist optional (manche Panels senden keine) -> dann dient der
    # Body-Hash als Idempotenz-Schlüssel: Wiederholungen desselben Pakets haben
    # denselben Body und werden so ebenfalls nur einmal verarbeitet.
    if not delivery:
        delivery = "body:" + hashlib.sha256(raw).hexdigest()

    # d) Idempotenz: schon gesehen -> 200, nichts erneut tun
    if db.query(PanelEvent.id).filter(PanelEvent.delivery_id == delivery).first():
        return {"ok": True, "duplicate": True}

    org = _target_org(db)
    if not org:
        return {"ok": True}   # nichts zuzuordnen – trotzdem annehmen

    try:
        body = json.loads(raw.decode("utf-8"))
    except Exception:
        body = {}
    site = body.get("site") or {}
    ev = PanelEvent(
        organization_id=org.id, delivery_id=delivery,
        event=(body.get("event") or request.headers.get("x-northlab-event") or "")[:64],
        panel_site_id=site.get("id"), occurred_at=_parse_iso(body.get("occurred_at")),
        message=(body.get("message") or "")[:4000], payload=body, processed=False)
    db.add(ev)
    try:
        db.commit()
    except Exception:
        db.rollback()
        return {"ok": True, "duplicate": True}   # Race: parallel schon gespeichert
    background.add_task(process_event, ev.id)      # Auswertung nach der Antwort
    return {"ok": True}


# ---------- Ausgabe-Helfer ----------
def _bars(db: Session, org_id: str, sid: int, days: int = 30) -> list[dict]:
    rows = (db.query(PanelUptimeDaily).filter(
        PanelUptimeDaily.organization_id == org_id, PanelUptimeDaily.panel_site_id == sid)
        .order_by(PanelUptimeDaily.day.desc()).limit(days).all())
    return [{"day": r.day, "percent": r.percent, "downtime_seconds": r.downtime_seconds}
            for r in reversed(rows)]


def _site_public(db: Session, site: PanelSite) -> dict:
    """Kundensicht: nur „erreichbar/nicht erreichbar", keine internen Fehlertexte."""
    sid = site.panel_site_id
    incidents = (db.query(PanelIncident).filter(
        PanelIncident.organization_id == site.organization_id,
        PanelIncident.panel_site_id == sid)
        .order_by(PanelIncident.started_at.desc()).limit(20).all())
    updates = (db.query(PanelSiteUpdate).filter(
        PanelSiteUpdate.organization_id == site.organization_id,
        PanelSiteUpdate.panel_site_id == sid)
        .order_by(PanelSiteUpdate.applied_at.desc()).limit(50).all())
    return {
        "id": sid, "name": site.name, "url": site.url,
        "online": site.uptime_status == "up",
        "uptime_status": site.uptime_status,
        "connected": site.status == "connected",
        "status": site.status,
        "pending_updates": site.pending_updates,
        "security_score": site.security_score,
        "uptime_percent": site.uptime_percent,
        "downtime_seconds": site.downtime_seconds,
        "avg_response_ms": site.avg_response_ms,
        "uptime_daily": _bars(db, site.organization_id, sid),
        "incidents": [{"started_at": i.started_at.isoformat() if i.started_at else "",
                       "ended_at": i.ended_at.isoformat() if i.ended_at else "",
                       "seconds": i.seconds, "ongoing": i.ended_at is None} for i in incidents],
        "updates_applied": [{"type": u.type, "name": u.name, "from_version": u.from_version,
                             "to_version": u.to_version,
                             "at": u.applied_at.isoformat() if u.applied_at else ""} for u in updates],
    }


# ---------- Kundenansicht (nur eigene Seiten) ----------
client_router = APIRouter(prefix="/api/clients/{client_id}/panel", tags=["panel"])


@client_router.get("")
def client_panel(client_id: str, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client(client_id, user, db)
    # Zuordnung: welche Panel-Kunden hängen an diesem North-Flow-Client?
    pcs = db.query(PanelClient).filter(
        PanelClient.organization_id == client.organization_id,
        PanelClient.nf_client_id == client.id).all()
    ids = [pc.panel_client_id for pc in pcs]
    if not ids:
        return {"linked": False, "sites": []}
    sites = db.query(PanelSite).filter(
        PanelSite.organization_id == client.organization_id,
        PanelSite.panel_client_id.in_(ids)).order_by(PanelSite.name).all()
    return {"linked": True, "sites": [_site_public(db, s) for s in sites]}


# ---------- Interne Übersicht (Agentur, alle Kunden) ----------
@router.get("/sites")
def all_sites(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    org = db.get(Organization, user.organization_id)
    sites = db.query(PanelSite).filter(PanelSite.organization_id == org.id).order_by(PanelSite.name).all()
    # Panel-Kunde -> Name/Zuordnung
    pcs = {pc.panel_client_id: pc for pc in db.query(PanelClient).filter(
        PanelClient.organization_id == org.id).all()}
    out = []
    for s in sites:
        pc = pcs.get(s.panel_client_id)
        out.append({
            "id": s.panel_site_id, "name": s.name, "url": s.url, "status": s.status,
            "uptime_status": s.uptime_status, "wp_version": s.wp_version, "php_version": s.php_version,
            "security_score": s.security_score, "pending_updates": s.pending_updates,
            "uptime_percent": s.uptime_percent, "downtime_seconds": s.downtime_seconds,
            "panel_client_id": s.panel_client_id,
            "panel_client_name": pc.name if pc else "",
            "nf_client_id": pc.nf_client_id if pc else None,
            "last_snapshot_at": s.last_snapshot_at.isoformat() if s.last_snapshot_at else "",
        })
    return out


@router.post("/import-now")
def import_now(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    """Sofort-Import: holt den kompletten Stand über die Abruf-API des Panels
    (/api/v1/export) und gleicht den Bestand ab (wie ein snapshot.full).
    Nützlich für Erstbefüllung/Recovery, ohne auf den nächtlichen Push zu warten."""
    org = db.get(Organization, user.organization_id)
    token = settings.northlab_panel_token
    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "NORTHLAB_PANEL_TOKEN ist nicht gesetzt (Bearer-Token aus dem Panel).")
    base = settings.northlab_panel_url.rstrip("/")
    try:
        r = httpx.get(f"{base}/api/v1/export?days=30",
                      headers={"Authorization": f"Bearer {token}"}, timeout=60)
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Panel nicht erreichbar: {exc}") from exc
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            f"Panel-Abruf fehlgeschlagen (HTTP {r.status_code}). Token prüfen.")
    try:
        data = r.json()
    except ValueError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Panel lieferte kein gültiges JSON.") from exc
    _apply_snapshot(db, org.id, data)
    db.commit()
    sites = db.query(PanelSite).filter(PanelSite.organization_id == org.id).count()
    clients = db.query(PanelClient).filter(PanelClient.organization_id == org.id).count()
    return {"ok": True, "sites": sites, "clients": clients}


@router.get("/clients")
def panel_clients(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    org = db.get(Organization, user.organization_id)
    rows = db.query(PanelClient).filter(PanelClient.organization_id == org.id).order_by(PanelClient.name).all()
    return [{"panel_client_id": r.panel_client_id, "name": r.name, "contact": r.contact,
             "email": r.email, "nf_client_id": r.nf_client_id} for r in rows]


@router.post("/clients/{panel_client_id}/assign")
def assign_client(panel_client_id: int, body: dict, user: User = Depends(require_agency),
                  db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    pc = db.query(PanelClient).filter(
        PanelClient.organization_id == org.id, PanelClient.panel_client_id == panel_client_id).first()
    if not pc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Panel-Kunde unbekannt")
    nf_id = (body.get("nf_client_id") or "").strip() or None
    if nf_id and not db.query(Client.id).filter(
            Client.id == nf_id, Client.organization_id == org.id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kunde unbekannt")
    pc.nf_client_id = nf_id
    db.commit()
    return {"ok": True, "nf_client_id": pc.nf_client_id}
