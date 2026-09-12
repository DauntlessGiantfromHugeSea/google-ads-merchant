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
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, ClientUpdate, MailMessage, MailThread, Organization, User
from app.schemas import ThreadReply, ThreadStart
from app.services import notify

from .mail import read_inbox, read_sent, render_email_html, send_via_graph

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


# ---------- Kontakt-Kanal (Portal-Verlauf) ----------
# Eigener Präfix NK- (Kontakt), damit er sich NICHT mit der Mail-Konversation (NL-)
# überschneidet. Steckt nur in der Mitteilungs-Mail an die Agentur; Antworten aus
# dem Postfach landen darüber automatisch im Verlauf des Kunden.
CONTACT_REF_PREFIX = "NK"
CONTACT_REF_RE = re.compile(r"NK-[A-Z0-9]{4,6}-[A-Z0-9]{4,6}", re.IGNORECASE)


def ensure_contact_reference(db: Session, client: Client) -> str:
    """Liefert die Kontakt-Referenz des Kunden, erzeugt sie bei Bedarf (kollisionsfrei).
    Der Aufrufer committet."""
    if client.contact_reference:
        return client.contact_reference
    for _ in range(20):
        ref = (f"{CONTACT_REF_PREFIX}-"
               f"{''.join(secrets.choice(_ALPHABET) for _ in range(5))}-"
               f"{''.join(secrets.choice(_ALPHABET) for _ in range(5))}")
        if not db.query(Client.id).filter(Client.contact_reference == ref).first():
            client.contact_reference = ref
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


def _thread_dict(t: MailThread, message_count: int | None = None, created_by_name: str = "") -> dict:
    return {
        "id": t.id, "reference": t.reference, "subject": t.subject,
        "contact_email": t.contact_email, "contact_name": t.contact_name,
        "status": t.status, "unread": t.unread, "last_direction": t.last_direction,
        "last_message_at": t.last_message_at, "client_id": t.client_id,
        "message_count": message_count, "created_by_name": created_by_name,
    }


def _creator_name(t: MailThread, db: Session) -> str:
    if not t.created_by:
        return ""
    u = db.get(User, t.created_by)
    return (u.full_name or u.email) if u else ""


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
    creator_ids = [t.created_by for t in threads if t.created_by]
    names = {u.id: (u.full_name or u.email) for u in db.query(User).filter(User.id.in_(creator_ids)).all()} \
        if creator_ids else {}
    return [_thread_dict(t, counts.get(t.id, 0), names.get(t.created_by, "")) for t in threads]


@router.get("/{thread_id}")
def get_thread(thread_id: str, user: User = Depends(require_agency),
               db: Session = Depends(get_db)) -> dict:
    t = _thread_or_404(thread_id, user, db)
    if t.unread:
        t.unread = False
        db.commit()
    msgs = db.query(MailMessage).filter(MailMessage.thread_id == t.id) \
        .order_by(MailMessage.created_at.asc()).all()
    return {**_thread_dict(t, len(msgs), _creator_name(t, db)), "messages": [_msg_dict(m) for m in msgs]}


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
    send_via_graph(org, data.to, subject, render_email_html(org, data.body, reference=ref), html=True,
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
    return _thread_dict(thread, 1, user.full_name or user.email)


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
    send_via_graph(org, t.contact_email, subject, render_email_html(org, data.body, reference=t.reference),
                   html=True, attachments=attachments or None)

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
    return _thread_dict(t, created_by_name=_creator_name(t, db))


@router.delete("/{thread_id}", status_code=204)
def delete_thread(thread_id: str, user: User = Depends(require_agency),
                  db: Session = Depends(get_db)) -> None:
    """Löscht eine Konversation samt Nachrichten. Nur wenn sie geschlossen ist –
    schützt vor versehentlichem Löschen laufender Konversationen."""
    t = _thread_or_404(thread_id, user, db)
    if t.status != "closed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Bitte die Konversation zuerst als erledigt schließen, dann löschen.")
    db.query(MailMessage).filter(MailMessage.thread_id == t.id).delete()
    db.delete(t)
    db.commit()


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
    cmap = _contact_clients(db, org)          # Kontakt-Referenz -> Kunde
    touched_contacts: dict[str, Client] = {}  # Kunden mit neuer Verlauf-Antwort
    new_count = 0
    touched: dict[str, MailThread] = {}
    for m in messages:
        subject = m.get("subject") or ""
        body_obj = m.get("body") or {}
        raw_content = body_obj.get("content", "") or m.get("bodyPreview", "")
        # Referenz zuerst im Betreff, sonst im (zitierten) Text – der Footer trägt sie.
        found = REF_RE.search(subject) or REF_RE.search(raw_content)
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
        is_html = (body_obj.get("contentType", "") or "").lower() == "html"
        text = _clean_body(raw_content, is_html)
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

    # Kontakt-Antworten (NK-Referenz) aus dem Posteingang in den Verlauf übernehmen.
    for m in messages:
        c = _import_contact_reply(db, org, m, cmap)
        if c is not None:
            touched_contacts[c.id] = c

    # Eingehende Nachrichten zuerst persistieren (+ Team benachrichtigen), damit ein
    # späterer Fehler beim Sent-Abgleich sie NICHT zurückrollt.
    if new_count:
        agency_ids = notify._agency_user_ids(db, org.id)  # noqa: SLF001
        for thread in touched.values():
            notify.notify_users(
                db, agency_ids, org_id=org.id, client_id=thread.client_id,
                type_="mail_reply", title=f"Neue Antwort: {thread.subject or thread.reference}",
                body=f"{thread.contact_name or thread.contact_email} hat geantwortet.",
                link=(f"/clients/{thread.client_id}" if thread.client_id else "/inbox"))
    db.commit()

    # Gesendete Nachrichten mitlesen – auch die, die direkt in Outlook geschrieben
    # wurden. Aus dem Tool gesendete Mails sind schon in der DB (ohne Graph-ID) und
    # werden über ihre Graph-ID zurückgeschrieben, damit nichts doppelt erscheint.
    try:
        _sync_sent(db, org, threads, cmap, touched_contacts)
        db.commit()
    except Exception:  # Postfach ohne Sent-Zugriff darf den Abgleich nicht stoppen
        db.rollback()

    # Kunden über neue Verlauf-Antworten informieren (In-App + optional E-Mail).
    try:
        _notify_contact_clients(db, org, touched_contacts)
    except Exception:
        db.rollback()

    return new_count


