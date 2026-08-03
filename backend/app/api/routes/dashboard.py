"""Agentur-Dashboard: Kennzahlen, gebuchte Pakete, letzte Aktivitäten."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.database import get_db
from app.models import Client, ClientUpdate, ReportRun, Todo, User
from app.services.notify import _agency_user_ids, notify_users

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_EXPIRY_WINDOW_DAYS = 30  # so viele Tage vorher warnen


def _days_until(iso: str) -> int | None:
    try:
        return (date.fromisoformat(iso[:10]) - date.today()).days
    except (ValueError, TypeError):
        return None


def _check_expiring_contracts(db: Session, clients: list[Client], org_id: str) -> list[dict]:
    """Verträge, die bald auslaufen. Beim Eintritt ins Fenster einmalig die
    Agentur benachrichtigen (Flag verhindert Wiederholung)."""
    expiring: list[dict] = []
    agency_ids = None
    changed = False
    for c in clients:
        if c.status == "beendet" or not c.contract_end:
            continue
        days = _days_until(c.contract_end)
        if days is None or days < 0 or days > _EXPIRY_WINDOW_DAYS:
            continue
        expiring.append({"client_id": c.id, "client_name": c.name,
                         "contract_end": c.contract_end, "days_left": days})
        if not c.contract_end_notified:
            if agency_ids is None:
                agency_ids = _agency_user_ids(db, org_id)
            notify_users(db, agency_ids, org_id=org_id, client_id=c.id,
                         type_="contract_expiring", title="Vertrag läuft bald aus",
                         body=f"{c.name}: endet am {c.contract_end} (in {days} Tagen)",
                         link=f"/clients/{c.id}")
            c.contract_end_notified = True
            changed = True
    if changed:
        db.commit()
    expiring.sort(key=lambda e: e["days_left"])
    return expiring


@router.get("")
def dashboard(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    org = user.organization_id
    clients = db.query(Client).filter(Client.organization_id == org).all()
    client_ids = [c.id for c in clients]

    status_counts: dict[str, int] = {}
    packages: dict[str, list[dict]] = {}
    for c in clients:
        status_counts[c.status or "aktiv"] = status_counts.get(c.status or "aktiv", 0) + 1
        pkg = (c.contract_package or "").strip() or "Kein Paket"
        packages.setdefault(pkg, []).append({"id": c.id, "name": c.name, "fee": c.contract_fee})

    open_todos = (db.query(Todo).filter(Todo.client_id.in_(client_ids), Todo.status != "done").count()
                  if client_ids else 0)
    reports_total = (db.query(ReportRun).filter(ReportRun.client_id.in_(client_ids)).count()
                     if client_ids else 0)

    recent = []
    if client_ids:
        name_by_id = {c.id: c.name for c in clients}
        for u in (db.query(ClientUpdate).filter(ClientUpdate.client_id.in_(client_ids))
                  .order_by(ClientUpdate.created_at.desc()).limit(8).all()):
            recent.append({
                "client_id": u.client_id, "client_name": name_by_id.get(u.client_id, ""),
                "title": u.title, "body": u.body, "category": u.category,
                "author_name": u.author_name, "created_at": u.created_at.isoformat(),
            })

    expiring = _check_expiring_contracts(db, clients, org)
    # Abgelaufene Upload-Dateien (>Aufbewahrung) aufräumen.
    try:
        from app.api.routes.filerequests import cleanup_expired
        cleanup_expired(db, org)
    except Exception:
        pass

    return {
        "clients_total": len(clients),
        "status_counts": status_counts,
        "open_todos": open_todos,
        "reports_total": reports_total,
        "packages": sorted(
            [{"package": k, "count": len(v), "clients": v} for k, v in packages.items()],
            key=lambda p: p["count"], reverse=True),
        "recent_updates": recent,
        "expiring_contracts": expiring,
    }
