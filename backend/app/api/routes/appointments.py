"""Termine je Kunde: buchen, Teilnehmer (Mitarbeiter), Kalender, Protokoll.

Beim Buchen werden Kunde, ausgewählte Mitarbeiter und der Ersteller
benachrichtigt (inkl. Link) und ein Eintrag in den Kunden-Verlauf gehängt.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import Appointment, Client, ClientUpdate, Organization, User, UserRole
from app.schemas import AppointmentCreate, AppointmentOut, AppointmentPatch
from app.services.notify import _client_user_ids, notify_users

settings = get_settings()
client_router = APIRouter(prefix="/api/clients/{client_id}/appointments", tags=["appointments"])
global_router = APIRouter(prefix="/api/appointments", tags=["appointments"])


def _names(db: Session, org_id: str) -> dict[str, str]:
    return {u.id: (u.full_name or u.email) for u in db.query(User).filter(User.organization_id == org_id).all()}


def _out(a: Appointment, names: dict, client_name: str = "") -> AppointmentOut:
    return AppointmentOut(
        id=a.id, client_id=a.client_id, client_name=client_name, title=a.title, starts_at=a.starts_at,
        link=a.link, note=a.note, protocol=a.protocol, assignees=a.assignees or [],
        assignee_names=[names.get(uid, "") for uid in (a.assignees or [])], created_at=a.created_at)


def _fmt(starts_at: str) -> str:
    try:
        dt = datetime.fromisoformat(starts_at)
        return dt.strftime("%d.%m.%Y um %H:%M Uhr")
    except Exception:
        return starts_at


@client_router.get("", response_model=list[AppointmentOut])
def list_appointments(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    names = _names(db, user.organization_id)
    rows = (db.query(Appointment).filter(Appointment.client_id == client_id)
            .order_by(Appointment.starts_at.desc()).all())
    return [_out(a, names, client.name) for a in rows]


@client_router.post("", response_model=AppointmentOut, status_code=201)
def create_appointment(client_id: str, data: AppointmentCreate,
                       user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    org = db.get(Organization, user.organization_id)
    link = data.link or (org.meeting_link if org else "")
    # Nur gültige Mitarbeiter der Organisation als Teilnehmer.
    valid = {u.id for u in db.query(User.id).filter(
        User.organization_id == user.organization_id, User.role != UserRole.client_user).all()}
    assignees = [a for a in data.assignees if a in valid]
    ap = Appointment(organization_id=user.organization_id, client_id=client_id, title=data.title[:512],
                     starts_at=data.starts_at, link=link, note=data.note, assignees=assignees,
                     created_by=user.full_name or user.email)
    db.add(ap)

    # Benachrichtigen: Kunde + ausgewählte Mitarbeiter + Ersteller.
    recips = list(set(_client_user_ids(db, client_id) + assignees + [user.id]))
    body = f"{data.title} – {_fmt(data.starts_at)}" + (f"\n{link}" if link else "")
    notify_users(db, recips, org_id=user.organization_id, client_id=client_id,
                 type_="appointment", title="Ein Termin wurde für dich gebucht",
                 body=body, link=f"/clients/{client_id}")
    # In den Kunden-Verlauf hängen.
    db.add(ClientUpdate(client_id=client_id, title=f"Termin: {data.title}", category="termin",
                        body=f"{_fmt(data.starts_at)}" + (f"\nLink: {link}" if link else "")
                             + (f"\n{data.note}" if data.note else ""),
                        author_name=user.full_name or user.email))
    db.commit()
    db.refresh(ap)
    return _out(ap, _names(db, user.organization_id), client.name)


@client_router.patch("/{ap_id}", response_model=AppointmentOut)
def update_appointment(client_id: str, ap_id: str, data: AppointmentPatch,
                       user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    ap = db.get(Appointment, ap_id)
    if not ap or ap.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Termin nicht gefunden")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ap, field, value)
    db.commit()
    db.refresh(ap)
    return _out(ap, _names(db, user.organization_id), client.name)


@client_router.delete("/{ap_id}", status_code=204)
def delete_appointment(client_id: str, ap_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    ap = db.get(Appointment, ap_id)
    if ap and ap.client_id == client_id:
        db.delete(ap)
        db.commit()


@global_router.get("", response_model=list[AppointmentOut])
def all_appointments(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    names = _names(db, user.organization_id)
    rows = (db.query(Appointment, Client.name)
            .join(Client, Appointment.client_id == Client.id)
            .filter(Client.organization_id == user.organization_id)
            .order_by(Appointment.starts_at.desc()).all())
    return [_out(a, names, cname) for a, cname in rows]