def _sync_sent(db: Session, org: Organization, threads: dict,
               cmap: dict | None = None, touched_contacts: dict | None = None) -> None:
    """Ordnet gesendete Mails (auch aus Outlook) den Konversationen zu.
    Tool-Mails bekommen ihre Graph-ID nachgetragen (Dedupe), unbekannte
    Outlook-Mails werden als ausgehende Nachricht ergänzt. Antworten auf
    Kontakt-Mitteilungen (NK-Referenz), die direkt aus dem Postfach geschrieben
    wurden, landen im Verlauf des Kunden."""
    for m in read_sent(org, top=50):
        subject = m.get("subject") or ""
        body_obj = m.get("body") or {}
        raw_content = body_obj.get("content", "") or m.get("bodyPreview", "")
        if cmap is not None:
            c = _import_contact_reply(db, org, m, cmap)
            if c is not None:
                if touched_contacts is not None:
                    touched_contacts[c.id] = c
                continue
        found = REF_RE.search(subject) or REF_RE.search(raw_content)
        if not found:
            continue
        thread = threads.get(found.group(0).upper())
        if not thread:
            continue
        gid = m.get("id") or ""
        if gid and db.query(MailMessage.id).filter(MailMessage.graph_message_id == gid).first():
            continue  # schon bekannt
        sent_at = _parse_dt(m.get("sentDateTime"))
        # Tool-Mail ohne Graph-ID, zeitnah? -> dann ist das ihre Sent-Kopie: ID nachtragen.
        window = timedelta(minutes=15)
        cand = (db.query(MailMessage)
                .filter(MailMessage.thread_id == thread.id, MailMessage.direction == "out",
                        MailMessage.graph_message_id == "")
                .order_by(MailMessage.created_at.desc()).all())
        match = None
        for c in cand:
            created = c.created_at if c.created_at and c.created_at.tzinfo else (
                c.created_at.replace(tzinfo=timezone.utc) if c.created_at else None)
            if created and abs((created - sent_at).total_seconds()) <= window.total_seconds():
                match = c
                break
        if match is not None:
            match.graph_message_id = gid
            continue
        # Unbekannte, direkt in Outlook gesendete Mail -> als ausgehende Nachricht ergänzen.
        recips = m.get("toRecipients") or []
        to_email = (((recips[0] or {}).get("emailAddress") or {}).get("address", "")
                    if recips else thread.contact_email)
        is_html = (body_obj.get("contentType", "") or "").lower() == "html"
        db.add(MailMessage(
            thread_id=thread.id, organization_id=org.id, direction="out",
            from_email=org.ms_email or "", to_email=to_email, subject=subject,
            body=_clean_body(raw_content, is_html), author="(direkt aus Outlook)",
            graph_message_id=gid, created_at=sent_at))
        last = thread.last_message_at
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if last is None or sent_at > last:
            thread.last_message_at = sent_at
            thread.last_direction = "out"


