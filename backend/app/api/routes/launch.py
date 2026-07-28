"""Client-Portal: Launch-Meilensteine + Freigaben (Approvals) je Kunde."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.services.notify import notify_counterparts
from app.database import get_db
from app.models import Approval, Milestone, User
from app.schemas import (
    ApprovalCreate,
    ApprovalOut,
    ApprovalRespond,
    MilestoneCreate,
    MilestoneOut,
    MilestonePatch,
)

router = APIRouter(prefix="/api/clients/{client_id}", tags=["launch"])


# --- Meilensteine ---
@router.get("/milestones", response_model=list[MilestoneOut])
def list_milestones(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(Milestone).filter(Milestone.client_id == client_id)
            .order_by(Milestone.position, Milestone.created_at).all())


@router.post("/milestones", response_model=MilestoneOut, status_code=201)
def create_milestone(client_id: str, data: MilestoneCreate,
                     user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    pos = db.query(Milestone).filter(Milestone.client_id == client_id).count()
    ms = Milestone(client_id=client_id, position=pos, **data.model_dump())
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return ms


@router.patch("/milestones/{ms_id}", response_model=MilestoneOut)
def update_milestone(client_id: str, ms_id: str, data: MilestonePatch,
                     user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    ms = db.get(Milestone, ms_id)
    if not ms or ms.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meilenstein nicht gefunden")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(ms, f, v)
    db.commit()
    db.refresh(ms)
    return ms


@router.delete("/milestones/{ms_id}", status_code=204)
def delete_milestone(client_id: str, ms_id: str,
                     user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    ms = db.get(Milestone, ms_id)
    if ms and ms.client_id == client_id:
        db.delete(ms)
        db.commit()


# --- Freigaben ---
@router.get("/approvals", response_model=list[ApprovalOut])
def list_approvals(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(Approval).filter(Approval.client_id == client_id)
            .order_by(Approval.created_at.desc()).all())


@router.post("/approvals", response_model=ApprovalOut, status_code=201)
def create_approval(client_id: str, data: ApprovalCreate,
                    user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    ap = Approval(client_id=client_id, **data.model_dump())
    db.add(ap)
    notify_counterparts(db, author=user, org_id=user.organization_id, client_id=client_id,
                        type_="approval_requested", title="Freigabe angefragt",
                        body=f"{ap.title} · {client.name}", link=f"/clients/{client_id}")
    db.commit()
    db.refresh(ap)
    return ap


@router.post("/approvals/{ap_id}/respond", response_model=ApprovalOut)
def respond_approval(client_id: str, ap_id: str, data: ApprovalRespond,
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Freigeben oder Änderungen anfragen – erlaubt für Kunde und Agentur."""
    get_scoped_client(client_id, user, db)
    ap = db.get(Approval, ap_id)
    if not ap or ap.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Freigabe nicht gefunden")
    if data.decision not in ("approved", "changes_requested"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültige Entscheidung")
    ap.status = data.decision
    ap.response_comment = data.comment
    ap.responded_by = user.full_name or user.email
    ap.responded_at = datetime.now(timezone.utc)
    label = "freigegeben" if data.decision == "approved" else "Änderungen angefragt"
    notify_counterparts(db, author=user, org_id=user.organization_id, client_id=client_id,
                        type_="approval_responded", title=f"Freigabe: {label}",
                        body=ap.title, link=f"/clients/{client_id}")
    db.commit()
    db.refresh(ap)
    return ap


@router.delete("/approvals/{ap_id}", status_code=204)
def delete_approval(client_id: str, ap_id: str,
                    user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    ap = db.get(Approval, ap_id)
    if ap and ap.client_id == client_id:
        db.delete(ap)
        db.commit()
