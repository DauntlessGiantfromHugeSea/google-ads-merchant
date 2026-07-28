"""Agentur-Dashboard: Kennzahlen, gebuchte Pakete, letzte Aktivitäten."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.database import get_db
from app.models import Client, ClientUpdate, ReportRun, Todo, User

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


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

    return {
        "clients_total": len(clients),
        "status_counts": status_counts,
        "open_todos": open_todos,
        "reports_total": reports_total,
        "packages": sorted(
            [{"package": k, "count": len(v), "clients": v} for k, v in packages.items()],
            key=lambda p: p["count"], reverse=True),
        "recent_updates": recent,
    }
