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

# Scopes getrennt halten: Beim Verbinden (Zustimmung) fragen wir ALLES an,
# beim Token-Refresh nur so viel, wie für die jeweilige Aktion nötig ist.
# So bricht der Versand NICHT, wenn ein bestehendes Konto Mail.Read noch nicht
# zugestimmt hat (dann funktioniert nur der Posteingang-Abgleich noch nicht).
_SCOPE_BASE = "offline_access openid email profile User.Read"
SCOPE_SEND = f"{_SCOPE_BASE} Mail.Send"
SCOPE_FULL = f"{_SCOPE_BASE} Mail.Send Mail.Read"
SCOPE = SCOPE_FULL  # für Authorize/Callback (Zustimmung zu Senden + Lesen)


def _cfg() -> bool:
    return bool(settings.microsoft_client_id and settings.microsoft_client_secret)


def _redirect_uri() -> str:
    return f"{settings.public_base_url.rstrip('/')}/api/mail/callback"


def _token_url() -> str:
    return f"https://login.microsoftonline.com/{settings.microsoft_tenant}/oauth2/v2.0/token"


def _access_token(refresh_token: str, scope: str = SCOPE_SEND) -> str:
    """Holt frisch einen Access-Token per Refresh-Token. Fehler werden als
    saubere HTTPException gemeldet (kein 500). `scope` bestimmt, welche
    Berechtigung angefragt wird – Versand braucht nur Mail.Send."""
    try:
        r = httpx.post(_token_url(), data={
            "client_id": settings.microsoft_client_id,
            "client_secret": settings.microsoft_client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "scope": scope,
        }, timeout=20)
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            f"Microsoft nicht erreichbar: {exc}") from exc
    if r.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            f"Microsoft-Anmeldung abgelaufen – bitte Konto neu verbinden. ({r.text[:150]})")
    token = r.json().get("access_token")
    if not token:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Kein Access-Token von Microsoft erhalten.")
    return token


def render_email_html(org, body_text: str, reference: str = "", logo_url: str = "") -> str:
    """Verpackt Text in eine gebrandete HTML-Mail (Logo, Farben, Footer).
    reference: optionale Konversations-Referenz – wird sichtbar in den Footer
    gesetzt, damit sie beim Antworten erhalten bleibt (Zuordnung).
    logo_url: überschreibt das Standard-Logo (z. B. Kundenlogo der Bestätigung)."""
    logo = logo_url or f"{settings.public_base_url.rstrip('/')}/api/branding/logo"
    body_html = htmllib.escape(body_text).replace("\n", "<br>")
    name = getattr(org, "agency_contact_name", "") or getattr(org, "name", "") or ""
    email = getattr(org, "agency_contact_email", "") or getattr(org, "ms_email", "") or ""
    phone = getattr(org, "agency_contact_phone", "") or ""
    footer_parts = [p for p in [name, email, phone] if p]
    footer = " · ".join(footer_parts)
    ref_block = ""
    if reference:
        ref_block = (
            f'<div style="margin-top:10px;padding-top:10px;border-top:1px solid #eee;'
            f'color:#9aa0a6;font-size:11px;">Referenz <strong>{htmllib.escape(reference)}</strong>'
            f' · Bitte lass diese Nummer beim Antworten stehen, damit wir deine Antwort'
            f' automatisch zuordnen können.</div>')
    return f"""\
<div style="background:#f1f2f6;padding:24px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8ee;">
    <div style="background:linear-gradient(120deg,#14b8a6,#7c3aed);padding:22px 24px;text-align:center;">
      <img src="{logo}" alt="" style="max-height:42px;max-width:220px;"/>
    </div>
    <div style="padding:26px 24px;color:#15161a;font-size:15px;line-height:1.65;">{body_html}</div>
    <div style="padding:16px 24px;background:#fafafb;color:#6b6b72;font-size:12px;border-top:1px solid #eee;">
      {htmllib.escape(footer)}{ref_block}
    </div>
  </div>
</div>"""


def send_via_graph(org, to: str, subject: str, body: str, html: bool = False,
                   attachments: list[dict] | None = None,
                   from_addr: str = "", reply_to: str = "") -> None:
    """Sendet eine Mail über das verbundene Microsoft-Konto der Organisation.
    attachments: Liste von {name, contentType, contentBytes(base64)}.
    from_addr: abweichende Absenderadresse (nur mit „Senden als"-Recht in M365,
    sonst lehnt Exchange ab). reply_to: Antwortadresse (immer erlaubt)."""
    if not org or not org.ms_refresh_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kein Microsoft-Konto verbunden.")
    access = _access_token(decrypt(org.ms_refresh_token))
    msg: dict = {
        "subject": subject,
        "body": {"contentType": "HTML" if html else "Text", "content": body},
        "toRecipients": [{"emailAddress": {"address": to}}],
    }
    if from_addr:
        msg["from"] = {"emailAddress": {"address": from_addr}}
    if reply_to:
        msg["replyTo"] = [{"emailAddress": {"address": reply_to}}]
    if attachments:
        msg["attachments"] = [{
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": a["name"], "contentType": a.get("contentType", "application/octet-stream"),
            "contentBytes": a["contentBytes"],
        } for a in attachments]
    resp = httpx.post("https://graph.microsoft.com/v1.0/me/sendMail",
                      headers={"Authorization": f"Bearer {access}"},
                      json={"message": msg, "saveToSentItems": True}, timeout=30)
    if resp.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Versand fehlgeschlagen: {resp.text[:200]}")


def _read_folder(org, folder: str, order_field: str, select: str, top: int) -> list[dict]:
    """Liest Nachrichten eines Postfach-Ordners (inbox/sentitems) via Graph.
    Benötigt Mail.Read (nach Scope-Erweiterung ggf. neu verbinden)."""
    if not org or not org.ms_refresh_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kein Microsoft-Konto verbunden.")
    try:
        access = _access_token(decrypt(org.ms_refresh_token), SCOPE_FULL)
    except HTTPException as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Für den Posteingang-Abgleich fehlt die Leseberechtigung. Bitte das "
                            "Microsoft-Konto in den Einstellungen einmal neu verbinden (Mail.Read).") from exc
    url = (f"https://graph.microsoft.com/v1.0/me/mailFolders/{folder}/messages"
           f"?$top={min(top, 100)}&$orderby={order_field} desc&$select={select}")
    resp = httpx.get(url, headers={"Authorization": f"Bearer {access}"}, timeout=30)
    if resp.status_code == 403:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Kein Lesezugriff auf das Postfach. Bitte Microsoft-Konto in den "
                            "Einstellungen neu verbinden (Berechtigung Mail.Read).")
    if resp.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Abruf fehlgeschlagen: {resp.text[:200]}")
    return resp.json().get("value", [])


def read_inbox(org, top: int = 50) -> list[dict]:
    """Eingehende Nachrichten (Posteingang)."""
    return _read_folder(org, "inbox", "receivedDateTime",
                        "id,subject,from,receivedDateTime,body,bodyPreview,conversationId", top)


def read_sent(org, top: int = 50) -> list[dict]:
    """Gesendete Nachrichten (auch die direkt in Outlook geschriebenen)."""
    return _read_folder(org, "sentitems", "sentDateTime",
                        "id,subject,toRecipients,sentDateTime,body,bodyPreview,conversationId", top)


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
