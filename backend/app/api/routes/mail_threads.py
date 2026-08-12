"""E-Mail-Konversationen (Ticket-artig) über das verbundene Microsoft-Konto.

Jede Konversation bekommt eine eindeutige, zufällige Referenz (z. B.
NF-7QK4T-9ZM2P). Diese wird im Betreff mitgeschickt: ``... [NF-7QK4T-9ZM2P]``.
Antwortet der Kunde (Betreff bleibt erhalten), lässt sich die Nachricht beim
Posteingang-Abgleich anhand der Referenz automatisch der richtigen
Konversation zuordnen. So sieht die Agentur den ganzen Verlauf im Tool und
kann direkt daraus antworten.
"""
import html as htmllib
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import MailMessage, MailThread, Organization, User
from app.schemas import ThreadReply, ThreadStart
from app.services import notify

from .mail import read_inbox, render_email_html, send_via_graph

router = APIRouter(prefix="/api/mail/threads", tags=["mail-threads"])

REF_PREFIX = "NL"
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # ohne 0/O/1/I – gut vorlesbar
# Muster im Betreff, z. B. [NL-7QK4T-9ZM2P] – NF bleibt für Alt-Referenzen gültig.
REF_RE = re.compile(r"N[LF]-[A-Z0-9]{4,6}-[A-Z0-9]{4,6}", re.IGNORECASE)
_MAX_ATT = 18_000_000  # ~13 MB nach Base64-Dekodierung


def _new_reference(db: Session) -> str:
    """Erzeugt eine zufällige, kollisionsfreie Referenz NF-XXXXX-XXXXX."""
    for _ in range(20):
        ref = (f"{REF_PREFIX}-"
               f"{''.join(secrets.choice(_ALPHABET) for _ in range(5))}-"
               f"{''.join(secrets.choice(_ALPHABET) for _ in range(5))}")
        if not db.query(MailThread.id).filter(MailThread.reference == ref).first():
            return ref
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Referenz konnte nicht erzeugt werden.")


def _subject_with_ref(subject: str, ref: str, reply: bool = False) -> str:
    subject = (subject or "").strip() or "Nachricht"
    if reply and not subject.lower().startswith(("re:", "aw:")):
        subject = f"Re: {subject}"
    tag = f"[{ref}]"
    return subject if tag in subject else f"{subject} {tag}"


def _clean_body(raw: str, is_html: bool) -> str:
    """HTML grob zu Text und zitierten Verlauf (Outlook/Reply) abschneiden."""
    text = raw or ""
    if is_html:
        text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", text)
        text = re.sub(r"(?i)<br\s*/?>", "\n", text)
        text = re.sub(r"(?i)</p>", "\n\n", text)
        text = re.sub(r"<[^>]+>", "", text)
        text = htmllib.unescape(text)
    lines = text.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    for line in lines:
        s = line.strip()
        # Beginn des zitierten Verlaufs -> Rest verwerfen.
        if re.match(r"^_{5,}$", s) or s.startswith(("Von:", "From:", "Gesendet:", "Sent:")) \
                or re.match(r"^-{2,}\s*(Ursprüngliche|Original)", s, re.IGNORECASE) \
                or re.match(r"^Am .+ schrieb .+:$", s) or re.match(r"^On .+ wrote:$", s):
            break
        out.append(line.rstrip())
    cleaned = "\n".join(out).strip()
    # Mehrfache Leerzeilen zusammenfassen.
    return re.sub(r"\n{3,}", "\n\n", cleaned) or text.strip()


def _thread_or_404(thread_id: str, user: User, db: Session) -> MailThread:
    t = db.query(MailThread).filter(
        MailThread.id == thread_id, MailThread.organization_id == user.organization_id).first()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Konversation nicht gefunden.")
    return t


def _attachments(items) -> list[dict]:
    total = sum(len(a.content_bytes or "") for a in items)
    if total > _MAX_ATT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Anhänge zu groß (max. ca. 13 MB gesamt).")
    return [{"name": a.name[:255], "contentType": a.content_type or "application/octet-stream",
             "contentBytes": a.content_bytes} for a in items if a.content_bytes]


