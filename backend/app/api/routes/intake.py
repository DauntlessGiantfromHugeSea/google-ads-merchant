"""Kundendaten-Formular (Intake): öffentlicher Link zum Erfassen von
Rechnungs- und Stammdaten. Die Agentur übernimmt Einreichungen als Kunde."""
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.database import get_db
from app.models import Client, IntakeForm, IntakeSubmission, User
from app.schemas import (
    IntakeCreate,
    IntakeFormOut,
    IntakePublicOut,
    IntakeSubmissionOut,
    IntakeSubmit,
)

router = APIRouter(prefix="/api/intake", tags=["intake"])


def _expired(form: IntakeForm) -> bool:
    if form.expires_at is None:
        return False
    exp = form.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)


def _count(db: Session, fid: str) -> int:
    return db.query(IntakeSubmission).filter(IntakeSubmission.form_id == fid).count()


def _owned(db: Session, fid: str, user: User) -> IntakeForm:
    form = db.get(IntakeForm, fid)
    if not form or form.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Formular nicht gefunden")
    return form


@router.post("", response_model=IntakeFormOut, status_code=201)
def create_form(data: IntakeCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    if data.client_id:
        c = db.get(Client, data.client_id)
        if not c or c.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kunde nicht gefunden")
    ttl = max(1, min(4320, data.ttl_hours))
    fid = pysecrets.token_urlsafe(18)
    form = IntakeForm(
        id=fid, organization_id=user.organization_id, client_id=data.client_id,
        label=data.label[:255], created_by=user.full_name or user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl),
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return IntakeFormOut(id=form.id, label=form.label, client_id=form.client_id,
                         created_by=form.created_by, created_at=form.created_at,
                         expires_at=form.expires_at, submission_count=0)


@router.get("", response_model=list[IntakeFormOut])
def list_forms(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    forms = (db.query(IntakeForm).filter(IntakeForm.organization_id == user.organization_id)
             .order_by(IntakeForm.created_at.desc()).all())
    return [IntakeFormOut(id=f.id, label=f.label, client_id=f.client_id, created_by=f.created_by,
                          created_at=f.created_at, expires_at=f.expires_at,
                          submission_count=_count(db, f.id)) for f in forms]


@router.get("/{fid}/submissions", response_model=list[IntakeSubmissionOut])
def list_submissions(fid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, fid, user)
    subs = (db.query(IntakeSubmission).filter(IntakeSubmission.form_id == fid)
            .order_by(IntakeSubmission.created_at.desc()).all())
    return [IntakeSubmissionOut(id=s.id, data=s.data or {}, applied=s.applied, created_at=s.created_at)
            for s in subs]


@router.post("/{fid}/submissions/{sid}/apply")
def apply_submission(fid: str, sid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    """Übernimmt die eingereichten Daten: aktualisiert den verknüpften Kunden
    oder legt einen neuen Kunden an."""
    form = _owned(db, fid, user)
    sub = db.get(IntakeSubmission, sid)
    if not sub or sub.form_id != fid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Einreichung nicht gefunden")
    d = sub.data or {}

    if form.client_id:
        client = db.get(Client, form.client_id)
        if not client:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Verknüpfter Kunde fehlt")
    else:
        name = d.get("company") or d.get("contact_person") or "Neuer Kunde"
        client = Client(name=name, organization_id=user.organization_id)
        db.add(client)
        db.flush()

    # Felder übernehmen (nur nicht-leere)
    mapping = {
        "company": "company", "contact_person": "contact_person", "email": "contact_email",
        "phone": "phone", "website": "website", "billing_address": "billing_address",
        "vat_id": "vat_id", "billing_email": "billing_email",
    }
    for src, dst in mapping.items():
        if d.get(src):
            setattr(client, dst, d[src])
    if d.get("notes"):
        client.notes = (client.notes + "\n" if client.notes else "") + d["notes"]

    sub.applied = True
    db.commit()
    return {"client_id": client.id}


@router.delete("/{fid}/submissions/{sid}", status_code=204)
def delete_submission(fid: str, sid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, fid, user)
    sub = db.get(IntakeSubmission, sid)
    if sub and sub.form_id == fid:
        db.delete(sub)
        db.commit()


@router.delete("/{fid}", status_code=204)
def delete_form(fid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, fid, user)
    db.query(IntakeSubmission).filter(IntakeSubmission.form_id == fid).delete()
    db.query(IntakeForm).filter(IntakeForm.id == fid).delete()
    db.commit()


# --- Öffentlich ---
@router.get("/{fid}/public", response_model=IntakePublicOut)
def form_public(fid: str, db: Session = Depends(get_db)):
    form = db.get(IntakeForm, fid)
    if not form or _expired(form):
        raise HTTPException(status.HTTP_410_GONE, "Dieses Formular ist abgelaufen oder existiert nicht.")
    return IntakePublicOut(id=form.id, label=form.label)


@router.post("/{fid}/submit", status_code=201)
def submit_form(fid: str, data: IntakeSubmit, db: Session = Depends(get_db)) -> dict:
    form = db.get(IntakeForm, fid)
    if not form or _expired(form):
        raise HTTPException(status.HTTP_410_GONE, "Dieses Formular ist abgelaufen oder existiert nicht.")
    sub = IntakeSubmission(form_id=fid, data=data.model_dump())
    db.add(sub)
    db.commit()
    return {"ok": True}
