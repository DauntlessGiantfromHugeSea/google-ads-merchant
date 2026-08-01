"""Agentur-Kontakt – vom Admin gepflegt, für alle (auch Kunden) sichtbar."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.database import get_db
from app.models import Organization, User
from app.schemas import AgencyContact

router = APIRouter(prefix="/api/org", tags=["org"])


@router.get("/contact", response_model=AgencyContact)
def get_contact(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    return AgencyContact(
        agency_contact_name=org.agency_contact_name,
        agency_contact_email=org.agency_contact_email,
        agency_contact_phone=org.agency_contact_phone,
        agency_contact_note=org.agency_contact_note,
        agency_address=org.agency_address,
        email_notifications=org.email_notifications,
        meeting_link=org.meeting_link,
        timezone=org.timezone or "Europe/Berlin",
    )


@router.patch("/contact", response_model=AgencyContact)
def set_contact(data: AgencyContact, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    org.agency_contact_name = data.agency_contact_name
    org.agency_contact_email = data.agency_contact_email
    org.agency_contact_phone = data.agency_contact_phone
    org.agency_contact_note = data.agency_contact_note
    org.agency_address = data.agency_address
    org.email_notifications = data.email_notifications
    org.meeting_link = data.meeting_link
    org.timezone = (data.timezone or "Europe/Berlin").strip()
    db.commit()
    return data
