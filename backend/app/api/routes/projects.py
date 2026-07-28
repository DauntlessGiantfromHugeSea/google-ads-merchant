"""Projekte/Kampagnen je Kunde (Kanban) + globales Board über alle Kunden."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, Project, ProjectEvent, Todo, User
from app.schemas import (
    ProjectCreate, ProjectEventCreate, ProjectEventOut, ProjectGlobalOut, ProjectOut, ProjectPatch,
)
from app.services.notify import notify_client_users

client_router = APIRouter(prefix="/api/clients/{client_id}/projects", tags=["projects"])
global_router = APIRouter(prefix="/api/projects", tags=["projects"])

_STATUS_LABEL = {"backlog": "Backlog", "in_progress": "In Arbeit", "review": "Review", "done": "Fertig"}
_FIELD_LABEL = {"title": "Titel", "type": "Typ", "assignee": "Verantwortlich", "due_date": "Deadline",
                "brief": "Briefing", "budget": "Budget", "hours_quota": "Stundenkontingent",
                "description": "Beschreibung"}


def _log_event(db: Session, proj: Project, user: User, kind: str, text: str) -> None:
    db.add(ProjectEvent(project_id=proj.id, client_id=proj.client_id,
                        organization_id=user.organization_id, kind=kind, text=text,
                        actor=user.full_name or user.email))


@client_router.get("", response_model=list[ProjectOut])
def list_projects(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(Project).filter(Project.client_id == client_id)
            .order_by(Project.created_at.desc()).all())


@client_router.post("", response_model=ProjectOut, status_code=201)
def create_project(client_id: str, data: ProjectCreate,
                   user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    proj = Project(client_id=client_id, **data.model_dump())
    db.add(proj)
    db.flush()
    _log_event(db, proj, user, "created", f"Projekt angelegt: {proj.title}")
    db.commit()
    db.refresh(proj)
    return proj


@client_router.patch("/{project_id}", response_model=ProjectOut)
def update_project(client_id: str, project_id: str, data: ProjectPatch,
                   user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    proj = db.get(Project, project_id)
    if not proj or proj.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")
    updates = data.model_dump(exclude_unset=True)
    old_status = proj.status
    changed_fields = [f for f, v in updates.items() if f != "status" and getattr(proj, f) != v]
    for field, value in updates.items():
        setattr(proj, field, value)
    # Statusänderung -> Chronik + Kunde benachrichtigen (im Kundenportal sichtbar).
    if "status" in updates and proj.status != old_status:
        _log_event(db, proj, user, "status",
                   f"Status: {_STATUS_LABEL.get(old_status, old_status)} → {_STATUS_LABEL.get(proj.status, proj.status)}")
        notify_client_users(db, client_id, org_id=user.organization_id,
                            type_="project_status", title="Projekt aktualisiert",
                            body=f"{proj.title}: {_STATUS_LABEL.get(proj.status, proj.status)}",
                            link=f"/clients/{client_id}", exclude_user_id=user.id)
    if changed_fields:
        _log_event(db, proj, user, "edit",
                   "Bearbeitet: " + ", ".join(_FIELD_LABEL.get(f, f) for f in changed_fields))
    db.commit()
    db.refresh(proj)
    return proj


@client_router.get("/{project_id}/events", response_model=list[ProjectEventOut])
def list_events(client_id: str, project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    proj = db.get(Project, project_id)
    if not proj or proj.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")
    return (db.query(ProjectEvent).filter(ProjectEvent.project_id == project_id)
            .order_by(ProjectEvent.created_at.desc()).all())


@client_router.post("/{project_id}/events", response_model=ProjectEventOut, status_code=201)
def add_event(client_id: str, project_id: str, data: ProjectEventCreate,
              user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    proj = db.get(Project, project_id)
    if not proj or proj.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projekt nicht gefunden")
    kind = data.kind if data.kind in ("note", "decision") else "note"
    ev = ProjectEvent(project_id=project_id, client_id=client_id, organization_id=user.organization_id,
                      kind=kind, text=data.text[:2000], actor=user.full_name or user.email)
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@client_router.delete("/{project_id}", status_code=204)
def delete_project(client_id: str, project_id: str,
                   user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    proj = db.get(Project, project_id)
    if proj and proj.client_id == client_id:
        # Zugeordnete To-Dos behalten, aber die Projektzuordnung lösen (FK).
        db.query(Todo).filter(Todo.project_id == project_id).update(
            {Todo.project_id: None}, synchronize_session=False)
        db.query(ProjectEvent).filter(ProjectEvent.project_id == project_id).delete(synchronize_session=False)
        db.delete(proj)
        db.commit()


@global_router.get("", response_model=list[ProjectGlobalOut])
def all_projects(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    rows = (db.query(Project, Client.name)
            .join(Client, Project.client_id == Client.id)
            .filter(Client.organization_id == user.organization_id)
            .order_by(Project.created_at.desc()).all())
    out = []
    for proj, cname in rows:
        out.append(ProjectGlobalOut(
            id=proj.id, client_id=proj.client_id, title=proj.title, description=proj.description,
            type=proj.type, status=proj.status, assignee=proj.assignee, due_date=proj.due_date,
            brief=proj.brief, budget=proj.budget, hours_quota=proj.hours_quota,
            created_at=proj.created_at, client_name=cname,
        ))
    return out
