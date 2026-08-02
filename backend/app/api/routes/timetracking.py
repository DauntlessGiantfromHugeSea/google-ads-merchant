"""Zeiterfassung mit Stoppuhr – je Nutzer. Optional, für das Team.

Ein Eintrag "läuft", solange ended_at leer ist. Es kann pro Nutzer nur eine
Stoppuhr gleichzeitig laufen; beim Start wird eine noch laufende beendet."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, TimeEntry, User
from app.schemas import TimeEntryOut, TimeManual, TimePatch, TimeStart

router = APIRouter(prefix="/api/time", tags=["time"])


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def _out(e: TimeEntry, db: Session) -> TimeEntryOut:
    running = e.ended_at is None
    dur = e.duration_seconds
    if running:
        dur = max(0, int((datetime.now(timezone.utc) - _aware(e.started_at)).total_seconds()))
    client = db.get(Client, e.client_id) if e.client_id else None
    return TimeEntryOut(
        id=e.id, client_id=e.client_id, client_name=client.name if client else "",
        description=e.description, started_at=e.started_at, ended_at=e.ended_at,
        duration_seconds=dur, running=running,
    )


def _running_for(user: User, db: Session) -> TimeEntry | None:
    return (db.query(TimeEntry)
            .filter(TimeEntry.user_id == user.id, TimeEntry.ended_at.is_(None))
            .order_by(TimeEntry.started_at.desc()).first())


def _finalize(e: TimeEntry) -> None:
    now = datetime.now(timezone.utc)
    e.ended_at = now
    e.duration_seconds = max(0, int((now - _aware(e.started_at)).total_seconds()))


@router.get("", response_model=list[TimeEntryOut])
def list_entries(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    rows = (db.query(TimeEntry)
            .filter(TimeEntry.user_id == user.id)
            .order_by(TimeEntry.started_at.desc()).limit(300).all())
    return [_out(e, db) for e in rows]


@router.get("/running", response_model=TimeEntryOut | None)
def get_running(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    e = _running_for(user, db)
    return _out(e, db) if e else None


@router.post("/start", response_model=TimeEntryOut, status_code=201)
def start_timer(data: TimeStart, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
    # laufende Stoppuhr zuerst beenden
    running = _running_for(user, db)
    if running:
        _finalize(running)
    e = TimeEntry(organization_id=user.organization_id, user_id=user.id,
                  client_id=data.client_id or None, description=data.description.strip(),
                  started_at=datetime.now(timezone.utc))
    db.add(e)
    db.commit()
    db.refresh(e)
    return _out(e, db)


@router.post("/{entry_id}/stop", response_model=TimeEntryOut)
def stop_timer(entry_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    e = db.get(TimeEntry, entry_id)
    if not e or e.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Eintrag nicht gefunden")
    if e.ended_at is None:
        _finalize(e)
        db.commit()
        db.refresh(e)
    return _out(e, db)


@router.post("/manual", response_model=TimeEntryOut, status_code=201)
def add_manual(data: TimeManual, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
    mins = max(0, int(data.minutes or 0))
    try:
        start = datetime.fromisoformat((data.date or "")[:10]).replace(tzinfo=timezone.utc)
    except ValueError:
        start = datetime.now(timezone.utc)
    e = TimeEntry(organization_id=user.organization_id, user_id=user.id,
                  client_id=data.client_id or None, description=data.description.strip(),
                  started_at=start, ended_at=start + timedelta(minutes=mins),
                  duration_seconds=mins * 60)
    db.add(e)
    db.commit()
    db.refresh(e)
    return _out(e, db)


@router.patch("/{entry_id}", response_model=TimeEntryOut)
def update_entry(entry_id: str, data: TimePatch, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    e = db.get(TimeEntry, entry_id)
    if not e or e.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Eintrag nicht gefunden")
    if data.client_id is not None:
        if data.client_id:
            get_scoped_client(data.client_id, user, db)
        e.client_id = data.client_id or None
    if data.description is not None:
        e.description = data.description.strip()
    if data.minutes is not None and e.ended_at is not None:
        e.duration_seconds = max(0, int(data.minutes)) * 60
        e.ended_at = _aware(e.started_at) + timedelta(seconds=e.duration_seconds)
    db.commit()
    db.refresh(e)
    return _out(e, db)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(entry_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    e = db.get(TimeEntry, entry_id)
    if e and e.user_id == user.id:
        db.delete(e)
        db.commit()
