"""Interne Zugangsdaten je Kunde – nur fürs Agentur-Team.

Benutzername/Passwort/Notiz werden verschlüsselt gespeichert (Fernet). Das
Passwort wird beim Auflisten NICHT mitgeschickt, sondern nur auf Anfrage über
den reveal-Endpunkt. Kunden haben keinen Zugriff (require_agency)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.core.crypto import decrypt_json, encrypt_json
from app.database import get_db
from app.models import Credential, User
from app.schemas import VaultCredentialIn, VaultCredentialOut, VaultCredentialReveal

router = APIRouter(prefix="/api/clients/{client_id}/credentials", tags=["credentials"])


def _payload(c: Credential) -> dict:
    try:
        return decrypt_json(c.payload_enc) if c.payload_enc else {}
    except Exception:
        return {}


def _out(c: Credential) -> VaultCredentialOut:
    p = _payload(c)
    return VaultCredentialOut(
        id=c.id, label=c.label, url=c.url, category=c.category,
        username=p.get("username", ""), notes=p.get("notes", ""),
        has_password=bool(p.get("password")), created_by=c.created_by, updated_at=c.updated_at,
    )


def _load(client_id: str, cred_id: str, user: User, db: Session) -> Credential:
    get_scoped_client(client_id, user, db)
    c = db.get(Credential, cred_id)
    if not c or c.client_id != client_id or c.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zugangsdaten nicht gefunden")
    return c


@router.get("", response_model=list[VaultCredentialOut])
def list_credentials(client_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    rows = (db.query(Credential)
            .filter(Credential.client_id == client_id, Credential.organization_id == user.organization_id)
            .order_by(Credential.category, Credential.label).all())
    return [_out(c) for c in rows]


@router.post("", response_model=VaultCredentialOut, status_code=201)
def create_credential(client_id: str, data: VaultCredentialIn,
                      user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    c = Credential(
        organization_id=user.organization_id, client_id=client_id,
        label=data.label.strip(), url=data.url.strip(), category=data.category.strip(),
        payload_enc=encrypt_json({"username": data.username, "password": data.password, "notes": data.notes}),
        created_by=user.full_name or user.email,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _out(c)


@router.put("/{cred_id}", response_model=VaultCredentialOut)
def update_credential(client_id: str, cred_id: str, data: VaultCredentialIn,
                      user: User = Depends(require_agency), db: Session = Depends(get_db)):
    c = _load(client_id, cred_id, user, db)
    # Leeres Passwort beim Bearbeiten = unverändert lassen.
    pw = data.password or _payload(c).get("password", "")
    c.label = data.label.strip()
    c.url = data.url.strip()
    c.category = data.category.strip()
    c.payload_enc = encrypt_json({"username": data.username, "password": pw, "notes": data.notes})
    c.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    return _out(c)


@router.get("/{cred_id}/reveal", response_model=VaultCredentialReveal)
def reveal_credential(client_id: str, cred_id: str,
                      user: User = Depends(require_agency), db: Session = Depends(get_db)):
    c = _load(client_id, cred_id, user, db)
    return VaultCredentialReveal(password=_payload(c).get("password", ""))


@router.delete("/{cred_id}", status_code=204)
def delete_credential(client_id: str, cred_id: str,
                      user: User = Depends(require_agency), db: Session = Depends(get_db)):
    c = _load(client_id, cred_id, user, db)
    db.delete(c)
    db.commit()
