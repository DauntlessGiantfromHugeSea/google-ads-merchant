"""Team-Verwaltung: Agentur-Mitarbeiter einladen/auflisten/entfernen."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_agency
from app.core.security import hash_password
from app.database import get_db
from app.models import User, UserRole
from app.schemas import TeamInvite, UserOut

router = APIRouter(prefix="/api/team", tags=["team"])


@router.get("", response_model=list[UserOut])
def list_team(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    return (db.query(User).filter(
        User.organization_id == user.organization_id,
        User.role != UserRole.client_user,
    ).all())


@router.post("/invite", response_model=UserOut, status_code=201)
def invite_member(data: TeamInvite, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Legt einen Agentur-Mitarbeiter (Rolle agency_member) an."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "E-Mail bereits registriert")
    member = User(
        email=data.email, full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=UserRole.agency_member, organization_id=user.organization_id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{user_id}", status_code=204)
def remove_member(user_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sich selbst kann man nicht entfernen")
    member = db.get(User, user_id)
    if member and member.organization_id == user.organization_id and member.role != UserRole.client_user:
        db.delete(member)
        db.commit()
