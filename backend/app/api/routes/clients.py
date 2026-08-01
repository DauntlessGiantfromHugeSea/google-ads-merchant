"""Kundenverwaltung + Onboarding (Konten verknüpfen, Kunden-User einladen)."""
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_admin, require_agency
from app.config import get_settings
from app.core.crypto import encrypt_json
from app.core.security import create_access_token, hash_password, password_problem
from app.services.notify import notify_counterparts, notify_users
from app.database import get_db
from app.models import (
    Account,
    AdsActivity,
    Appointment,
    Approval,
    Client,
    ChecklistItem,
    ClientUpdate,
    Contract,
    Document,
    GoogleCredential,
    IntakeForm,
    Milestone,
    MonitorEvent,
    MonitorStatus,
    Offer,
    OfferItem,
    Organization,
    Participant,
    Project,
    ProjectEvent,
    ReportRun,
    SeoAudit,
    Todo,
    User,
    UserRole,
)

_settings = get_settings()
from app.schemas import (
    AccountCreate,
    AccountOut,
    AssigneeOut,
    ChecklistCreate,
    ChecklistItemOut,
    ChecklistPatch,
    ClientCreate,
    ClientOut,
    ClientPatch,
    CredentialIn,
    CredentialStatus,
    InviteClientUser,
    Token,
    TodoCreate,
    TodoOut,
    TodoPatch,
    UpdateCreate,
    UpdateOut,
    UserOut,
)

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
def list_clients(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Client).filter(Client.organization_id == user.organization_id)
    if user.role == UserRole.client_user:
        q = q.filter(Client.id == user.client_id)
    return q.all()


