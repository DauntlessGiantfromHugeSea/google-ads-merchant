"""Teilnehmermanagement: Contact-Form-7-Anmeldungen per Webhook je Kunde.

Pro Kunde freischaltbar; jeder Kunde erhält eine eigene Webhook-URL. Auf der
WordPress-Seite leitet ein CF7-Webhook-Plugin (z.B. „CF7 to Webhook"/„CF7 to
Any API") die Formulardaten als JSON oder Formular-POST an diese URL.
"""
import csv
import io
import secrets as pysecrets
import threading

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_admin
from app.config import get_settings
from app.database import get_db
from app.models import Client, Participant, User, UserRole
from app.schemas import ParticipantOut, ParticipantPatch, ParticipantsStatus
from app.services.notify import _agency_admin_ids, notify_users

settings = get_settings()
router = APIRouter(prefix="/api/clients/{client_id}/participants", tags=["participants"])
public_router = APIRouter(prefix="/api/participants", tags=["participants"])

_FORM_KEYS = ("form_name", "form", "event", "veranstaltung", "_wpcf7_unit_tag", "_wpcf7")


def _flatten(value) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value)
    return str(value)


def _looks_email(v: str) -> bool:
    return "@" in v and "." in v.rsplit("@", 1)[-1]


def _extract(data: dict) -> tuple[str, str, str]:
    """Name, E-Mail, Formularname heuristisch aus CF7-Feldern ziehen."""
    email = name = form_name = ""
    for k in _FORM_KEYS:
        if data.get(k):
            form_name = _flatten(data[k])[:255]
            break
    # E-Mail: bevorzugt Feld mit "mail" im Namen, sonst erster E-Mail-Wert.
    for k, v in data.items():
        s = _flatten(v).strip()
        if s and _looks_email(s):
            if "mail" in k.lower():
                email = s
                break
            email = email or s
    # Name: Feld mit "name", sonst erstes nicht-E-Mail-Textfeld.
    for k, v in data.items():
        if k.startswith("_"):
            continue
        s = _flatten(v).strip()
        if s and "name" in k.lower() and not _looks_email(s):
            name = s
            break
    if not name:
        for k, v in data.items():
            if k.startswith("_"):
                continue
            s = _flatten(v).strip()
            if s and not _looks_email(s) and k.lower() not in _FORM_KEYS:
                name = s
                break
    return name[:255], email[:255], form_name


def _webhook_url(request: Request, token: str) -> str:
    host = request.headers.get("host", "")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    base = f"{proto}://{host}" if host and "localhost" not in host and "127.0.0.1" not in host \
        else settings.public_base_url.rstrip("/")
    return f"{base}/api/participants/webhook/{token}"


def _count(db: Session, client_id: str) -> int:
    return db.query(Participant).filter(Participant.client_id == client_id).count()


def _forbid_member(user: User) -> None:
    """Anmeldungen sind vertraulich: nur Agentur-Admin und der Kunde, nicht
    Agentur-Mitarbeiter."""
    if user.role == UserRole.agency_member:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Anmeldungen sind nur für Admins und den Kunden sichtbar.")


def _status(client: Client, request: Request, db: Session) -> ParticipantsStatus:
    url = _webhook_url(request, client.participant_token) if client.participants_enabled and client.participant_token else ""
    return ParticipantsStatus(
        enabled=client.participants_enabled, webhook_url=url, count=_count(db, client.id),
        notify_enabled=bool(client.webhook_notify_enabled),
        notify_agency=bool(client.webhook_notify_agency),
        notify_client=bool(client.webhook_notify_client), notify_email=client.webhook_notify_email or "",
        include_fields=bool(client.webhook_include_fields), include_link=bool(client.webhook_include_link),
        confirm_enabled=bool(client.webhook_confirm_enabled),
        confirm_subject=client.webhook_confirm_subject or "",
        confirm_text=client.webhook_confirm_text or "",
        from_addr=client.webhook_from or "", has_logo=bool(client.webhook_logo_base64))


