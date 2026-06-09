"""Dependencies: aktueller Nutzer aus JWT + Mandanten-/Rollenprüfung."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models import Client, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Ungültiges Token")
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nutzer nicht gefunden/inaktiv")

    # Impersonation: Agentur sieht die Kundenansicht. Der echte Nutzer muss
    # Agentur sein und der Kunde zur eigenen Organisation gehören. Das User-
    # Objekt wird aus der Session gelöst und nur in-memory umgeschaltet
    # (keine DB-Änderung).
    imp = payload.get("imp_client")
    if imp and user.role != UserRole.client_user:
        from app.models import Client  # noqa: PLC0415
        client = db.get(Client, imp)
        if client and client.organization_id == user.organization_id:
            db.expunge(user)
            user.role = UserRole.client_user
            user.client_id = imp
    return user


def require_agency(user: User = Depends(get_current_user)) -> User:
    if user.role == UserRole.client_user:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur für Agentur-Nutzer")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.agency_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur für Agentur-Admins")
    return user


def get_scoped_client(client_id: str, user: User, db: Session) -> Client:
    """Lädt einen Kunden und erzwingt Mandantentrennung.

    - Agentur-Nutzer: nur Kunden der eigenen Organization.
    - Kunden-Nutzer: ausschließlich der eigene verknüpfte Kunde.
    """
    client = db.get(Client, client_id)
    if not client or client.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kunde nicht gefunden")
    if user.role == UserRole.client_user and user.client_id != client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Kein Zugriff auf diesen Kunden")
    return client
