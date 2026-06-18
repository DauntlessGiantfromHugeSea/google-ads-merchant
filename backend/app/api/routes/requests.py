"""Passwort-Anforderung: öffentlicher Link zum Einreichen von Geheimnissen.

Die Agentur erstellt (eingeloggt) einen Link. Dritte reichen ohne Login ein;
die Einreichung wird serverseitig verschlüsselt (Fernet) gespeichert. Nur die
erstellende Organisation kann die Einreichungen entschlüsselt einsehen.
"""
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.core.crypto import decrypt, encrypt
from app.database import get_db
from app.models import SecretRequest, SecretSubmission, User
from app.schemas import (
    RequestCreate,
    RequestOut,
    RequestPublicOut,
    SubmissionCreate,
    SubmissionOut,
)

router = APIRouter(prefix="/api/requests", tags=["requests"])
_MAX_SECRET = 8000  # Zeichen


def _expired(req: SecretRequest) -> bool:
    if req.expires_at is None:
        return False
    exp = req.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)


def _count(db: Session, rid: str) -> int:
    return db.query(SecretSubmission).filter(SecretSubmission.request_id == rid).count()


@router.post("", response_model=RequestOut, status_code=201)
def create_request(data: RequestCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    ttl = max(1, min(2160, data.ttl_hours))  # bis 90 Tage
    rid = pysecrets.token_urlsafe(20)
    req = SecretRequest(
        id=rid, label=data.label[:255], created_by=user.full_name or user.email,
        organization_id=user.organization_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return RequestOut(id=req.id, label=req.label, created_by=req.created_by,
                      created_at=req.created_at, expires_at=req.expires_at, submission_count=0)


@router.get("", response_model=list[RequestOut])
def list_requests(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    reqs = (db.query(SecretRequest)
            .filter(SecretRequest.organization_id == user.organization_id)
            .order_by(SecretRequest.created_at.desc()).all())
    return [RequestOut(id=r.id, label=r.label, created_by=r.created_by, created_at=r.created_at,
                       expires_at=r.expires_at, submission_count=_count(db, r.id)) for r in reqs]


def _owned(db: Session, rid: str, user: User) -> SecretRequest:
    req = db.get(SecretRequest, rid)
    if not req or req.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anforderung nicht gefunden")
    return req


@router.get("/{rid}/submissions", response_model=list[SubmissionOut])
def list_submissions(rid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, rid, user)
    subs = (db.query(SecretSubmission).filter(SecretSubmission.request_id == rid)
            .order_by(SecretSubmission.created_at.desc()).all())
    return [SubmissionOut(id=s.id, secret=decrypt(s.ciphertext), note=s.note, created_at=s.created_at)
            for s in subs]


@router.delete("/{rid}/submissions/{sid}", status_code=204)
def delete_submission(rid: str, sid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, rid, user)
    sub = db.get(SecretSubmission, sid)
    if sub and sub.request_id == rid:
        db.delete(sub)
        db.commit()


@router.delete("/{rid}", status_code=204)
def delete_request(rid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _owned(db, rid, user)
    db.query(SecretSubmission).filter(SecretSubmission.request_id == rid).delete()
    db.query(SecretRequest).filter(SecretRequest.id == rid).delete()
    db.commit()


# --- Öffentlich (kein Login) ---
@router.get("/{rid}/public", response_model=RequestPublicOut)
def request_public(rid: str, db: Session = Depends(get_db)):
    req = db.get(SecretRequest, rid)
    if not req or _expired(req):
        raise HTTPException(status.HTTP_410_GONE, "Dieser Anforderungs-Link ist abgelaufen oder existiert nicht.")
    return RequestPublicOut(id=req.id, label=req.label)


@router.post("/{rid}/submit", status_code=201)
def submit_secret(rid: str, data: SubmissionCreate, db: Session = Depends(get_db)) -> dict:
    req = db.get(SecretRequest, rid)
    if not req or _expired(req):
        raise HTTPException(status.HTTP_410_GONE, "Dieser Anforderungs-Link ist abgelaufen oder existiert nicht.")
    if not data.secret.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leeres Geheimnis")
    if len(data.secret) > _MAX_SECRET:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zu lang")
    sub = SecretSubmission(request_id=rid, ciphertext=encrypt(data.secret), note=data.note[:255])
    db.add(sub)
    db.commit()
    return {"ok": True}
