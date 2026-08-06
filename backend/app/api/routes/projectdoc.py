"""Projekt-Doku je Kunde, zweigeteilt:
1. Interner Verlauf – ein Chat, in den das Team den Arbeitsstand schreibt.
2. Anleitung für den Kunden – tiefere, gegliederte Doku, die der Kunde am
   Ende als Bedienungs-/Wartungsanleitung bekommt (auch als PDF)."""
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Organization, ProjectDoc, User
from app.schemas import ProjectDocChat, ProjectDocIn, ProjectDocOut
from app.services import pdf, timeutil

router = APIRouter(prefix="/api/clients/{client_id}/projectdoc", tags=["projectdoc"])

# Anleitung für den Kunden – zwei Gruppen, bewusst tiefer.
SECTIONS = [
    ("ueberblick", "Überblick", "Anleitung"),
    ("ziel", "Ziel & Zielgruppe der Website", "Anleitung"),
    ("struktur", "Aufbau & Seitenstruktur", "Anleitung"),
    ("inhalte", "Inhalte selbst pflegen", "Anleitung"),
    ("aufgaben", "Häufige Aufgaben – Schritt für Schritt", "Anleitung"),
    ("medien", "Bilder & Medien", "Anleitung"),
    ("zugaenge", "Login & Zugänge", "Anleitung"),
    ("dos", "Do’s & Don’ts", "Anleitung"),
    ("support", "Support & Ansprechpartner", "Anleitung"),
    ("setup", "Setup & Hosting", "Technische Doku"),
    ("domain", "Domain, E-Mail & DNS", "Technische Doku"),
    ("stack", "Verwendete Technik / Stack", "Technische Doku"),
    ("einstellungen", "Wichtige Einstellungen", "Technische Doku"),
    ("sicherheit", "Sicherheit & Backups", "Technische Doku"),
    ("uebergabe", "Übergabe & Wartung", "Technische Doku"),
]


def _get_or_create(client_id: str, org_id: str, db: Session) -> ProjectDoc:
    doc = db.query(ProjectDoc).filter(ProjectDoc.client_id == client_id).first()
    if not doc:
        doc = ProjectDoc(organization_id=org_id, client_id=client_id, sections={}, log=[], status="")
        db.add(doc)
        db.commit()
        db.refresh(doc)
    return doc


def _tz(user: User, db: Session) -> str:
    org = db.get(Organization, user.organization_id)
    return (org.timezone if org else None) or "Europe/Berlin"


def _anleitung_sections(secs: dict) -> list[dict]:
    return [{"id": sid, "label": label, "group": group, "text": secs.get(sid, "")}
            for sid, label, group in SECTIONS if (secs.get(sid, "") or "").strip()]


# ---------- Agentur ----------
@router.get("", response_model=ProjectDocOut)
def get_doc(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    return ProjectDocOut(sections=doc.sections or {}, log=doc.log or [], status=doc.status,
                         updated_at=doc.updated_at)


@router.put("", response_model=ProjectDocOut)
def save_doc(client_id: str, payload: ProjectDocIn,
             user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    doc.sections = payload.sections or {}
    if payload.log is not None:
        doc.log = payload.log
    doc.status = (payload.status or "")[:40]
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return ProjectDocOut(sections=doc.sections or {}, log=doc.log or [], status=doc.status,
                         updated_at=doc.updated_at)


@router.post("/chat", response_model=ProjectDocOut)
def add_chat(client_id: str, msg: ProjectDocChat,
             user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Team-Nachricht in den internen Verlauf posten (Chat)."""
    get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    if (msg.text or "").strip():
        log = list(doc.log or [])
        log.append({"id": uuid.uuid4().hex, "author": user.full_name or user.email,
                    "text": msg.text.strip(), "created_at": datetime.now(timezone.utc).isoformat()})
        doc.log = log
        doc.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(doc)
    return ProjectDocOut(sections=doc.sections or {}, log=doc.log or [], status=doc.status,
                         updated_at=doc.updated_at)


@router.delete("/chat/{msg_id}", response_model=ProjectDocOut)
def del_chat(client_id: str, msg_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    doc.log = [m for m in (doc.log or []) if m.get("id") != msg_id]
    db.commit()
    db.refresh(doc)
    return ProjectDocOut(sections=doc.sections or {}, log=doc.log or [], status=doc.status,
                         updated_at=doc.updated_at)


def _anleitung_pdf(client_name: str, secs: dict, tz: str) -> bytes:
    payload = {"client_name": client_name, "title": "Anleitung",
               "sections": _anleitung_sections(secs)}
    return pdf.render_projectdoc_pdf(payload, tz)


@router.get("/pdf")
def doc_pdf(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    data = _anleitung_pdf(client.name, doc.sections or {}, _tz(user, db))
    fn = f"Anleitung-{client.name}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.get("/verlauf.pdf")
def verlauf_pdf(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    msgs = sorted([m for m in (doc.log or []) if isinstance(m, dict)], key=lambda m: m.get("created_at", ""))
    entries = [{"date": timeutil.fmt_local(_parse(m.get("created_at")), "%d.%m.%Y %H:%M", _tz(user, db)),
                "author": m.get("author", ""), "title": "", "text": m.get("text", "")} for m in msgs]
    payload = {"client_name": client.name, "entries": entries}
    data = pdf.render_worklog_pdf(payload, _tz(user, db))
    fn = f"Verlauf-{client.name}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


# ---------- Kundenportal (Anleitung, read-only) ----------
@router.get("/anleitung")
def client_anleitung(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    return {"sections": doc.sections or {}, "status": doc.status, "updated_at": doc.updated_at}


@router.get("/anleitung.pdf")
def client_anleitung_pdf(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    data = _anleitung_pdf(client.name, doc.sections or {}, _tz(user, db))
    fn = f"Anleitung-{client.name}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


def _parse(iso: str | None):
    try:
        return datetime.fromisoformat(iso) if iso else None
    except ValueError:
        return None
