"""Briefing-/Anfrageformulare: öffentlicher Link je Briefing-Art. Einreichungen
kann die Agentur mit einem Klick in ein Projekt umwandeln."""
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.data.briefing_types import BRIEFING_TYPES, label_for, project_type_for
from app.database import get_db
from app.models import BriefingForm, BriefingSubmission, Client, Project, User
from app.schemas import (
    BriefingConvert,
    BriefingCreate,
    BriefingFormOut,
    BriefingPublicOut,
    BriefingSubmissionOut,
    BriefingSubmit,
)
from app.services.notify import _agency_user_ids, notify_users

router = APIRouter(prefix="/api/briefings", tags=["briefings"])


def _expired(form: BriefingForm) -> bool:
    if form.expires_at is None:
        return False
    exp = form.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)


def _count(db: Session, fid: str) -> int:
    return db.query(BriefingSubmission).filter(BriefingSubmission.form_id == fid).count()


def _owned(db: Session, fid: str, user: User) -> BriefingForm:
    form = db.get(BriefingForm, fid)
    if not form or form.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Formular nicht gefunden")
    return form


def _form_out(form: BriefingForm, db: Session) -> BriefingFormOut:
    return BriefingFormOut(
        id=form.id, briefing_type=form.briefing_type, label=form.label, intro=form.intro,
        client_id=form.client_id, created_by=form.created_by, created_at=form.created_at,
        expires_at=form.expires_at, submission_count=_count(db, form.id))


@router.get("/types")
def briefing_types() -> list[dict]:
    return [{"key": k, "label": v[0]} for k, v in BRIEFING_TYPES.items()]


@router.post("", response_model=BriefingFormOut, status_code=201)
def create_form(data: BriefingCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    if data.briefing_type not in BRIEFING_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unbekannte Briefing-Art")
    if data.client_id:
        c = db.get(Client, data.client_id)
        if not c or c.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kunde nicht gefunden")
    ttl = max(1, min(8760, data.ttl_hours))
    form = BriefingForm(
        id=pysecrets.token_urlsafe(18), organization_id=user.organization_id, client_id=data.client_id,
        briefing_type=data.briefing_type, label=data.label[:255], intro=data.intro,
        created_by=user.full_name or user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl))
    db.add(form)
    db.commit()
    db.refresh(form)
    return _form_out(form, db)


@router.get("", response_model=list[BriefingFormOut])
def list_forms(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    forms = (db.query(BriefingForm).filter(BriefingForm.organization_id == user.organization_id)
             .order_by(BriefingForm.created_at.desc()).all())
    return [_form_out(f, db) for f in forms]


@router.get("/{fid}/submissions", response_model=list[BriefingSubmissionOut])
def list_submissions(fid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, fid, user)
    subs = (db.query(BriefingSubmission).filter(BriefingSubmission.form_id == fid)
            .order_by(BriefingSubmission.created_at.desc()).all())
    return [BriefingSubmissionOut(id=s.id, briefing_type=s.briefing_type, data=s.data or {},
                                  converted=s.converted, project_id=s.project_id, created_at=s.created_at)
            for s in subs]


@router.post("/{fid}/submissions/{sid}/convert")
def convert_submission(fid: str, sid: str, data: BriefingConvert,
                       user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    """Wandelt eine Einreichung in ein Projekt um (Ziel-Kunde: übergeben,
    sonst Formular-Kunde, sonst neuer Lead aus der Firma/dem Namen)."""
    form = _owned(db, fid, user)
    sub = db.get(BriefingSubmission, sid)
    if not sub or sub.form_id != fid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Einreichung nicht gefunden")
    if sub.converted and sub.project_id:
        return {"project_id": sub.project_id, "client_id": None, "already": True}
    d = sub.data or {}

    client_id = data.client_id or form.client_id
    if client_id:
        client = db.get(Client, client_id)
        if not client or client.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Zielkunde nicht gefunden")
    else:
        name = d.get("company") or d.get("contact_name") or "Neue Anfrage"
        client = Client(name=name, organization_id=user.organization_id, status="lead",
                        contact_person=d.get("contact_name", ""), contact_email=d.get("contact_email", ""))
        db.add(client)
        db.flush()

    tl = label_for(sub.briefing_type)
    brief_lines = [
        f"Briefing-Art: {tl}",
        f"Zielgruppe: {d.get('audience', '')}",
        f"Ziel: {d.get('goal', '')}",
        f"Format: {d.get('format', '')}",
        f"Kanal: {d.get('channel', '')}",
        f"Deadline: {d.get('deadline', '')}",
        f"Kontakt: {d.get('contact_name', '')} · {d.get('contact_email', '')}",
        "",
        d.get("details", ""),
    ]
    title = f"{tl}: {d.get('goal') or form.label or 'Anfrage'}"[:200]
    project = Project(
        client_id=client.id, title=title, type=project_type_for(sub.briefing_type),
        status="backlog", due_date=d.get("deadline", "") or "",
        brief="\n".join(brief_lines).strip(), description=d.get("goal", "")[:512])
    db.add(project)
    db.flush()
    sub.converted = True
    sub.project_id = project.id
    db.commit()
    return {"project_id": project.id, "client_id": client.id}


@router.delete("/{fid}/submissions/{sid}", status_code=204)
def delete_submission(fid: str, sid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, fid, user)
    sub = db.get(BriefingSubmission, sid)
    if sub and sub.form_id == fid:
        db.delete(sub)
        db.commit()


@router.delete("/{fid}", status_code=204)
def delete_form(fid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, fid, user)
    db.query(BriefingSubmission).filter(BriefingSubmission.form_id == fid).delete()
    db.query(BriefingForm).filter(BriefingForm.id == fid).delete()
    db.commit()


# --- Öffentlich ---
@router.get("/{fid}/public", response_model=BriefingPublicOut)
def form_public(fid: str, db: Session = Depends(get_db)):
    form = db.get(BriefingForm, fid)
    if not form or _expired(form):
        raise HTTPException(status.HTTP_410_GONE, "Dieses Formular ist abgelaufen oder existiert nicht.")
    meta = BRIEFING_TYPES.get(form.briefing_type, BRIEFING_TYPES["general"])
    return BriefingPublicOut(id=form.id, briefing_type=form.briefing_type, type_label=meta[0],
                             label=form.label, intro=form.intro, format_hint=meta[2], channel_hint=meta[3])


@router.post("/{fid}/submit", status_code=201)
def submit_form(fid: str, data: BriefingSubmit, db: Session = Depends(get_db)) -> dict:
    form = db.get(BriefingForm, fid)
    if not form or _expired(form):
        raise HTTPException(status.HTTP_410_GONE, "Dieses Formular ist abgelaufen oder existiert nicht.")
    sub = BriefingSubmission(form_id=fid, briefing_type=form.briefing_type, data=data.model_dump())
    db.add(sub)
    notify_users(db, _agency_user_ids(db, form.organization_id),
                 org_id=form.organization_id, client_id=form.client_id,
                 type_="briefing_new", title=f"Neue Anfrage: {label_for(form.briefing_type)}",
                 body=f"{data.goal or data.company or data.contact_name}"[:140], link="/forms")
    db.commit()
    return {"ok": True}
