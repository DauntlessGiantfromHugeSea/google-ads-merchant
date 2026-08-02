"""Eingebettete Analytics-Dashboards je Kunde (z. B. Looker Studio).
Es wird nur der Embed-Link gespeichert – keine Zugangsdaten, keine Daten.
Für die Agentur reicht Betrachter-Zugang beim Analytics-Anbieter."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Dashboard, User
from app.schemas import DashboardCreate, DashboardOut

router = APIRouter(prefix="/api/clients/{client_id}/dashboards", tags=["dashboards"])


def _normalize(url: str) -> str:
    """Looker-Studio-/Data-Studio-Freigabelinks in die Embed-Form bringen."""
    u = (url or "").strip()
    for host in ("lookerstudio.google.com", "datastudio.google.com"):
        if host in u and "/embed/" not in u and "/reporting/" in u:
            u = u.replace("/reporting/", "/embed/reporting/", 1)
    return u


@router.get("", response_model=list[DashboardOut])
def list_dashboards(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(Dashboard).filter(Dashboard.client_id == client_id)
            .order_by(Dashboard.position, Dashboard.created_at).all())


@router.post("", response_model=DashboardOut, status_code=201)
def create_dashboard(client_id: str, data: DashboardCreate,
                     user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    url = _normalize(data.url)
    if not url.lower().startswith("https://"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte einen https-Embed-Link angeben.")
    count = db.query(Dashboard).filter(Dashboard.client_id == client_id).count()
    dash = Dashboard(organization_id=user.organization_id, client_id=client_id,
                     label=data.label.strip() or "Analytics", url=url, position=count,
                     created_by=user.full_name or user.email)
    db.add(dash)
    db.commit()
    db.refresh(dash)
    return dash


@router.delete("/{dashboard_id}", status_code=204)
def delete_dashboard(client_id: str, dashboard_id: str,
                     user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    dash = db.get(Dashboard, dashboard_id)
    if dash and dash.client_id == client_id and dash.organization_id == user.organization_id:
        db.delete(dash)
        db.commit()
