"""Onboarding je Kunde: Ist-Analyse (Status quo) + Anforderungen ans Projekt.
Internes, von der Agentur geführtes Dokument."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import Onboarding, User
from app.schemas import OnboardingIn, OnboardingOut

router = APIRouter(prefix="/api/clients/{client_id}/onboarding", tags=["onboarding"])


def _get_or_create(client_id: str, org_id: str, db: Session) -> Onboarding:
    ob = db.query(Onboarding).filter(Onboarding.client_id == client_id).first()
    if not ob:
        ob = Onboarding(organization_id=org_id, client_id=client_id, data={}, status="offen")
        db.add(ob)
        db.commit()
        db.refresh(ob)
    return ob


@router.get("", response_model=OnboardingOut)
def get_onboarding(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    ob = _get_or_create(client_id, user.organization_id, db)
    return OnboardingOut(data=ob.data or {}, status=ob.status, updated_at=ob.updated_at)


@router.put("", response_model=OnboardingOut)
def save_onboarding(client_id: str, payload: OnboardingIn,
                    user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    ob = _get_or_create(client_id, user.organization_id, db)
    ob.data = payload.data or {}
    ob.status = payload.status or "offen"
    # Abschluss spiegelt sich im Kunden-Flag (Badge "Onboarding offen").
    client.onboarding_completed = (ob.status == "fertig")
    ob.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ob)
    return OnboardingOut(data=ob.data or {}, status=ob.status, updated_at=ob.updated_at)
