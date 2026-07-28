"""Projekte/Kampagnen je Kunde (Kanban) + globales Board über alle Kunden."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, Project, User
from app.schemas import ProjectCreate, ProjectGlobalOut, ProjectOut, ProjectPatch

client_router = APIRouter(prefix="/api/clients/{client_id}/projects", tags=["projects"])
global_router = APIRouter(prefix="/api/projects", tags=["projects"])


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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(proj, field, value)
    db.commit()
    db.refresh(proj)
    return proj


@client_router.delete("/{project_id}", status_code=204)
def delete_project(client_id: str, project_id: str,
                   user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    proj = db.get(Project, project_id)
    if proj and proj.client_id == client_id:
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
            created_at=proj.created_at, client_name=cname,
        ))
    return out
