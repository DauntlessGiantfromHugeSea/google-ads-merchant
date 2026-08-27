"""Protokoll je Kunde: „Was wurde wann gemacht." Manuelle Einträge der Agentur
und automatische Systemeinträge (z. B. erledigte WordPress-Updates). Optional
für den Kunden sichtbar."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import ActivityEntry, User, UserRole

router = APIRouter(prefix="/api/clients/{client_id}/activity", tags=["activity"])


def log_activity(db: Session, *, org_id: str, client_id: str, text: str,
                 source: str = "system", author: str = "System",
                 client_visible: bool = True, occurred_at: datetime | None = None) -> None:
    """Systemeintrag (oder programmatischer Eintrag) ins Protokoll. Committet NICHT."""
    db.add(ActivityEntry(
        organization_id=org_id, client_id=client_id, text=text[:4000], source=source,
        author=author, client_visible=client_visible,
        occurred_at=occurred_at or datetime.now(timezone.utc)))


def _out(e: ActivityEntry) -> dict:
    return {"id": e.id, "occurred_at": e.occurred_at, "author": e.author,
            "source": e.source, "text": e.text, "client_visible": e.client_visible}


def _parse(dt: str | None) -> datetime | None:
    if not dt:
        return None
    try:
        d = datetime.fromisoformat(dt)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


@router.get("")
def list_activity(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    get_scoped_client(client_id, user, db)
    q = db.query(ActivityEntry).filter(ActivityEntry.client_id == client_id)
    if user.role == UserRole.client_user:
        q = q.filter(ActivityEntry.client_visible.is_(True))
    rows = q.order_by(ActivityEntry.occurred_at.desc()).all()
    return [_out(e) for e in rows]


@router.post("")
def add_activity(client_id: str, data: dict, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client(client_id, user, db)
    text = (data.get("text") or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Text fehlt.")
    e = ActivityEntry(
        organization_id=client.organization_id, client_id=client_id, text=text[:4000],
        source="manual", author=user.full_name or user.email,
        client_visible=bool(data.get("client_visible", True)),
        occurred_at=_parse(data.get("occurred_at")) or datetime.now(timezone.utc))
    db.add(e)
    db.commit()
    db.refresh(e)
    return _out(e)


@router.patch("/{entry_id}")
def edit_activity(client_id: str, entry_id: str, data: dict,
                  user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    get_scoped_client(client_id, user, db)
    e = db.get(ActivityEntry, entry_id)
    if not e or e.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Eintrag nicht gefunden")
    if "text" in data:
        e.text = (data.get("text") or "").strip()[:4000]
    if "client_visible" in data:
        e.client_visible = bool(data.get("client_visible"))
    if data.get("occurred_at"):
        e.occurred_at = _parse(data.get("occurred_at")) or e.occurred_at
    db.commit()
    db.refresh(e)
    return _out(e)


@router.delete("/{entry_id}", status_code=204)
def delete_activity(client_id: str, entry_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    e = db.get(ActivityEntry, entry_id)
    if e and e.client_id == client_id:
        db.delete(e)
        db.commit()
