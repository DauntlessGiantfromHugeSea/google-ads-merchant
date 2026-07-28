"""Website-Monitoring über Uptime Kuma (Webhook-Empfang + Anzeige).

In Uptime Kuma eine Benachrichtigung vom Typ „Webhook" anlegen und die im
Tool angezeigte URL eintragen (Content-Type: application/json). Bei
Status-Wechsel meldet Kuma hierher; wir ordnen den Monitor per URL dem Kunden zu.
"""
import secrets as pysecrets
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import (
    Account, AccountType, Client, MonitorEvent, MonitorStatus, Organization, User,
)
from app.schemas import MonitorEventOut, MonitorOut

settings = get_settings()
router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


def _host(url: str) -> str:
    if not url:
        return ""
    if "://" not in url:
        url = "http://" + url
    return (urlparse(url).netloc or "").lower().replace("www.", "")


def _match_client(db: Session, org_id: str, url: str) -> str | None:
    host = _host(url)
    if not host:
        return None
    for c in db.query(Client).filter(Client.organization_id == org_id).all():
        if c.website and _host(c.website) == host:
            return c.id
    # über Website-Konten
    rows = (db.query(Account).join(Client, Account.client_id == Client.id)
            .filter(Client.organization_id == org_id, Account.type == AccountType.website).all())
    for a in rows:
        if _host(a.external_id) == host:
            return a.client_id
    return None


@router.get("/webhook-url")
def webhook_url(request: Request, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    if not org.monitor_token:
        org.monitor_token = pysecrets.token_urlsafe(24)
        db.commit()
    # URL aus der tatsächlich aufgerufenen Domain bauen (hinter Caddy korrekt),
    # sonst Fallback auf PUBLIC_BASE_URL.
    host = request.headers.get("host", "")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    base = f"{proto}://{host}" if host and "localhost" not in host and "127.0.0.1" not in host \
        else settings.public_base_url.rstrip("/")
    return {"url": f"{base}/api/monitoring/webhook/{org.monitor_token}"}


@router.get("", response_model=list[MonitorOut])
def list_monitors(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    mons = (db.query(MonitorStatus).filter(MonitorStatus.organization_id == user.organization_id)
            .order_by(MonitorStatus.status.desc(), MonitorStatus.changed_at.desc()).all())
    names = {c.id: c.name for c in db.query(Client).filter(Client.organization_id == user.organization_id).all()}
    return [MonitorOut(id=m.id, name=m.name, url=m.url, status=m.status, message=m.message,
                       client_id=m.client_id, client_name=names.get(m.client_id or "", ""),
                       changed_at=m.changed_at) for m in mons]


@router.delete("/{monitor_id}", status_code=204)
def delete_monitor(monitor_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    mon = db.get(MonitorStatus, monitor_id)
    if mon and mon.organization_id == user.organization_id:
        db.delete(mon)
        db.commit()


@router.post("/webhook/{token}")
async def webhook(token: str, request: Request, db: Session = Depends(get_db)) -> dict:
    org = db.query(Organization).filter(Organization.monitor_token == token).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannter Token")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    monitor = payload.get("monitor") or {}
    heartbeat = payload.get("heartbeat") or {}
    name = monitor.get("name") or payload.get("name") or "Monitor"
    url = monitor.get("url") or monitor.get("hostname") or ""
    raw = heartbeat.get("status", payload.get("status"))
    st = "up" if raw in (1, "1", "up", True) else ("down" if raw in (0, "0", "down", False) else "pending")
    msg = payload.get("msg") or heartbeat.get("msg") or ""

    existing = (db.query(MonitorStatus)
                .filter(MonitorStatus.organization_id == org.id, MonitorStatus.name == name).first())
    if not existing:
        existing = MonitorStatus(organization_id=org.id, name=name)
        db.add(existing)
    existing.url = url or existing.url
    existing.status = st
    existing.message = str(msg)[:2000]
    # Auto-Zuordnung nur, solange noch kein Kunde zugeordnet ist (manuelle bleibt bestehen).
    if not existing.client_id:
        existing.client_id = _match_client(db, org.id, url)
    existing.changed_at = datetime.now(timezone.utc)
    # Verlauf-Eintrag
    db.add(MonitorEvent(organization_id=org.id, client_id=existing.client_id,
                        name=name, url=existing.url, status=st, message=str(msg)[:2000]))
    db.commit()
    return {"ok": True}


@router.get("/client/{client_id}", response_model=list[MonitorOut])
def client_monitors(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Monitore eines Kunden (auch für den Kunden-Login sichtbar)."""
    get_scoped_client(client_id, user, db)
    mons = (db.query(MonitorStatus)
            .filter(MonitorStatus.organization_id == user.organization_id, MonitorStatus.client_id == client_id)
            .order_by(MonitorStatus.status.desc()).all())
    client = db.get(Client, client_id)
    return [MonitorOut(id=m.id, name=m.name, url=m.url, status=m.status, message=m.message,
                       client_id=m.client_id, client_name=client.name if client else "",
                       changed_at=m.changed_at) for m in mons]


@router.get("/client/{client_id}/events", response_model=list[MonitorEventOut])
def client_events(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Up/Down-Verlauf eines Kunden."""
    get_scoped_client(client_id, user, db)
    return (db.query(MonitorEvent)
            .filter(MonitorEvent.organization_id == user.organization_id, MonitorEvent.client_id == client_id)
            .order_by(MonitorEvent.created_at.desc()).limit(50).all())


@router.patch("/{monitor_id}", response_model=MonitorOut)
def assign_monitor(monitor_id: str, data: dict, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Monitor manuell einem Kunden zuordnen (client_id = null zum Lösen)."""
    mon = db.get(MonitorStatus, monitor_id)
    if not mon or mon.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Monitor nicht gefunden")
    cid = data.get("client_id") or None
    if cid:
        client = db.get(Client, cid)
        if not client or client.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kunde nicht gefunden")
    mon.client_id = cid
    db.commit()
    db.refresh(mon)
    names = {c.id: c.name for c in db.query(Client).filter(Client.organization_id == user.organization_id).all()}
    return MonitorOut(id=mon.id, name=mon.name, url=mon.url, status=mon.status, message=mon.message,
                      client_id=mon.client_id, client_name=names.get(mon.client_id or "", ""), changed_at=mon.changed_at)
