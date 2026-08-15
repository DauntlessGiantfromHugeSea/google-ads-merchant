"""Hilfsfunktionen zum Erzeugen von In-App-Benachrichtigungen.

Empfänger-Logik:
- Agentur schreibt -> alle Kunden-Logins des Kunden werden benachrichtigt.
- Kunde schreibt   -> alle Agentur-Nutzer der Organisation.
Der Auslöser selbst wird nie benachrichtigt.
"""
from __future__ import annotations

import threading

from sqlalchemy.orm import Session

from app.models import Notification, User, UserRole

# Ereignisse, die zusätzlich per E-Mail (über Microsoft-Mail) verschickt werden.
EMAIL_TYPES = {
    "contract_signed", "offer_accepted", "task_assigned", "briefing_new",
    "participant_new", "approval_requested", "approval_responded", "appointment",
}


def _email_worker(org_id: str, user_ids: list[str], title: str, body: str, link: str) -> None:
    """Läuft im Hintergrund mit eigener DB-Session (blockiert den Request nicht)."""
    from app.config import get_settings
    from app.database import SessionLocal
    from app.models import Organization
    db = SessionLocal()
    try:
        org = db.get(Organization, org_id)
        if not org or not org.email_notifications or not org.ms_refresh_token:
            return
        recips = db.query(User).filter(User.id.in_(user_ids), User.is_active.is_(True)).all()
        if not recips:
            return
        from app.api.routes.mail import render_email_html, send_via_graph
        base = get_settings().public_base_url.rstrip("/")
        text = f"{title}\n\n{body}" + (f"\n\n{base}{link}" if link else "")
        html = render_email_html(org, text)
        for u in recips:
            if u.email:
                try:
                    send_via_graph(org, u.email, title, html, html=True)
                except Exception:
                    pass
    finally:
        db.close()


def _maybe_email(org_id: str, user_ids: list[str], type_: str, title: str, body: str, link: str) -> None:
    if type_ in EMAIL_TYPES and user_ids:
        threading.Thread(target=_email_worker, args=(org_id, list(user_ids), title, body, link),
                         daemon=True).start()


def _add(db: Session, *, org_id: str, user_id: str, client_id: str | None,
         type_: str, title: str, body: str, link: str) -> None:
    db.add(Notification(
        organization_id=org_id, user_id=user_id, client_id=client_id,
        type=type_, title=title, body=body, link=link,
    ))


def notify_users(db: Session, user_ids: list[str], *, org_id: str, client_id: str | None,
                 type_: str, title: str, body: str = "", link: str = "",
                 exclude_user_id: str | None = None, suppress_email: bool = False) -> None:
    recips = [uid for uid in set(user_ids) if uid and uid != exclude_user_id]
    for uid in recips:
        _add(db, org_id=org_id, user_id=uid, client_id=client_id,
             type_=type_, title=title, body=body, link=link)
    if not suppress_email:
        _maybe_email(org_id, recips, type_, title, body, link)


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