@router.get("/status", response_model=ParticipantsStatus)
def status_(client_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _forbid_member(user)
    client = get_scoped_client(client_id, user, db)
    return _status(client, request, db)


@router.post("/enable", response_model=ParticipantsStatus)
def enable(client_id: str, request: Request, data: dict, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    client.participants_enabled = bool(data.get("enabled", True))
    if client.participants_enabled and not client.participant_token:
        client.participant_token = pysecrets.token_urlsafe(24)
    db.commit()
    db.refresh(client)
    return _status(client, request, db)


@router.post("/notify", response_model=ParticipantsStatus)
def set_notify(client_id: str, request: Request, data: dict,
               user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Mail-Benachrichtigung bei neuer Webhook-Anmeldung: ob überhaupt, und
    zusätzlich an den Kunden / eine feste Adresse."""
    client = get_scoped_client(client_id, user, db)
    if "notify_enabled" in data:
        client.webhook_notify_enabled = bool(data.get("notify_enabled"))
    if "notify_agency" in data:
        client.webhook_notify_agency = bool(data.get("notify_agency"))
    client.webhook_notify_client = bool(data.get("notify_client", False))
    client.webhook_notify_email = (data.get("notify_email") or "").strip()[:255]
    if "include_fields" in data:
        client.webhook_include_fields = bool(data.get("include_fields"))
    if "include_link" in data:
        client.webhook_include_link = bool(data.get("include_link"))
    db.commit()
    db.refresh(client)
    return _status(client, request, db)


@router.post("/confirm", response_model=ParticipantsStatus)
def set_confirm(client_id: str, request: Request, data: dict,
                user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Automatische Bestätigungsmail an den Anmelder konfigurieren."""
    client = get_scoped_client(client_id, user, db)
    client.webhook_confirm_enabled = bool(data.get("confirm_enabled", False))
    client.webhook_confirm_subject = (data.get("confirm_subject") or "").strip()[:255]
    client.webhook_confirm_text = (data.get("confirm_text") or "").strip()
    client.webhook_from = (data.get("from_addr") or "").strip()[:255]
    db.commit()
    db.refresh(client)
    return _status(client, request, db)


@router.post("/confirm-logo", response_model=ParticipantsStatus)
async def upload_confirm_logo(client_id: str, request: Request,
                              user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Logo für die Bestätigungsmail dieses Kunden hochladen (Bilddatei)."""
    from base64 import b64encode  # noqa: PLC0415
    client = get_scoped_client(client_id, user, db)
    form = await request.form()
    up = form.get("file")
    if up is None or not hasattr(up, "read"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keine Datei erhalten.")
    raw = await up.read()
    if len(raw) > 2_000_000:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Logo zu groß (max. 2 MB).")
    ct = getattr(up, "content_type", "") or "image/png"
    if not ct.startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte eine Bilddatei hochladen.")
    client.webhook_logo_base64 = b64encode(raw).decode()
    client.webhook_logo_content_type = ct[:64]
    db.commit()
    db.refresh(client)
    return _status(client, request, db)


@router.delete("/confirm-logo", response_model=ParticipantsStatus)
def delete_confirm_logo(client_id: str, request: Request,
                        user: User = Depends(require_admin), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    client.webhook_logo_base64 = ""
    client.webhook_logo_content_type = ""
    db.commit()
    db.refresh(client)
    return _status(client, request, db)


@public_router.get("/confirm-logo/{client_id}")
def public_confirm_logo(client_id: str, db: Session = Depends(get_db)):
    """Öffentlich abrufbares Bestätigungs-Logo (für die Einbettung in E-Mails)."""
    from base64 import b64decode  # noqa: PLC0415
    client = db.get(Client, client_id)
    if not client or not client.webhook_logo_base64:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kein Logo")
    return StreamingResponse(io.BytesIO(b64decode(client.webhook_logo_base64)),
                             media_type=client.webhook_logo_content_type or "image/png")


@public_router.get("/confirm-banner/{client_id}")
def public_confirm_banner(client_id: str, db: Session = Depends(get_db)):
    """Öffentliches Kopf-Banner (Gradient + Kundenlogo) für die Bestätigungsmail.
    Fällt ohne Kundenlogo auf das Agentur-Logo zurück, damit der Verlauf trotzdem
    in jedem Client (inkl. Outlook) gleich aussieht."""
    from app.models import Organization  # noqa: PLC0415
    from app.services.mailbanner import build_banner  # noqa: PLC0415
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannt")
    if client.webhook_logo_base64:
        logo_b64, ct = client.webhook_logo_base64, client.webhook_logo_content_type
    else:
        org = db.get(Organization, client.organization_id)
        logo_b64, ct = (org.logo_base64, org.logo_content_type) if org else ("", "")
    png = build_banner(logo_b64 or "", ct or "")
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600"})


@router.post("/rotate", response_model=ParticipantsStatus)
def rotate(client_id: str, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Neuen Webhook-Token erzeugen (alte URL wird ungültig)."""
    client = get_scoped_client(client_id, user, db)
    client.participant_token = pysecrets.token_urlsafe(24)
    client.participants_enabled = True
    db.commit()
    db.refresh(client)
    return _status(client, request, db)


@router.get("", response_model=list[ParticipantOut])
def list_participants(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _forbid_member(user)
    get_scoped_client(client_id, user, db)
    return (db.query(Participant).filter(Participant.client_id == client_id)
            .order_by(Participant.created_at.desc()).all())


@router.patch("/{pid}", response_model=ParticipantOut)
def update_participant(client_id: str, pid: str, data: ParticipantPatch,
                       user: User = Depends(require_admin), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    p = db.get(Participant, pid)
    if not p or p.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teilnehmer nicht gefunden")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{pid}", status_code=204)
def delete_participant(client_id: str, pid: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    p = db.get(Participant, pid)
    if p and p.client_id == client_id:
        db.delete(p)
        db.commit()


def _csv_bytes(client_id: str, db: Session) -> tuple[bytes, int]:
    rows = (db.query(Participant).filter(Participant.client_id == client_id)
            .order_by(Participant.created_at.desc()).all())
    extra: list[str] = []
    for r in rows:
        for k in (r.data or {}):
            if not k.startswith("_") and k not in extra:
                extra.append(k)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Datum", "Formular", "Name", "E-Mail", "Status", *extra])
    for r in rows:
        d = r.data or {}
        w.writerow([r.created_at.strftime("%d.%m.%Y %H:%M"), r.form_name, r.name, r.email, r.status,
                    *[_flatten(d.get(k, "")) for k in extra]])
    return buf.getvalue().encode("utf-8-sig"), len(rows)


@router.get("/export.csv")
def export_csv(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _forbid_member(user)
    client = get_scoped_client(client_id, user, db)
    data, _ = _csv_bytes(client_id, db)
    fn = f"Anmeldungen-{client.name}.csv".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.post("/email-me")
def email_me(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Schickt dem angemeldeten Nutzer (Agentur ODER Kunde) die Übersicht der
    bisherigen Webhook-Anmeldungen als CSV per Mail zu."""
    _forbid_member(user)
    client = get_scoped_client(client_id, user, db)
    if not user.email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keine E-Mail-Adresse für dein Konto hinterlegt.")
    from base64 import b64encode  # noqa: PLC0415

    from app.api.routes.mail import render_email_html, send_via_graph  # noqa: PLC0415
    from app.models import Organization  # noqa: PLC0415
    org = db.get(Organization, client.organization_id)
    data, count = _csv_bytes(client_id, db)
    body = (f"Hallo,\n\nanbei die Übersicht der bisherigen Anmeldungen für {client.name} "
            f"({count} Einträge) als CSV-Datei.\n\nBeste Grüße")
    fn = f"Anmeldungen-{client.name}.csv".replace(" ", "_")
    send_via_graph(org, user.email, f"Anmeldungen: {client.name}", render_email_html(org, body), html=True,
                   attachments=[{"name": fn, "contentType": "text/csv",
                                 "contentBytes": b64encode(data).decode()}])
    return {"ok": True, "to": user.email, "count": count}


# --- Öffentlich: CF7-Webhook ---
@public_router.post("/webhook/{token}")
async def webhook(token: str, request: Request, db: Session = Depends(get_db)) -> dict:
    client = db.query(Client).filter(Client.participant_token == token).first()
    if not client or not client.participants_enabled or not token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unbekannter oder deaktivierter Webhook")
    # JSON oder Formular-POST akzeptieren.
    data: dict = {}
    try:
        data = await request.json()
    except Exception:
        try:
            form = await request.form()
            data = {k: form.getlist(k) if len(form.getlist(k)) > 1 else v for k, v in form.items()}
        except Exception:
            data = {}
    if not isinstance(data, dict):
        data = {"value": data}
    name, email, form_name = _extract(data)
    p = Participant(organization_id=client.organization_id, client_id=client.id,
                    form_name=form_name, name=name, email=email, data=data)
    db.add(p)
    mail_on = bool(client.webhook_notify_enabled)
    # In-App-Hinweis fürs Team bleibt immer; E-Mails werden separat verschickt.
    notify_users(db, _agency_admin_ids(db, client.organization_id),
                 org_id=client.organization_id, client_id=client.id,
                 type_="participant_new", title=f"Neuer Eintrag: {client.name}",
                 body=(name or email or "Neuer Eintrag")[:140], link=f"/clients/{client.id}",
                 suppress_email=True)
    db.commit()
    # Empfänger der Eingangs-Mail zusammenstellen (Agentur / Kunde / feste Adresse).
    recipients: list[str] = []
    if mail_on:
        if client.webhook_notify_agency:
            recipients += [u.email for u in db.query(User).filter(
                User.id.in_(_agency_admin_ids(db, client.organization_id))).all() if u.email]
        if client.webhook_notify_client and client.contact_email:
            recipients.append(client.contact_email)
        if client.webhook_notify_email:
            recipients.append(client.webhook_notify_email)
    if recipients:
        threading.Thread(target=_mail_new_entry, args=(
            client.organization_id, client.id, client.name, form_name, name, email, data,
            recipients, bool(client.webhook_include_fields), bool(client.webhook_include_link)),
            daemon=True).start()
    # Automatische Bestätigung an den Anmelder (eigenes Logo/Absender).
    if client.webhook_confirm_enabled and email and _looks_email(email):
        threading.Thread(target=_send_confirmation, args=(
            client.organization_id, client.id, client.name, email, name,
            client.webhook_confirm_subject, client.webhook_confirm_text,
            client.webhook_from, bool(client.webhook_logo_base64)), daemon=True).start()
    return {"ok": True}


def _send_confirmation(org_id: str, client_id: str, client_name: str, to_email: str, name: str,
                       subject: str, text: str, from_addr: str, has_logo: bool) -> None:
    """Bestätigungsmail an den Anmelder – mit Kundenlogo und Wunschabsender.
    Fällt bei fehlender „Senden als"-Berechtigung auf das verbundene Postfach
    zurück (Reply-To bleibt erhalten)."""
    from app.api.routes.mail import render_email_html, send_via_graph  # noqa: PLC0415
    from app.config import get_settings  # noqa: PLC0415
    from app.database import SessionLocal  # noqa: PLC0415
    from app.models import Organization  # noqa: PLC0415
    db = SessionLocal()
    try:
        org = db.get(Organization, org_id)
        if not org or not org.ms_refresh_token:
            return
        base = get_settings().public_base_url.rstrip("/")
        banner_url = f"{base}/api/participants/confirm-banner/{client_id}"
        subj = subject or f"Bestätigung deiner Anmeldung – {client_name}"
        hi = f"Hallo{(' ' + name) if name else ''},"
        body = text or (f"{hi}\n\nvielen Dank für deine Anmeldung bei {client_name}. "
                        f"Wir haben sie erhalten und melden uns.\n\nBeste Grüße")
        html = render_email_html(org, body, banner_url=banner_url)
        try:
            send_via_graph(org, to_email, subj, html, html=True, from_addr=from_addr, reply_to=from_addr)
        except Exception:
            try:
                send_via_graph(org, to_email, subj, html, html=True, reply_to=from_addr)
            except Exception:
                pass
    finally:
        db.close()


def _mail_new_entry(org_id: str, client_id: str, client_name: str, form_name: str, name: str,
                    email: str, data: dict, recipients: list[str],
                    include_fields: bool, include_link: bool) -> None:
    """Info-Mail „Neuer Eintrag" an die konfigurierten Empfänger (eigene Session).
    Optional mit allen Formularfeldern und dem Link zum Eintrag."""
    from app.api.routes.mail import render_email_html, send_via_graph  # noqa: PLC0415
    from app.config import get_settings  # noqa: PLC0415
    from app.database import SessionLocal  # noqa: PLC0415
    from app.models import Organization  # noqa: PLC0415
    db = SessionLocal()
    try:
        org = db.get(Organization, org_id)
        if not org or not org.ms_refresh_token:
            return
        lines = [f"Neuer Eintrag über das Formular{f' „{form_name}“' if form_name else ''} bei {client_name}."]
        base_details = " · ".join([x for x in [name, email] if x])
        if base_details:
            lines += ["", base_details]
        if include_fields:
            fields = [(k, _flatten(v)) for k, v in (data or {}).items()
                      if not k.startswith("_") and k != "form_name"]
            if fields:
                lines += [""] + [f"{k}: {v}" for k, v in fields]
        if include_link:
            base = get_settings().public_base_url.rstrip("/")
            lines += ["", f"Zum Eintrag: {base}/clients/{client_id}"]
        html = render_email_html(org, "\n".join(lines))
        for to in dict.fromkeys(r for r in recipients if r):  # dedupe, Reihenfolge wahren
            try:
                send_via_graph(org, to, f"Neuer Eintrag: {client_name}", html, html=True)
            except Exception:
                pass
    finally:
        db.close()
