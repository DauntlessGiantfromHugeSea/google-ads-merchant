"""Hilfsfunktionen zum Erzeugen von In-App-Benachrichtigungen.

Empfänger-Logik:
- Agentur schreibt -> alle Kunden-Logins des Kunden werden benachrichtigt.
- Kunde schreibt   -> alle Agentur-Nutzer der Organisation.
Der Auslöser selbst wird nie benachrichtigt.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Notification, User, UserRole


def _add(db: Session, *, org_id: str, user_id: str, client_id: str | None,
         type_: str, title: str, body: str, link: str) -> None:
    db.add(Notification(
        organization_id=org_id, user_id=user_id, client_id=client_id,
        type=type_, title=title, body=body, link=link,
    ))


def notify_users(db: Session, user_ids: list[str], *, org_id: str, client_id: str | None,
                 type_: str, title: str, body: str = "", link: str = "",
                 exclude_user_id: str | None = None) -> None:
    for uid in set(user_ids):
        if uid and uid != exclude_user_id:
            _add(db, org_id=org_id, user_id=uid, client_id=client_id,
                 type_=type_, title=title, body=body, link=link)


def _agency_user_ids(db: Session, org_id: str) -> list[str]:
    return [u.id for u in db.query(User.id).filter(
        User.organization_id == org_id, User.role != UserRole.client_user,
        User.is_active.is_(True)).all()]


def _agency_admin_ids(db: Session, org_id: str) -> list[str]:
    return [u.id for u in db.query(User.id).filter(
        User.organization_id == org_id, User.role == UserRole.agency_admin,
        User.is_active.is_(True)).all()]


def _client_user_ids(db: Session, client_id: str) -> list[str]:
    return [u.id for u in db.query(User.id).filter(
        User.client_id == client_id, User.is_active.is_(True)).all()]


def notify_client_users(db: Session, client_id: str, *, org_id: str, type_: str,
                        title: str, body: str = "", link: str = "",
                        exclude_user_id: str | None = None) -> None:
    notify_users(db, _client_user_ids(db, client_id), org_id=org_id, client_id=client_id,
                 type_=type_, title=title, body=body, link=link, exclude_user_id=exclude_user_id)


def notify_counterparts(db: Session, *, author: User, org_id: str, client_id: str,
                        type_: str, title: str, body: str = "", link: str = "") -> None:
    """Benachrichtigt die jeweils andere Seite (Agentur <-> Kunde)."""
    if author.role == UserRole.client_user:
        recipients = _agency_user_ids(db, org_id)
    else:
        recipients = _client_user_ids(db, client_id)
    notify_users(db, recipients, org_id=org_id, client_id=client_id,
                 type_=type_, title=title, body=body, link=link,
                 exclude_user_id=author.id)