def _thread_dict(t: MailThread, message_count: int | None = None) -> dict:
    return {
        "id": t.id, "reference": t.reference, "subject": t.subject,
        "contact_email": t.contact_email, "contact_name": t.contact_name,
        "status": t.status, "unread": t.unread, "last_direction": t.last_direction,
        "last_message_at": t.last_message_at, "client_id": t.client_id,
        "message_count": message_count,
    }


def _msg_dict(m: MailMessage) -> dict:
    return {"id": m.id, "direction": m.direction, "from_email": m.from_email,
            "to_email": m.to_email, "subject": m.subject, "body": m.body,
            "author": m.author, "created_at": m.created_at}


# ---------- Liste & Detail ----------
@router.get("")
def list_threads(client_id: str | None = None, user: User = Depends(require_agency),
                 db: Session = Depends(get_db)) -> list[dict]:
    q = db.query(MailThread).filter(MailThread.organization_id == user.organization_id)
    if client_id:
        get_scoped_client(client_id, user, db)
        q = q.filter(MailThread.client_id == client_id)
    threads = q.order_by(MailThread.last_message_at.desc()).all()
    counts = dict(db.query(MailMessage.thread_id, func.count(MailMessage.id)).filter(
        MailMessage.thread_id.in_([t.id for t in threads])).group_by(MailMessage.thread_id).all()) \
        if threads else {}
    return [_thread_dict(t, counts.get(t.id, 0)) for t in threads]


@router.get("/{thread_id}")
def get_thread(thread_id: str, user: User = Depends(require_agency),
               db: Session = Depends(get_db)) -> dict:
    t = _thread_or_404(thread_id, user, db)
    if t.unread:
        t.unread = False
        db.commit()
    msgs = db.query(MailMessage).filter(MailMessage.thread_id == t.id) \
        .order_by(MailMessage.created_at.asc()).all()
    return {**_thread_dict(t, len(msgs)), "messages": [_msg_dict(m) for m in msgs]}


