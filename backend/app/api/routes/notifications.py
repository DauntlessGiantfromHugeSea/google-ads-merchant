"""In-App-Benachrichtigungen des eingeloggten Nutzers."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Notification, User
from app.schemas import NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (db.query(Notification).filter(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc()).limit(50).all())


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    n = db.query(Notification).filter(
        Notification.user_id == user.id, Notification.read.is_(False)).count()
    return {"count": n}


@router.post("/read-all", status_code=204)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.read.is_(False)
    ).update({Notification.read: True}, synchronize_session=False)
    db.commit()


@router.post("/{note_id}/read", status_code=204)
def read_one(note_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.get(Notification, note_id)
    if note and note.user_id == user.id:
        note.read = True
        db.commit()


@router.get("/prefs")
def get_prefs(user: User = Depends(get_current_user)) -> dict:
    """Benachrichtigungs-Präferenzen des eingeloggten Nutzers."""
    return {"notify_contact_email": bool(user.notify_contact_email)}


@router.patch("/prefs")
def set_prefs(data: dict, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)) -> dict:
    """Nutzer stellt selbst ein, ob er bei neuen Nachrichten eine E-Mail möchte."""
    if "notify_contact_email" in data:
        u = db.get(User, user.id)
        u.notify_contact_email = bool(data["notify_contact_email"])
        db.commit()
        return {"notify_contact_email": u.notify_contact_email}
    return {"notify_contact_email": bool(user.notify_contact_email)}
