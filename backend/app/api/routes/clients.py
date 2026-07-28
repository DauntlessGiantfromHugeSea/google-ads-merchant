"""Kundenverwaltung + Onboarding (Konten verknüpfen, Kunden-User einladen)."""
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.config import get_settings
from app.core.crypto import encrypt_json
from app.core.security import create_access_token, hash_password
from app.database import get_db
from app.models import (
    Account,
    Client,
    ClientUpdate,
    GoogleCredential,
    Organization,
    Todo,
    User,
    UserRole,
)

_settings = get_settings()
from app.schemas import (
    AccountCreate,
    AccountOut,
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
@router.get("/{client_id}/todos", response_model=list[TodoOut])
def list_todos(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(Todo).filter(Todo.client_id == client_id)
            .order_by(Todo.created_at.desc()).all())


@router.post("/{client_id}/todos", response_model=TodoOut, status_code=201)
def create_todo(
    client_id: str, data: TodoCreate,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    get_scoped_client(client_id, user, db)
    todo = Todo(client_id=client_id, **data.model_dump())
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.patch("/{client_id}/todos/{todo_id}", response_model=TodoOut)
def update_todo(
    client_id: str, todo_id: str, data: TodoPatch,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    get_scoped_client(client_id, user, db)
    todo = db.get(Todo, todo_id)
    if not todo or todo.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "To-Do nicht gefunden")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(todo, field, value)
    db.commit()
    db.refresh(todo)
    return todo


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
    get_scoped_client(client_id, user, db)
    category = "message" if user.role == UserRole.client_user else data.category
    upd = ClientUpdate(
        client_id=client_id, title=data.title, body=data.body, category=category,
        author_name=user.full_name or user.email,
    )
    db.add(upd)
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
def list_accounts(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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


@router.post("/{client_id}/complete-onboarding", response_model=ClientOut)
def complete_onboarding(
    client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)
):
    client = get_scoped_client(client_id, user, db)
    client.onboarding_completed = True
    db.commit()
    db.refresh(client)
    return client
