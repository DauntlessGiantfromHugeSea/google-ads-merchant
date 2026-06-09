"""Kundenverwaltung + Onboarding (Konten verknüpfen, Kunden-User einladen)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.core.crypto import encrypt_json
from app.core.security import hash_password
from app.database import get_db
from app.models import Account, Client, GoogleCredential, User, UserRole
from app.schemas import (
    AccountCreate,
    AccountOut,
    ClientCreate,
    ClientOut,
    CredentialIn,
    CredentialStatus,
    InviteClientUser,
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


@router.post("/{client_id}/invite", response_model=UserOut, status_code=201)
def invite_client_user(
    client_id: str,
    data: InviteClientUser,
    user: User = Depends(require_agency),
    db: Session = Depends(get_db),
):
    """Legt einen Kunden-Login an, der nur diesen Kunden sieht.

    (MVP: Passwort wird direkt gesetzt. Später: Einladungs-E-Mail mit Link.)
    """
    client = get_scoped_client(client_id, user, db)
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "E-Mail bereits registriert")
    new_user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=UserRole.client_user,
        organization_id=user.organization_id,
        client_id=client.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/{client_id}/complete-onboarding", response_model=ClientOut)
def complete_onboarding(
    client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)
):
    client = get_scoped_client(client_id, user, db)
    client.onboarding_completed = True
    db.commit()
    db.refresh(client)
    return client
