"""Synology-NAS-Statuswebhook (pro Kunde eigene URL).

Das NAS (DSM → Benachrichtigungen → Webhook) sendet Status-/Ereignismeldungen
an die kundeneigene URL. Jede Meldung wird ins Protokoll des Kunden geschrieben
und die Agentur benachrichtigt (Glocke + optional E-Mail).
Akzeptiert JSON, Formular-POST oder reinen Text – robust gegenüber DSM-Vorlagen.
"""
import secrets as pysecrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import Client, Organization, User
from app.services import notify

from .activity import log_activity

settings = get_settings()
router = APIRouter(prefix="/api/synology", tags=["synology"])
public_router = APIRouter(prefix="/api/synology", tags=["synology"])

_MAX_TEXT = 4000


def _url(token: str) -> str:
    base = settings.public_base_url.rstrip("/")
    return f"{base}/api/synology/webhook/{token}" if token else ""


def _status(client: Client) -> dict:
    return {
        "enabled": bool(client.synology_enabled),
        "client_visible": bool(client.synology_client_visible),
        "webhook_url": _url(client.synology_token) if client.synology_enabled else "",
    }


@router.get("/{client_id}/status")
def get_status(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    return _status(get_scoped_client(client_id, user, db))


@router.post("/{client_id}/enable")
def set_enabled(client_id: str, body: dict, user: User = Depends(require_agency),
                db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client(client_id, user, db)
    client.synology_enabled = bool(body.get("enabled"))
    if client.synology_enabled and not client.synology_token:
        client.synology_token = pysecrets.token_urlsafe(24)
    db.commit()
    return _status(client)


@router.post("/{client_id}/settings")
def set_settings(client_id: str, body: dict, user: User = Depends(require_agency),
                 db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client(client_id, user, db)
    if "client_visible" in body:
        client.synology_client_visible = bool(body["client_visible"])
    db.commit()
    return _status(client)


@router.post("/{client_id}/rotate")
def rotate(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client(client_id, user, db)
    client.synology_token = pysecrets.token_urlsafe(24)
    client.synology_enabled = True
    db.commit()
    return _status(client)


def _extract_message(data) -> str:
    """Baut aus JSON/Form/Text eine lesbare Meldung."""
    if isinstance(data, str):
        return data.strip()
    if isinstance(data, dict):
        title = ""
        for k in ("title", "subject", "event", "type"):
            if data.get(k):
                title = str(data[k]).strip()
                break
        text = ""
        for k in ("text", "message", "msg", "content", "body", "detail", "description"):
            if data.get(k):
                text = str(data[k]).strip()
                break
        if not text and not title:
            # Fallback: alle Felder kompakt darstellen
            text = ", ".join(f"{k}: {v}" for k, v in data.items() if v not in (None, ""))
        if title and text:
            return f"{title} – {text}"
        return text or title
    return str(data or "").strip()


@public_router.post("/webhook/{token}")
async def webhook(token: str, request: Request, db: Session = Depends(get_db)) -> dict:
    client = db.query(Client).filter(Client.synology_token == token).first()
    if not client or not client.synology_enabled or not token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannter oder deaktivierter Webhook")
    # JSON, Formular oder reiner Text akzeptieren.
    data = None
    try:
        data = await request.json()
    except Exception:
        try:
            form = await request.form()
            data = dict(form)
        except Exception:
            data = None
    if data is None:
        try:
            data = (await request.body()).decode("utf-8", "replace")
        except Exception:
            data = ""
    msg = _extract_message(data) or "Statusmeldung vom NAS"
    org = db.get(Organization, client.organization_id)
    log_activity(db, org_id=client.organization_id, client_id=client.id,
                 text=f"Synology-NAS: {msg}"[:_MAX_TEXT], source="system",
                 author="Synology-NAS", client_visible=bool(client.synology_client_visible))
    notify.notify_users(
        db, notify._agency_user_ids(db, client.organization_id),  # noqa: SLF001
        org_id=client.organization_id, client_id=client.id, type_="synology",
        title=f"NAS-Meldung: {client.name}", body=msg[:140],
        link=f"/clients/{client.id}")
    db.commit()
    return {"ok": True}
