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


from fastapi import HTTPException, status  # noqa: E402
from app.api.deps import require_agency  # noqa: E402


@router.get("/signature")
def get_signature(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    """Gespeicherte Agentur-Unterschrift (Bild + Name) für Vertragsunterschriften."""
    org = db.get(Organization, user.organization_id)
    return {"signature_image": org.default_signature_image or "",
            "signer_name": org.default_signer_name or ""}


@router.patch("/signature")
def set_signature(data: dict, user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    if "signer_name" in data:
        org.default_signer_name = (data.get("signer_name") or "").strip()[:255]
    if "signature_image" in data:
        sig = (data.get("signature_image") or "").strip()
        if sig and (not sig.startswith("data:image/") or "," not in sig or len(sig) > 2_000_000):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiges Bild (PNG/JPEG als Data-URL, max. ~1,5 MB).")
        org.default_signature_image = sig
    db.commit()
    return {"signature_image": org.default_signature_image or "",
            "signer_name": org.default_signer_name or ""}
