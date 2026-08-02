"""Zeiterfassung mit Stoppuhr – je Nutzer. Optional, für das Team.

Ein Eintrag "läuft", solange ended_at leer ist. Es kann pro Nutzer nur eine
Stoppuhr gleichzeitig laufen; beim Start wird eine noch laufende beendet."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, Project, TimeEntry, User
from app.schemas import TimeEntryOut, TimeManual, TimePatch, TimeStart

router = APIRouter(prefix="/api/time", tags=["time"])
client_router = APIRouter(prefix="/api/clients/{client_id}/time", tags=["time"])

_BILL_STEP = 15 * 60  # Abrechnung im 15-Minuten-Takt


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def _billable(seconds: int) -> int:
    if seconds <= 0:
        return 0
    return -(-seconds // _BILL_STEP) * _BILL_STEP  # auf volle 15 Min aufrunden


def _resolve_project(project_id: str | None, client_id: str | None, user: User, db: Session):
    """Prüft das Projekt (falls gesetzt) und leitet den Kunden daraus ab."""
    if not project_id:
        return None, client_id
    proj = db.get(Project, project_id)
    if not proj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")
    get_scoped_client(proj.client_id, user, db)  # Mandantentrennung
    return proj.id, proj.client_id


def _out(e: TimeEntry, db: Session) -> TimeEntryOut:
    running = e.ended_at is None
    dur = e.duration_seconds
    if running:
        dur = max(0, int((datetime.now(timezone.utc) - _aware(e.started_at)).total_seconds()))
    client = db.get(Client, e.client_id) if e.client_id else None
    proj = db.get(Project, e.project_id) if e.project_id else None
    u = db.get(User, e.user_id)
    return TimeEntryOut(
        id=e.id, client_id=e.client_id, client_name=client.name if client else "",
        project_id=e.project_id, project_title=proj.title if proj else "",
        user_name=(u.full_name or u.email) if u else "",
        description=e.description, started_at=e.started_at, ended_at=e.ended_at,
        duration_seconds=dur, billable_seconds=0 if running else _billable(dur), running=running,
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
    project_id, client_id = _resolve_project(data.project_id, data.client_id, user, db)
    # laufende Stoppuhr zuerst beenden
    running = _running_for(user, db)
    if running:
        _finalize(running)
    e = TimeEntry(organization_id=user.organization_id, user_id=user.id,
                  client_id=client_id or None, project_id=project_id,
                  description=data.description.strip(), started_at=datetime.now(timezone.utc))
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
    project_id, client_id = _resolve_project(data.project_id, data.client_id, user, db)
    mins = max(0, int(data.minutes or 0))
    try:
        start = datetime.fromisoformat((data.date or "")[:10]).replace(tzinfo=timezone.utc)
    except ValueError:
        start = datetime.now(timezone.utc)
    e = TimeEntry(organization_id=user.organization_id, user_id=user.id,
                  client_id=client_id or None, project_id=project_id,
                  description=data.description.strip(),
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
    # Projekt gesetzt -> Kunde daraus ableiten; sonst reiner Kundenwechsel.
    if data.project_id is not None:
        pid, cid = _resolve_project(data.project_id or None, data.client_id, user, db)
        e.project_id = pid
        e.client_id = cid or (data.client_id or None)
    elif data.client_id is not None:
        if data.client_id:
            get_scoped_client(data.client_id, user, db)
        e.client_id = data.client_id or None
        e.project_id = None  # Kunde gewechselt -> altes Projekt passt nicht mehr
    if data.description is not None:
        e.description = data.description.strip()
    # Tag verschieben: started_at auf neues Datum, Uhrzeit beibehalten.
    if data.date:
        try:
            d = datetime.fromisoformat(data.date[:10]).date()
            st = _aware(e.started_at)
            e.started_at = st.replace(year=d.year, month=d.month, day=d.day)
            if e.ended_at is not None:
                e.ended_at = _aware(e.started_at) + timedelta(seconds=e.duration_seconds)
        except ValueError:
            pass
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


@client_router.get("", response_model=list[TimeEntryOut])
def client_time(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Alle erfassten Zeiten eines Kunden (ganzes Team) – für die Abrechnung
    im Kundenprofil."""
    get_scoped_client(client_id, user, db)
    rows = (db.query(TimeEntry)
            .filter(TimeEntry.organization_id == user.organization_id,
                    TimeEntry.client_id == client_id, TimeEntry.ended_at.isnot(None))
            .order_by(TimeEntry.started_at.desc()).all())
    return [_out(e, db) for e in rows]
