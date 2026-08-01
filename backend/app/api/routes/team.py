"""Team-Verwaltung: Agentur-Mitarbeiter einladen/auflisten/entfernen."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_agency
from app.core.security import hash_password, password_problem
from app.database import get_db
from app.models import User, UserRole
from app.schemas import TeamInvite, TeamRoleUpdate, UserOut

_ROLES = {"agency_member": UserRole.agency_member, "agency_admin": UserRole.agency_admin}

router = APIRouter(prefix="/api/team", tags=["team"])


@router.get("", response_model=list[UserOut])
def list_team(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    return (db.query(User).filter(
        User.organization_id == user.organization_id,
        User.role != UserRole.client_user,
    ).all())


@router.post("/invite", response_model=UserOut, status_code=201)
def invite_member(data: TeamInvite, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Legt einen Agentur-Nutzer an (Mitarbeiter oder Admin)."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "E-Mail bereits registriert")
    if (msg := password_problem(data.password)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)
    role = _ROLES.get(data.role, UserRole.agency_member)
    member = User(
        email=data.email, full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=role, organization_id=user.organization_id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.patch("/{user_id}", response_model=UserOut)
def set_role(user_id: str, data: TeamRoleUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Rolle eines Team-Mitglieds ändern (Admin ↔ Mitarbeiter)."""
    role = _ROLES.get(data.role)
    if not role:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültige Rolle")
    member = db.get(User, user_id)
    if not member or member.organization_id != user.organization_id or member.role == UserRole.client_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    # Letzten Admin nicht herabstufen
    if member.role == UserRole.agency_admin and role != UserRole.agency_admin:
        admin_count = db.query(User).filter(
            User.organization_id == user.organization_id, User.role == UserRole.agency_admin).count()
        if admin_count <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Der letzte Admin kann nicht herabgestuft werden.")
    member.role = role
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
