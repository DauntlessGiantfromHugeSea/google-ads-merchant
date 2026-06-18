"""Globales Aufgaben-Board: alle To-Dos über alle Kunden der Agentur."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.database import get_db
from app.models import Client, Todo, User
from app.schemas import TodoGlobalOut

router = APIRouter(prefix="/api/todos", tags=["tasks"])


@router.get("", response_model=list[TodoGlobalOut])
def all_todos(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    rows = (db.query(Todo, Client.name)
            .join(Client, Todo.client_id == Client.id)
            .filter(Client.organization_id == user.organization_id)
            .order_by(Todo.created_at.desc()).all())
    return [TodoGlobalOut(
        id=t.id, title=t.title, description=t.description, status=t.status,
        priority=t.priority, assignee=t.assignee, due_date=t.due_date,
        created_at=t.created_at, client_id=t.client_id, client_name=cname,
    ) for t, cname in rows]