# ---------- Neue Konversation starten ----------
@router.post("")
def start_thread(data: ThreadStart, user: User = Depends(require_agency),
                 db: Session = Depends(get_db)) -> dict:
    if not (data.to or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empfänger-Adresse fehlt.")
    org = db.get(Organization, user.organization_id)
    client_id = None
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
        client_id = data.client_id
    attachments = _attachments(data.attachments)

    ref = _new_reference(db)
    subject = _subject_with_ref(data.subject, ref)
    send_via_graph(org, data.to, subject, render_email_html(org, data.body), html=True,
                   attachments=attachments or None)

    now = datetime.now(timezone.utc)
    thread = MailThread(
        organization_id=org.id, client_id=client_id, created_by=user.id,
        reference=ref, subject=(data.subject or "").strip(),
        contact_email=data.to.strip(), contact_name=(data.contact_name or "").strip(),
        status="open", unread=False, last_message_at=now, last_direction="out")
    db.add(thread)
    db.flush()
    db.add(MailMessage(
        thread_id=thread.id, organization_id=org.id, direction="out",
        from_email=org.ms_email or "", to_email=data.to.strip(), subject=subject,
        body=(data.body or "").strip(), author=user.full_name or user.email, created_at=now))
    db.commit()
    db.refresh(thread)
    return _thread_dict(thread, 1)


# ---------- Antworten ----------
@router.post("/{thread_id}/reply")
def reply_thread(thread_id: str, data: ThreadReply, user: User = Depends(require_agency),
                 db: Session = Depends(get_db)) -> dict:
    t = _thread_or_404(thread_id, user, db)
    if not (data.body or "").strip() and not data.attachments:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nachricht ist leer.")
    org = db.get(Organization, user.organization_id)
    attachments = _attachments(data.attachments)
    subject = _subject_with_ref(t.subject, t.reference, reply=True)
    send_via_graph(org, t.contact_email, subject, render_email_html(org, data.body), html=True,
                   attachments=attachments or None)

    now = datetime.now(timezone.utc)
    db.add(MailMessage(
        thread_id=t.id, organization_id=org.id, direction="out",
        from_email=org.ms_email or "", to_email=t.contact_email, subject=subject,
        body=(data.body or "").strip(), author=user.full_name or user.email, created_at=now))
    t.last_message_at = now
    t.last_direction = "out"
    t.status = "open"
    db.commit()
    return get_thread(thread_id, user, db)


# ---------- Status ----------
@router.post("/{thread_id}/status")
def set_status(thread_id: str, body: dict, user: User = Depends(require_agency),
               db: Session = Depends(get_db)) -> dict:
    t = _thread_or_404(thread_id, user, db)
    st = (body.get("status") or "").strip()
    if st in ("open", "closed"):
        t.status = st
        db.commit()
    return _thread_dict(t)


# ---------- Posteingang abgleichen ----------
def sync_org_inbox(db: Session, org: Organization) -> int:
    """Gleicht das Postfach einer Organisation ab, ordnet Antworten über die
    Referenz zu und benachrichtigt das Team. Gibt die Anzahl neuer Nachrichten
    zurück. Wird vom Button UND vom Hintergrund-Job genutzt."""
    if not org or not org.ms_refresh_token:
        return 0
    messages = read_inbox(org, top=50)
    # Referenz -> Thread (nur dieser Organisation).
    threads = {t.reference: t for t in db.query(MailThread).filter(
        MailThread.organization_id == org.id).all()}
    new_count = 0
    touched: dict[str, MailThread] = {}
    for m in messages:
        subject = m.get("subject") or ""
        found = REF_RE.search(subject)
        if not found:
            continue
        ref = found.group(0).upper()
        thread = threads.get(ref)
        if not thread:
            continue
        gid = m.get("id") or ""
        if gid and db.query(MailMessage.id).filter(
                MailMessage.graph_message_id == gid).first():
            continue  # schon importiert
        addr = ((m.get("from") or {}).get("emailAddress") or {})
        from_email = addr.get("address", "")
        body_obj = m.get("body") or {}
        is_html = (body_obj.get("contentType", "") or "").lower() == "html"
        text = _clean_body(body_obj.get("content", "") or m.get("bodyPreview", ""), is_html)
        received = _parse_dt(m.get("receivedDateTime"))
        db.add(MailMessage(
            thread_id=thread.id, organization_id=org.id, direction="in",
            from_email=from_email, to_email=org.ms_email or "", subject=subject,
            body=text, author=addr.get("name", "") or from_email,
            graph_message_id=gid, created_at=received))
        thread.unread = True
        thread.status = "open"
        thread.last_message_at = received
        thread.last_direction = "in"
        touched[thread.id] = thread
        new_count += 1

    if new_count:
        agency_ids = notify._agency_user_ids(db, org.id)  # noqa: SLF001
        for thread in touched.values():
            notify.notify_users(
                db, agency_ids, org_id=org.id, client_id=thread.client_id,
                type_="mail_reply", title=f"Neue Antwort: {thread.subject or thread.reference}",
                body=f"{thread.contact_name or thread.contact_email} hat geantwortet.",
                link=(f"/clients/{thread.client_id}" if thread.client_id else "/inbox"))
        db.commit()
    return new_count


@router.post("/sync")
def sync_inbox(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    return {"new": sync_org_inbox(db, org)}


def sync_all_orgs() -> int:
    """Gleicht den Posteingang ALLER Organisationen mit verbundenem Postfach ab.
    Läuft im Hintergrund-Job (eigene Session, fehlertolerant je Organisation)."""
    from app.database import SessionLocal  # noqa: PLC0415
    db = SessionLocal()
    total = 0
    try:
        orgs = db.query(Organization).filter(
            Organization.ms_refresh_token.isnot(None),
            Organization.ms_refresh_token != "").all()
        for org in orgs:
            try:
                total += sync_org_inbox(db, org)
            except Exception:  # eine Organisation darf den Job nicht stoppen
                db.rollback()
    finally:
        db.close()
    return total


def _parse_dt(iso: str | None) -> datetime:
    if not iso:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
