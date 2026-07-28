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

from app.api.deps import require_agency
from app.config import get_settings
from app.database import get_db
from app.models import Account, AccountType, Client, MonitorStatus, Organization, User
from app.schemas import MonitorOut

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
def webhook_url(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    if not org.monitor_token:
        org.monitor_token = pysecrets.token_urlsafe(24)
        db.commit()
    base = settings.public_base_url.rstrip("/")
    return {"url": f"{base}/api/monitoring/webhook/{org.monitor_token}"}


@router.get("", response_model=list[MonitorOut])
def list_monitors(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    mons = (db.query(MonitorStatus).filter(MonitorStatus.organization_id == user.organization_id)
            .order_by(MonitorStatus.status.desc(), MonitorStatus.changed_at.desc()).all())
    names = {c.id: c.name for c in db.query(Client).filter(Client.organization_id == user.organization_id).all()}
    return [MonitorOut(id=m.id, name=m.name, url=m.url, status=m.status, message=m.message,
                       client_id=m.client_id, client_name=names.get(m.client_id or "", ""),
                       changed_at=m.changed_at) for m in mons]


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
    db.commit()
    return {"ok": True}


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
