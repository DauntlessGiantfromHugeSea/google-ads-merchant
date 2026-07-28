"""Globales Aufgaben-Board: alle To-Dos über alle Kunden der Agentur."""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_agency
from app.database import get_db
from app.models import Client, Project, Todo, User, UserRole
from app.schemas import TodoGlobalOut
from app.services.notify import notify_users

router = APIRouter(prefix="/api/todos", tags=["tasks"])


def _remind_overdue(db: Session, user: User, rows) -> None:
    """Einmalige Erinnerung je Aufgabe, sobald sie überfällig ist (der/die
    Zuständige wird benachrichtigt). Läuft beim Abruf der eigenen Aufgaben."""
    today = date.today().isoformat()
    changed = False
    for t, cname, _ptitle in rows:
        if (t.due_date and t.due_date < today and not t.overdue_notified
                and t.status != "done" and t.assignee_id):
            notify_users(db, [t.assignee_id], org_id=user.organization_id, client_id=t.client_id,
                         type_="todo_overdue", title="Aufgabe überfällig",
                         body=f"{t.title} · {cname} (fällig {t.due_date})",
                         link=f"/clients/{t.client_id}")
            t.overdue_notified = True
            changed = True
    if changed:
        db.commit()


def _org_names(org_id: str, db: Session) -> dict[str, str]:
    return {u.id: (u.full_name or u.email)
            for u in db.query(User).filter(User.organization_id == org_id).all()}


def _rows_to_out(rows, names: dict[str, str]) -> list[TodoGlobalOut]:
    return [TodoGlobalOut(
        id=t.id, title=t.title, description=t.description, status=t.status,
        priority=t.priority, assignee=t.assignee, due_date=t.due_date,
        created_at=t.created_at, client_id=t.client_id, client_name=cname,
        project_id=t.project_id, project_title=ptitle or "",
        assignee_id=t.assignee_id, assignee_name=names.get(t.assignee_id or "", ""),
    ) for t, cname, ptitle in rows]


@router.get("", response_model=list[TodoGlobalOut])
def all_todos(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    rows = (db.query(Todo, Client.name, Project.title)
            .join(Client, Todo.client_id == Client.id)
            .outerjoin(Project, Todo.project_id == Project.id)
            .filter(Client.organization_id == user.organization_id)
            .order_by(Todo.created_at.desc()).all())
    _remind_overdue(db, user, rows)
    return _rows_to_out(rows, _org_names(user.organization_id, db))


@router.get("/mine", response_model=list[TodoGlobalOut])
def my_todos(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Offene Aufgaben, die dem eingeloggten Nutzer zugewiesen sind (Agentur oder Kunde)."""
    q = (db.query(Todo, Client.name, Project.title)
         .join(Client, Todo.client_id == Client.id)
         .outerjoin(Project, Todo.project_id == Project.id)
         .filter(Client.organization_id == user.organization_id,
                 Todo.assignee_id == user.id,
                 Todo.status != "done"))
    # Kunden-Nutzer sehen nur Aufgaben ihres eigenen Kunden.
    if user.role == UserRole.client_user:
        q = q.filter(Todo.client_id == user.client_id)
    rows = q.order_by(Todo.due_date.asc()).all()
    return _rows_to_out(rows, _org_names(user.organization_id, db))
