"""Microsoft-365-Mail: OAuth-Login ("Mit Microsoft anmelden") + Mailversand
über Microsoft Graph. Refresh-Token wird pro Organisation verschlüsselt
gespeichert; der Zugriffstoken wird bei jedem Versand frisch geholt.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.core.security import create_access_token, decode_access_token
from app.database import get_db
from app.models import Organization, User
from app.schemas import MailSend, MailStatus

settings = get_settings()
router = APIRouter(prefix="/api/mail", tags=["mail"])

SCOPE = "offline_access openid email profile User.Read Mail.Send"


def _cfg() -> bool:
    return bool(settings.microsoft_client_id and settings.microsoft_client_secret)


def _redirect_uri() -> str:
    return f"{settings.public_base_url.rstrip('/')}/api/mail/callback"


def _token_url() -> str:
    return f"https://login.microsoftonline.com/{settings.microsoft_tenant}/oauth2/v2.0/token"


def _access_token(refresh_token: str) -> str:
    r = httpx.post(_token_url(), data={
        "client_id": settings.microsoft_client_id,
        "client_secret": settings.microsoft_client_secret,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": SCOPE,
    }, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


@router.get("/status", response_model=MailStatus)
def status_(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    return MailStatus(connected=bool(org.ms_refresh_token), email=org.ms_email, configured=_cfg())


@router.get("/connect")
def connect(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    if not _cfg():
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Microsoft ist nicht konfiguriert (MICROSOFT_CLIENT_ID/SECRET fehlen).")
    state = create_access_token(user.organization_id, {"purpose": "ms_oauth"})
    url = (f"https://login.microsoftonline.com/{settings.microsoft_tenant}/oauth2/v2.0/authorize"
           f"?client_id={settings.microsoft_client_id}&response_type=code"
           f"&redirect_uri={_redirect_uri()}&response_mode=query"
           f"&scope={SCOPE.replace(' ', '%20')}&state={state}")
    return {"url": url}


@router.get("/callback")
def callback(code: str = "", state: str = "", db: Session = Depends(get_db)):
    payload = decode_access_token(state)
    target = f"{settings.public_base_url.rstrip('/')}/settings"
    if not payload or payload.get("purpose") != "ms_oauth" or not code:
        return RedirectResponse(f"{target}?mail=error")
    org = db.get(Organization, payload["sub"])
    if not org:
        return RedirectResponse(f"{target}?mail=error")
    try:
        r = httpx.post(_token_url(), data={
            "client_id": settings.microsoft_client_id,
            "client_secret": settings.microsoft_client_secret,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _redirect_uri(),
            "scope": SCOPE,
        }, timeout=20)
        r.raise_for_status()
        tok = r.json()
        access = tok["access_token"]
        me = httpx.get("https://graph.microsoft.com/v1.0/me",
                       headers={"Authorization": f"Bearer {access}"}, timeout=20).json()
        org.ms_email = me.get("mail") or me.get("userPrincipalName") or ""
        org.ms_refresh_token = encrypt(tok.get("refresh_token", ""))
        db.commit()
        return RedirectResponse(f"{target}?mail=connected")
    except Exception:
        return RedirectResponse(f"{target}?mail=error")


@router.post("/disconnect", status_code=204)
def disconnect(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    org.ms_refresh_token = ""
    org.ms_email = ""
    db.commit()


@router.post("/send")
def send(data: MailSend, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    if not org.ms_refresh_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kein Microsoft-Konto verbunden.")
    try:
        access = _access_token(decrypt(org.ms_refresh_token))
        message = {
            "message": {
                "subject": data.subject,
                "body": {"contentType": "HTML" if data.html else "Text", "content": data.body},
                "toRecipients": [{"emailAddress": {"address": data.to}}],
            },
            "saveToSentItems": True,
        }
        resp = httpx.post("https://graph.microsoft.com/v1.0/me/sendMail",
                          headers={"Authorization": f"Bearer {access}"}, json=message, timeout=25)
        if resp.status_code >= 300:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Versand fehlgeschlagen: {resp.text[:200]}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Versand fehlgeschlagen: {exc}") from exc
    return {"ok": True}
