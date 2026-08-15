"""Teilnehmermanagement: Contact-Form-7-Anmeldungen per Webhook je Kunde.

Pro Kunde freischaltbar; jeder Kunde erhält eine eigene Webhook-URL. Auf der
WordPress-Seite leitet ein CF7-Webhook-Plugin (z.B. „CF7 to Webhook"/„CF7 to
Any API") die Formulardaten als JSON oder Formular-POST an diese URL.
"""
import csv
import io
import secrets as pysecrets
import threading

from fastapi import APIRouter, Depends, HTTPException, Request, status
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
        notify_client=bool(client.webhook_notify_client), notify_email=client.webhook_notify_email or "")


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
    """Bei neuer Webhook-Anmeldung Mail zusätzlich an den Kunden / eine feste Adresse."""
    client = get_scoped_client(client_id, user, db)
    client.webhook_notify_client = bool(data.get("notify_client", False))
    client.webhook_notify_email = (data.get("notify_email") or "").strip()[:255]
    db.commit()
    db.refresh(client)
    return _status(client, request, db)


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


@router.get("/export.csv")
def export_csv(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _forbid_member(user)
    client = get_scoped_client(client_id, user, db)
    rows = (db.query(Participant).filter(Participant.client_id == client_id)
            .order_by(Participant.created_at.desc()).all())
    # Spalten: Basis + alle vorkommenden Datenfelder (ohne interne _-Felder)
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
    data = buf.getvalue().encode("utf-8-sig")
    fn = f"Teilnehmer-{client.name}.csv".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


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
    notify_users(db, _agency_admin_ids(db, client.organization_id),
                 org_id=client.organization_id, client_id=client.id,
                 type_="participant_new", title=f"Neue Anmeldung: {client.name}",
                 body=(name or email or "Anmeldung")[:140], link=f"/clients/{client.id}")
    db.commit()
    # Optional zusätzlich an Kunde / feste Adresse mailen (im Hintergrund).
    extra = []
    if client.webhook_notify_client and client.contact_email:
        extra.append(client.contact_email)
    if client.webhook_notify_email:
        extra.append(client.webhook_notify_email)
    if extra:
        threading.Thread(target=_mail_new_signup,
                         args=(client.organization_id, client.name, form_name, name, email, extra),
                         daemon=True).start()
    return {"ok": True}


def _mail_new_signup(org_id: str, client_name: str, form_name: str, name: str,
                     email: str, recipients: list[str]) -> None:
    """Sendet eine Info-Mail über eine neue Webhook-Anmeldung (eigene Session/Thread)."""
    from app.api.routes.mail import render_email_html, send_via_graph  # noqa: PLC0415
    from app.database import SessionLocal  # noqa: PLC0415
    from app.models import Organization  # noqa: PLC0415
    db = SessionLocal()
    try:
        org = db.get(Organization, org_id)
        if not org or not org.ms_refresh_token:
            return
        details = " · ".join([x for x in [name, email, form_name] if x]) or "Neue Anmeldung"
        body = (f"Neue Anmeldung über das Formular{f' „{form_name}“' if form_name else ''} "
                f"bei {client_name}.\n\n{details}")
        html = render_email_html(org, body)
        for to in dict.fromkeys(r for r in recipients if r):  # dedupe, Reihenfolge wahren
            try:
                send_via_graph(org, to, f"Neue Anmeldung: {client_name}", html, html=True)
            except Exception:
                pass
    finally:
        db.close()
