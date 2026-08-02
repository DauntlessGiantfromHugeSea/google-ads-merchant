"""Projekt-Dokumentation je Kunde: feste Abschnitts-Boxen (inkl. aktuellem
Arbeitsstand) + Arbeitsprotokoll ("was wurde gemacht"). Beides als PDF."""
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import Organization, ProjectDoc, User
from app.schemas import ProjectDocIn, ProjectDocOut
from app.services import pdf

router = APIRouter(prefix="/api/clients/{client_id}/projectdoc", tags=["projectdoc"])

# Feste Abschnitts-Boxen (Reihenfolge + Beschriftung). Auch im Frontend gespiegelt.
SECTIONS = [
    ("uebersicht", "Projektübersicht"),
    ("ziele", "Ziele & Zweck"),
    ("umfang", "Umfang / Leistungen"),
    ("technik", "Technisches Setup"),
    ("vorgehen", "Vorgehen / Meilensteine"),
    ("entscheidungen", "Wichtige Entscheidungen"),
    ("arbeitsstand", "Aktueller Arbeitsstand"),
    ("offen", "Offene Punkte"),
    ("uebergabe", "Übergabe / Wartung"),
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
    doc.log = payload.log or []
    doc.status = (payload.status or "")[:40]
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return ProjectDocOut(sections=doc.sections or {}, log=doc.log or [], status=doc.status,
                         updated_at=doc.updated_at)


@router.get("/pdf")
def doc_pdf(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    secs = doc.sections or {}
    payload = {
        "client_name": client.name, "status": doc.status,
        "sections": [{"id": sid, "label": label, "text": secs.get(sid, "")}
                     for sid, label in SECTIONS if (secs.get(sid, "") or "").strip()],
    }
    data = pdf.render_projectdoc_pdf(payload, _tz(user, db))
    fn = f"Projekt-Doku-{client.name}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.get("/worklog.pdf")
def worklog_pdf(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    doc = _get_or_create(client_id, user.organization_id, db)
    entries = sorted([e for e in (doc.log or []) if isinstance(e, dict)],
                     key=lambda e: e.get("date", ""))
    payload = {"client_name": client.name, "entries": entries}
    data = pdf.render_worklog_pdf(payload, _tz(user, db))
    fn = f"Arbeitsnachweis-{client.name}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})
