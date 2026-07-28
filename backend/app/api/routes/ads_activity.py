"""Google-Ads-Aktivitätsprotokoll je Kunde."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import AdsActivity, User
from app.schemas import AdsActivityCreate, AdsActivityOut

router = APIRouter(prefix="/api/clients/{client_id}/ads-activities", tags=["ads-activity"])


@router.get("", response_model=list[AdsActivityOut])
def list_activities(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(AdsActivity).filter(AdsActivity.client_id == client_id)
            .order_by(AdsActivity.date.desc(), AdsActivity.created_at.desc()).all())


@router.post("", response_model=AdsActivityOut, status_code=201)
def create_activity(client_id: str, data: AdsActivityCreate,
                    user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    act = AdsActivity(client_id=client_id, author=user.full_name or user.email, **data.model_dump())
    db.add(act)
    db.commit()
    db.refresh(act)
    return act


@router.delete("/{activity_id}", status_code=204)
def delete_activity(client_id: str, activity_id: str,
                    user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    act = db.get(AdsActivity, activity_id)
    if act and act.client_id == client_id:
        db.delete(act)
        db.commit()
