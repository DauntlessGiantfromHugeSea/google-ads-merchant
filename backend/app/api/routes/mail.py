"""Microsoft-365-Mail: OAuth-Login ("Mit Microsoft anmelden") + Mailversand
über Microsoft Graph. Refresh-Token wird pro Organisation verschlüsselt
gespeichert; der Zugriffstoken wird bei jedem Versand frisch geholt.
"""
import html as htmllib

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin, require_agency
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


def render_email_html(org, body_text: str) -> str:
    """Verpackt Text in eine gebrandete HTML-Mail (Logo, Farben, Footer)."""
    logo = f"{settings.public_base_url.rstrip('/')}/api/branding/logo"
    body_html = htmllib.escape(body_text).replace("\n", "<br>")
    name = getattr(org, "agency_contact_name", "") or getattr(org, "name", "") or ""
    email = getattr(org, "agency_contact_email", "") or getattr(org, "ms_email", "") or ""
    phone = getattr(org, "agency_contact_phone", "") or ""
    footer_parts = [p for p in [name, email, phone] if p]
    footer = " · ".join(footer_parts)
    return f"""\
<div style="background:#f1f2f6;padding:24px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8ee;">
    <div style="background:linear-gradient(120deg,#14b8a6,#7c3aed);padding:22px 24px;text-align:center;">
      <img src="{logo}" alt="" style="max-height:42px;max-width:220px;"/>
    </div>
    <div style="padding:26px 24px;color:#15161a;font-size:15px;line-height:1.65;">{body_html}</div>
    <div style="padding:16px 24px;background:#fafafb;color:#6b6b72;font-size:12px;border-top:1px solid #eee;">
      {htmllib.escape(footer)}
    </div>
  </div>
</div>"""


def send_via_graph(org, to: str, subject: str, body: str, html: bool = False,
                   attachments: list[dict] | None = None) -> None:
    """Sendet eine Mail über das verbundene Microsoft-Konto der Organisation.
    attachments: Liste von {name, contentType, contentBytes(base64)}."""
    if not org or not org.ms_refresh_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kein Microsoft-Konto verbunden.")
    access = _access_token(decrypt(org.ms_refresh_token))
    message: dict = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML" if html else "Text", "content": body},
            "toRecipients": [{"emailAddress": {"address": to}}],
        },
        "saveToSentItems": True,
    }
    if attachments:
        message["message"]["attachments"] = [{
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": a["name"], "contentType": a.get("contentType", "application/octet-stream"),
            "contentBytes": a["contentBytes"],
        } for a in attachments]
    resp = httpx.post("https://graph.microsoft.com/v1.0/me/sendMail",
                      headers={"Authorization": f"Bearer {access}"}, json=message, timeout=30)
    if resp.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Versand fehlgeschlagen: {resp.text[:200]}")


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
def send(data: MailSend, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    # Anhänge werden nur durchgereicht (nicht gespeichert). Größe begrenzen.
    total = sum(len(a.content_bytes or "") for a in data.attachments)
    if total > 18_000_000:  # ~13 MB nach Base64-Dekodierung
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anhänge zu groß (max. ca. 13 MB gesamt).")
    attachments = [{"name": a.name[:255], "contentType": a.content_type or "application/octet-stream",
                    "contentBytes": a.content_bytes} for a in data.attachments if a.content_bytes]
    send_via_graph(org, data.to, data.subject, render_email_html(org, data.body), html=True,
                   attachments=attachments or None)
    return {"ok": True}


@router.get("/preview")
def preview(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Gerenderte Design-Mail als HTML (für die Vorschau im Tool)."""
    org = db.get(Organization, user.organization_id)
    body = ("Hallo,\n\ndies ist eine Beispiel-Nachricht. So sehen deine E-Mails "
            "aus dem Tool aus – mit Logo, Farben und Footer.\n\nBeste Grüße")
    return {"html": render_email_html(org, body)}


@router.post("/test")
def test_mail(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Sendet eine gebrandete Testmail an die verbundene Adresse."""
    org = db.get(Organization, user.organization_id)
    to = org.ms_email
    if not to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keine verbundene Adresse gefunden.")
    body = ("Hallo,\n\ndies ist eine Testmail aus deiner Plattform. "
            "Wenn du sie im Posteingang siehst, ist der Mailversand über dein "
            "Microsoft-Konto korrekt eingerichtet. ✅\n\nBeste Grüße")
    send_via_graph(org, to, "Testmail · North Flow", render_email_html(org, body), html=True)
    return {"ok": True, "to": to}