def _contact_clients(db: Session, org: Organization) -> dict:
    """Referenz (NK-...) -> Kunde dieser Organisation."""
    return {c.contact_reference: c for c in db.query(Client).filter(
        Client.organization_id == org.id, Client.contact_reference != "").all()}


def _import_contact_reply(db: Session, org: Organization, m: dict, cmap: dict) -> Client | None:
    """Importiert eine Postfach-ANTWORT (Re:/Aw:) mit NK-Referenz als Eintrag in den
    Verlauf des zugehörigen Kunden. Die ursprüngliche Mitteilungs-Mail (ohne Re:)
    wird bewusst ignoriert. Doppelte werden über die Graph-ID vermieden.
    Gibt den betroffenen Kunden zurück (für die Benachrichtigung) oder None."""
    subject = m.get("subject") or ""
    body_obj = m.get("body") or {}
    raw = body_obj.get("content", "") or m.get("bodyPreview", "")
    found = CONTACT_REF_RE.search(subject) or CONTACT_REF_RE.search(raw)
    if not found:
        return None
    if not subject.strip().lower().startswith(("re:", "aw:")):
        return None  # nur echte Antworten, nicht die Ausgangs-Mitteilung
    client = cmap.get(found.group(0).upper())
    if not client:
        return None
    gid = m.get("id") or ""
    if gid and db.query(ClientUpdate.id).filter(ClientUpdate.ext_message_id == gid).first():
        return None
    is_html = (body_obj.get("contentType", "") or "").lower() == "html"
    text = _clean_body(raw, is_html)
    if not text.strip():
        return None
    addr = ((m.get("from") or {}).get("emailAddress") or {})
    author = addr.get("name") or addr.get("address") or (org.name or "Agentur")
    when = _parse_dt(m.get("receivedDateTime") or m.get("sentDateTime"))
    db.add(ClientUpdate(client_id=client.id, title="", body=text, category="message",
                        author_name=author, ext_message_id=gid, created_at=when))
    return client


def _notify_contact_clients(db: Session, org: Organization, clients: dict) -> None:
    """In-App-Hinweis + (falls erlaubt) E-Mail an die Kunden-Logins, dass eine neue
    Antwort im Verlauf liegt. Inhalt kommt NICHT per Mail – der Kunde meldet sich an."""
    if not clients:
        return
    from app.config import get_settings  # noqa: PLC0415
    base = get_settings().public_base_url.rstrip("/")
    for client in clients.values():
        notify.notify_client_users(
            db, client.id, org_id=org.id, type_="message",
            title=f"Neue Nachricht von {org.name or 'der Agentur'}",
            body="Es liegt eine neue Nachricht in deinem Portal.",
            link=f"/clients/{client.id}")
    db.commit()
    # E-Mail nur an Kunden-Logins, die das aktiviert haben.
    for client in clients.values():
        recips = db.query(User).filter(
            User.client_id == client.id, User.is_active.is_(True),
            User.notify_contact_email.is_(True)).all()
        for u in recips:
            if not u.email:
                continue
            body = (f"Hallo,\n\ndu hast eine neue Nachricht von {org.name or 'deiner Agentur'} "
                    f"in deinem Portal.\n\nBitte melde dich an, um sie zu lesen und zu "
                    f"antworten:\n{base}/clients/{client.id}\n\nBeste Grüße")
            try:
                send_via_graph(org, u.email, f"Neue Nachricht von {org.name or 'deiner Agentur'}",
                               render_email_html(org, body), html=True)
            except Exception:
                pass


def email_contact_to_agency(org_id: str, client_id: str, ref: str, author: str, text: str) -> None:
    """Mitteilungs-Mail an die Agentur, wenn ein Kunde im Portal schreibt – mit
    NK-Referenz, damit eine Antwort aus dem Postfach im Verlauf landet.
    Läuft im Hintergrund mit eigener Session."""
    from app.database import SessionLocal  # noqa: PLC0415
    db = SessionLocal()
    try:
        org = db.get(Organization, org_id)
        client = db.get(Client, client_id)
        if not org or not org.ms_refresh_token or not client:
            return
        admins = notify._agency_admin_ids(db, org_id)  # noqa: SLF001
        emails = [u.email for u in db.query(User).filter(User.id.in_(admins)).all() if u.email]
        if not emails:
            return
        subj = _subject_with_ref(f"Nachricht von {client.name}", ref)
        body = (f"{author} hat dir über das Portal geschrieben:\n\n{text}\n\n"
                f"Antworte einfach direkt auf diese E-Mail – deine Antwort erscheint "
                f"automatisch im Verlauf von {client.name}.")
        html = render_email_html(org, body, reference=ref)
        for to in emails:
            try:
                send_via_graph(org, to, subj, html, html=True, reply_to=org.ms_email or "")
            except Exception:
                pass
    finally:
        db.close()


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
