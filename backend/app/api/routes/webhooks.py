"""Generische, benannte Eingangs-Webhooks je Kunde.

Ein System für alle: Synology-NAS, Uptime-Monitore, Contact-Form-Plugins,
eigene Skripte … Jeder Webhook hat eine eigene URL (/api/hooks/{token}).
Eingehende Meldungen (JSON, Formular oder reiner Text) landen im Protokoll des
Kunden und lösen eine Benachrichtigung an die Agentur aus (Glocke + E-Mail).
"""
import secrets as pysecrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import Client, ClientWebhook, Organization, User
from app.services import notify

from .activity import log_activity

settings = get_settings()
router = APIRouter(prefix="/api/clients/{client_id}/webhooks", tags=["webhooks"])
public_router = APIRouter(prefix="/api/hooks", tags=["webhooks"])

_MAX_TEXT = 4000


def _url(token: str) -> str:
    base = settings.public_base_url.rstrip("/")
    return f"{base}/api/hooks/{token}" if token else ""


def _out(w: ClientWebhook) -> dict:
    return {
        "id": w.id, "label": w.label, "url": _url(w.token),
        "client_visible": bool(w.client_visible),
        "last_event_at": w.last_event_at.isoformat() if w.last_event_at else "",
        "last_text": w.last_text or "",
    }


@router.get("")
def list_webhooks(client_id: str, user: User = Depends(require_agency),
                  db: Session = Depends(get_db)) -> list[dict]:
    get_scoped_client(client_id, user, db)
    rows = (db.query(ClientWebhook).filter(ClientWebhook.client_id == client_id)
            .order_by(ClientWebhook.created_at).all())
    return [_out(w) for w in rows]


@router.post("", status_code=201)
def create_webhook(client_id: str, body: dict, user: User = Depends(require_agency),
                   db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client(client_id, user, db)
    w = ClientWebhook(
        organization_id=client.organization_id, client_id=client.id,
        label=(body.get("label") or "Webhook").strip()[:120],
        token=pysecrets.token_urlsafe(24),
        client_visible=bool(body.get("client_visible", True)))
    db.add(w)
    db.commit()
    db.refresh(w)
    return _out(w)


@router.patch("/{wid}")
def patch_webhook(client_id: str, wid: str, body: dict, user: User = Depends(require_agency),
                  db: Session = Depends(get_db)) -> dict:
    get_scoped_client(client_id, user, db)
    w = db.get(ClientWebhook, wid)
    if not w or w.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannt")
    if "label" in body:
        w.label = (body.get("label") or "Webhook").strip()[:120]
    if "client_visible" in body:
        w.client_visible = bool(body["client_visible"])
    db.commit()
    return _out(w)


@router.post("/{wid}/rotate")
def rotate_webhook(client_id: str, wid: str, user: User = Depends(require_agency),
                   db: Session = Depends(get_db)) -> dict:
    get_scoped_client(client_id, user, db)
    w = db.get(ClientWebhook, wid)
    if not w or w.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannt")
    w.token = pysecrets.token_urlsafe(24)
    db.commit()
    return _out(w)


@router.delete("/{wid}", status_code=204)
def delete_webhook(client_id: str, wid: str, user: User = Depends(require_agency),
                   db: Session = Depends(get_db)) -> None:
    get_scoped_client(client_id, user, db)
    w = db.get(ClientWebhook, wid)
    if w and w.client_id == client_id:
        db.delete(w)
        db.commit()


def _extract_message(data) -> str:
    """Baut aus JSON/Form/Text eine lesbare Meldung."""
    if isinstance(data, str):
        return data.strip()
    if isinstance(data, dict):
        title = next((str(data[k]).strip() for k in ("title", "subject", "event", "type")
                      if data.get(k)), "")
        text = next((str(data[k]).strip() for k in
                     ("text", "message", "msg", "content", "body", "detail", "description")
                     if data.get(k)), "")
        if not text and not title:
            text = ", ".join(f"{k}: {v}" for k, v in data.items() if v not in (None, ""))
        if title and text:
            return f"{title} – {text}"
        return text or title
    return str(data or "").strip()


@public_router.post("/{token}")
async def receive(token: str, request: Request, db: Session = Depends(get_db)) -> dict:
    w = db.query(ClientWebhook).filter(ClientWebhook.token == token).first()
    if not w or not token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannter Webhook")
    data = None
    try:
        data = await request.json()
    except Exception:
        try:
            data = dict(await request.form())
        except Exception:
            data = None
    if data is None:
        try:
            data = (await request.body()).decode("utf-8", "replace")
        except Exception:
            data = ""
    msg = _extract_message(data) or "Meldung"
    label = w.label or "Webhook"
    log_activity(db, org_id=w.organization_id, client_id=w.client_id,
                 text=f"{label}: {msg}"[:_MAX_TEXT], source="system",
                 author=label, client_visible=bool(w.client_visible))
    w.last_event_at = datetime.now(timezone.utc)
    w.last_text = msg[:300]
    client = db.get(Client, w.client_id)
    notify.notify_users(
        db, notify._agency_user_ids(db, w.organization_id),  # noqa: SLF001
        org_id=w.organization_id, client_id=w.client_id, type_="webhook",
        title=f"{label}: {client.name if client else ''}".strip(), body=msg[:140],
        link=f"/clients/{w.client_id}")
    db.commit()
    return {"ok": True}