@router.post("", response_model=ClientOut, status_code=201)
def create_client(
    data: ClientCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)
):
    client = Client(
        name=data.name,
        contact_email=data.contact_email,
        notes=data.notes,
        organization_id=user.organization_id,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_scoped_client(client_id, user, db)


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Löscht einen Kunden endgültig samt aller verknüpften Daten (nur Admin)."""
    client = get_scoped_client(client_id, user, db)
    # Angebotspositionen zu Angeboten dieses Kunden
    offer_ids = [o.id for o in db.query(Offer).filter(Offer.client_id == client_id).all()]
    if offer_ids:
        db.query(OfferItem).filter(OfferItem.offer_id.in_(offer_ids)).delete(synchronize_session=False)
    # To-Do-Verweise auf Projekte lösen, bevor Projekte gelöscht werden (FK).
    db.query(Todo).filter(Todo.client_id == client_id).update(
        {Todo.project_id: None}, synchronize_session=False)
    for model in (ProjectEvent, Offer, Contract, Project, Milestone, Approval, AdsActivity,
                  Document, MonitorEvent, Participant, SeoAudit, Appointment):
        db.query(model).filter(model.client_id == client_id).delete(synchronize_session=False)
    # Nullbare Verweise lösen
    db.query(MonitorStatus).filter(MonitorStatus.client_id == client_id).update(
        {MonitorStatus.client_id: None}, synchronize_session=False)
    db.query(IntakeForm).filter(IntakeForm.client_id == client_id).update(
        {IntakeForm.client_id: None}, synchronize_session=False)
    # Kunden-Logins entfernen
    db.query(User).filter(User.client_id == client_id).delete(synchronize_session=False)
    db.flush()
    # Rest (Konten, Reports, To-Dos, Verlauf) via Relationship-Cascade
    db.delete(client)
    db.commit()


@router.post("/{client_id}/impersonate", response_model=Token)
def impersonate(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Liefert ein Token, mit dem die Agentur die Kundenansicht sieht (nur lesend,
    nur dieser Kunde). Funktioniert auch ohne separaten Kunden-Login."""
    get_scoped_client(client_id, user, db)
    token = create_access_token(user.id, {"imp_client": client_id, "role": "client_user"})
    return Token(access_token=token)


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: str, data: ClientPatch,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    """Kontakt- und Vertragsdaten bearbeiten (nur Agentur)."""
    client = get_scoped_client(client_id, user, db)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    db.commit()
    db.refresh(client)
    return client


# --- To-Dos ---
def _display_name(u: User) -> str:
    return u.full_name or u.email


def _assignable_users(client_id: str, org_id: str, db: Session) -> list[User]:
    """Agentur-Team der Organisation + Kunden-Logins genau dieses Kunden."""
    return (db.query(User).filter(
        User.organization_id == org_id,
        or_(User.role != UserRole.client_user, User.client_id == client_id),
        User.is_active.is_(True),
    ).all())


def _assignee_name_map(client_id: str, org_id: str, db: Session) -> dict[str, str]:
    return {u.id: _display_name(u) for u in _assignable_users(client_id, org_id, db)}


def _resolve_assignee_id(raw: str | None, client_id: str, org_id: str, db: Session) -> str | None:
    """Leeren Wert zu NULL machen; Nutzer muss zuweisbar für diesen Kunden sein."""
    if not raw:
        return None
    u = db.get(User, raw)
    ok = u and u.organization_id == org_id and (
        u.role != UserRole.client_user or u.client_id == client_id)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nutzer kann dieser Aufgabe nicht zugewiesen werden")
    return raw


def _notify_assignee(db: Session, todo: Todo, actor: User, client: Client) -> None:
    """Benachrichtigt den zugewiesenen Nutzer (außer er weist sich selbst zu)."""
    if not todo.assignee_id or todo.assignee_id == actor.id:
        return
    notify_users(db, [todo.assignee_id], org_id=actor.organization_id, client_id=client.id,
                 type_="task_assigned", title="Neue Aufgabe für dich",
                 body=f"{todo.title} · {client.name}", link=f"/clients/{client.id}")


def _with_assignee_name(todo: Todo, names: dict[str, str]) -> TodoOut:
    out = TodoOut.model_validate(todo)
    out.assignee_name = names.get(todo.assignee_id or "", "")
    items = todo.checklist or []
    out.checklist_total = len(items)
    out.checklist_done = sum(1 for i in items if i.done)
    return out


def _advance_date(due: str, recurrence: str) -> str:
    """Nächstes Fälligkeitsdatum für wiederkehrende Aufgaben."""
    from datetime import date, timedelta
    if not due:
        base = date.today()
    else:
        try:
            base = date.fromisoformat(due)
        except ValueError:
            base = date.today()
    if recurrence == "daily":
        return (base + timedelta(days=1)).isoformat()
    if recurrence == "weekly":
        return (base + timedelta(days=7)).isoformat()
    if recurrence == "monthly":
        y, m = base.year + (base.month // 12), (base.month % 12) + 1
        import calendar
        d = min(base.day, calendar.monthrange(y, m)[1])
        return date(y, m, d).isoformat()
    return due


@router.get("/{client_id}/assignees", response_model=list[AssigneeOut])
def list_assignees(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Zuweisbare Nutzer: Agentur-Team + Kunden-Logins dieses Kunden (nur Agentur)."""
    get_scoped_client(client_id, user, db)
    users = _assignable_users(client_id, user.organization_id, db)
    return [AssigneeOut(
        id=u.id, full_name=_display_name(u), email=u.email, role=u.role,
        kind="client" if u.role == UserRole.client_user else "agency",
    ) for u in users]


@router.get("/{client_id}/todos", response_model=list[TodoOut])
def list_todos(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    names = _assignee_name_map(client_id, user.organization_id, db)
    todos = (db.query(Todo).filter(Todo.client_id == client_id)
             .order_by(Todo.created_at.desc()).all())
    return [_with_assignee_name(t, names) for t in todos]


def _resolve_project_id(raw: str | None, client_id: str, db: Session) -> str | None:
    """Leeren Wert zu NULL machen und prüfen, dass das Projekt zum Kunden gehört."""
    if not raw:
        return None
    project = db.get(Project, raw)
    if not project or project.client_id != client_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Projekt gehört nicht zu diesem Kunden")
    return raw


@router.post("/{client_id}/todos", response_model=TodoOut, status_code=201)
def create_todo(
    client_id: str, data: TodoCreate,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    client = get_scoped_client(client_id, user, db)
    payload = data.model_dump()
    payload["project_id"] = _resolve_project_id(payload.get("project_id"), client_id, db)
    payload["assignee_id"] = _resolve_assignee_id(payload.get("assignee_id"), client_id, user.organization_id, db)
    todo = Todo(client_id=client_id, **payload)
    db.add(todo)
    _notify_assignee(db, todo, user, client)
    db.commit()
    db.refresh(todo)
    names = _assignee_name_map(client_id, user.organization_id, db)
    return _with_assignee_name(todo, names)


@router.patch("/{client_id}/todos/{todo_id}", response_model=TodoOut)
def update_todo(
    client_id: str, todo_id: str, data: TodoPatch,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    get_scoped_client(client_id, user, db)
    todo = db.get(Todo, todo_id)
    if not todo or todo.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "To-Do nicht gefunden")
    updates = data.model_dump(exclude_unset=True)
    if "project_id" in updates:
        updates["project_id"] = _resolve_project_id(updates["project_id"], client_id, db)
    if "assignee_id" in updates:
        updates["assignee_id"] = _resolve_assignee_id(updates["assignee_id"], client_id, user.organization_id, db)
    prev_assignee = todo.assignee_id
    was_done = todo.status == "done"
    for field, value in updates.items():
        setattr(todo, field, value)
    if "assignee_id" in updates and todo.assignee_id and todo.assignee_id != prev_assignee:
        _notify_assignee(db, todo, user, get_scoped_client(client_id, user, db))
    # Wiederkehrend: beim Abschließen die nächste Aufgabe erzeugen.
    if todo.recurrence and not was_done and todo.status == "done":
        nxt = Todo(
            client_id=todo.client_id, title=todo.title, description=todo.description,
            priority=todo.priority, assignee=todo.assignee, assignee_id=todo.assignee_id,
            project_id=todo.project_id, recurrence=todo.recurrence, status="open",
            due_date=_advance_date(todo.due_date, todo.recurrence))
        db.add(nxt)
    db.commit()
    db.refresh(todo)
    names = _assignee_name_map(client_id, user.organization_id, db)
    return _with_assignee_name(todo, names)


# --- Checkliste / Unteraufgaben ---
def _scoped_todo(client_id: str, todo_id: str, user: User, db: Session) -> Todo:
    get_scoped_client(client_id, user, db)
    todo = db.get(Todo, todo_id)
    if not todo or todo.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "To-Do nicht gefunden")
    return todo


@router.get("/{client_id}/todos/{todo_id}/checklist", response_model=list[ChecklistItemOut])
def list_checklist(client_id: str, todo_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _scoped_todo(client_id, todo_id, user, db).checklist


@router.post("/{client_id}/todos/{todo_id}/checklist", response_model=ChecklistItemOut, status_code=201)
def add_checklist(client_id: str, todo_id: str, data: ChecklistCreate,
                  user: User = Depends(require_agency), db: Session = Depends(get_db)):
    todo = _scoped_todo(client_id, todo_id, user, db)
    pos = (max((i.position for i in todo.checklist), default=-1)) + 1
    item = ChecklistItem(todo_id=todo_id, text=data.text[:512], position=pos)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{client_id}/todos/{todo_id}/checklist/{item_id}", response_model=ChecklistItemOut)
def update_checklist(client_id: str, todo_id: str, item_id: str, data: ChecklistPatch,
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _scoped_todo(client_id, todo_id, user, db)
    item = db.get(ChecklistItem, item_id)
    if not item or item.todo_id != todo_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Punkt nicht gefunden")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{client_id}/todos/{todo_id}/checklist/{item_id}", status_code=204)
def delete_checklist(client_id: str, todo_id: str, item_id: str,
                     user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _scoped_todo(client_id, todo_id, user, db)
    item = db.get(ChecklistItem, item_id)
    if item and item.todo_id == todo_id:
        db.delete(item)
        db.commit()


@router.delete("/{client_id}/todos/{todo_id}", status_code=204)
def delete_todo(
    client_id: str, todo_id: str,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    get_scoped_client(client_id, user, db)
    todo = db.get(Todo, todo_id)
    if todo and todo.client_id == client_id:
        db.delete(todo)
        db.commit()


# --- Verlauf / Updates ---
@router.get("/{client_id}/updates", response_model=list[UpdateOut])
def list_updates(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(ClientUpdate).filter(ClientUpdate.client_id == client_id)
            .order_by(ClientUpdate.created_at.desc()).all())


@router.post("/{client_id}/updates", response_model=UpdateOut, status_code=201)
def create_update(
    client_id: str, data: UpdateCreate,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Eintrag in den Verlauf. Agentur postet Updates/Notizen/Meilensteine;
    der Kunde kann ebenfalls schreiben (zwei-Wege-Kommunikation, Kategorie
    'message')."""
    client = get_scoped_client(client_id, user, db)
    category = "message" if user.role == UserRole.client_user else data.category
    upd = ClientUpdate(
        client_id=client_id, title=data.title, body=data.body, category=category,
        author_name=user.full_name or user.email,
    )
    db.add(upd)
    notify_counterparts(
        db, author=user, org_id=user.organization_id, client_id=client_id,
        type_="message",
        title=f"Neue Nachricht: {client.name}" if user.role != UserRole.client_user
              else f"Nachricht von {client.name}",
        body=(data.title or data.body)[:140],
        link=f"/clients/{client_id}",
    )
    db.commit()
    db.refresh(upd)
    return upd


@router.delete("/{client_id}/updates/{update_id}", status_code=204)
def delete_update(
    client_id: str, update_id: str,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    get_scoped_client(client_id, user, db)
    upd = db.get(ClientUpdate, update_id)
    if upd and upd.client_id == client_id:
        db.delete(upd)
        db.commit()


@router.get("/{client_id}/accounts", response_model=list[AccountOut])
def list_accounts(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    return client.accounts


@router.post("/{client_id}/accounts", response_model=AccountOut, status_code=201)
def add_account(
    client_id: str,
    data: AccountCreate,
    user: User = Depends(require_agency),
    db: Session = Depends(get_db),
):
    client = get_scoped_client(client_id, user, db)
    account = Account(
        client_id=client.id, type=data.type, external_id=data.external_id, label=data.label
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _scoped_account(client_id: str, account_id: str, user: User, db: Session) -> Account:
    get_scoped_client(client_id, user, db)
    account = db.get(Account, account_id)
    if not account or account.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Konto nicht gefunden")
    return account


@router.put("/{client_id}/accounts/{account_id}/credentials", response_model=CredentialStatus)
def set_credentials(
    client_id: str,
    account_id: str,
    data: CredentialIn,
    user: User = Depends(require_agency),
    db: Session = Depends(get_db),
):
    """Hinterlegt die Google-API-Zugangsdaten dieses Kontos (verschlüsselt).
    Manuell pro Kunde – Secrets werden nie wieder ausgegeben."""
    account = _scoped_account(client_id, account_id, user, db)
    payload = data.as_payload()
    cred = account.credential or GoogleCredential(account_id=account.id)
    cred.encrypted_payload = encrypt_json(payload)
    db.add(cred)
    db.commit()
    return CredentialStatus(configured=True, fields_present=sorted(payload.keys()))


@router.get("/{client_id}/accounts/{account_id}/credentials", response_model=CredentialStatus)
def credential_status(
    client_id: str, account_id: str,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    account = _scoped_account(client_id, account_id, user, db)
    if account.credential and account.credential.encrypted_payload:
        from app.core.crypto import decrypt_json
        fields = sorted(decrypt_json(account.credential.encrypted_payload).keys())
        return CredentialStatus(configured=True, fields_present=fields)
    return CredentialStatus(configured=False)


@router.delete("/{client_id}/accounts/{account_id}/credentials", status_code=204)
def delete_credentials(
    client_id: str, account_id: str,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    account = _scoped_account(client_id, account_id, user, db)
    if account.credential:
        db.delete(account.credential)
        db.commit()


@router.post("/{client_id}/invite", status_code=201)
def invite_client_user(
    client_id: str,
    data: InviteClientUser,
    user: User = Depends(require_agency),
    db: Session = Depends(get_db),
) -> dict:
    """Legt einen Kunden-Login an. Ohne Passwort wird ein Einladungslink
    erzeugt (Kunde legt sein Passwort selbst fest) und – falls Microsoft
    verbunden – per E-Mail versendet."""
    client = get_scoped_client(client_id, user, db)
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "E-Mail bereits registriert")
    if data.password and (msg := password_problem(data.password)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)

    invite_mode = not data.password
    token = pysecrets.token_urlsafe(24) if invite_mode else ""
    new_user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password or pysecrets.token_urlsafe(16)),
        role=UserRole.client_user,
        organization_id=user.organization_id,
        client_id=client.id,
        invite_token=token,
        invite_expires=(datetime.now(timezone.utc) + timedelta(days=14)) if invite_mode else None,
    )
    db.add(new_user)
    db.commit()

    result: dict = {"id": new_user.id, "email": new_user.email, "invite": invite_mode}
    if invite_mode:
        base = _settings.public_base_url.rstrip("/")
        link = f"{base}/einladung/{token}"
        result["invite_url"] = link
        result["emailed"] = False
        org = db.get(Organization, user.organization_id)
        if org and org.ms_refresh_token:
            try:
                from app.api.routes.mail import render_email_html, send_via_graph
                body = (f"Hallo{(' ' + data.full_name) if data.full_name else ''},\n\n"
                        f"du wurdest zum Kundenportal eingeladen. Bitte lege hier dein Passwort fest:\n\n"
                        f"{link}\n\nDer Link ist 14 Tage gültig.\n\nBeste Grüße")
                send_via_graph(org, data.email, "Deine Einladung zum Kundenportal",
                               render_email_html(org, body), html=True)
                result["emailed"] = True
            except Exception as exc:  # noqa: BLE001
                result["email_error"] = str(exc)[:200]
    return result


@router.get("/{client_id}/access")
def list_client_access(client_id: str, request: Request,
                       user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    """Kunden-Logins dieses Kunden: aktiv oder Einladung offen."""
    get_scoped_client(client_id, user, db)
    users = (db.query(User).filter(User.client_id == client_id, User.role == UserRole.client_user)
             .order_by(User.created_at.desc()).all())
    host = request.headers.get("host", "")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    base = f"{proto}://{host}" if host and "localhost" not in host else _settings.public_base_url.rstrip("/")
    out = []
    for u in users:
        pending = bool(u.invite_token)
        exp = u.invite_expires
        expired = False
        if pending and exp is not None:
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            expired = exp < datetime.now(timezone.utc)
        out.append({
            "id": u.id, "email": u.email, "full_name": u.full_name,
            "status": ("abgelaufen" if expired else "eingeladen") if pending else "aktiv",
            "two_factor": u.totp_enabled,
            "invite_url": f"{base}/einladung/{u.invite_token}" if pending else "",
            "created_at": u.created_at.isoformat(),
        })
    return out


@router.delete("/{client_id}/access/{user_id}", status_code=204)
def revoke_client_access(client_id: str, user_id: str,
                         user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    u = db.get(User, user_id)
    if u and u.client_id == client_id and u.role == UserRole.client_user:
        db.delete(u)
        db.commit()


@router.post("/{client_id}/complete-onboarding", response_model=ClientOut)
def complete_onboarding(
    client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)
):
    client = get_scoped_client(client_id, user, db)
    client.onboarding_completed = True
    db.commit()
    db.refresh(client)
    return client
