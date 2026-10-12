"""Daueraufträge (Dauerrechnungen als offene Posten – ohne Versand).

Ein Dauerauftrag erzeugt periodisch (monatlich/quartalsweise/jährlich) einen
fälligen Posten, der im Überblick als „offen" erscheint, bis er als bezahlt
markiert wird. So behältst du den Überblick, welche Zahlung fällig ist.
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_scoped_client, require_agency
from app.models import Client, StandingCharge, StandingOrder, User

router = APIRouter(prefix="/api/standing", tags=["standing"])

_STEP = {"monthly": 1, "quarterly": 3, "yearly": 12}


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _parse_day(s: str) -> date | None:
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _add_months(y: int, m: int, n: int) -> tuple[int, int]:
    idx = (y * 12 + (m - 1)) + n
    return idx // 12, idx % 12 + 1


def _due_date(y: int, m: int, day: int) -> str:
    d = min(max(int(day or 1), 1), 28)
    return f"{y:04d}-{m:02d}-{d:02d}"


def _materialize(db: Session, org_id: str) -> None:
    """Legt für alle aktiven Daueraufträge die fälligen Posten bis zum heutigen
    Monat an (idempotent über period je Auftrag)."""
    today = _today()
    cur_idx = today.year * 12 + (today.month - 1)
    orders = db.query(StandingOrder).filter(
        StandingOrder.organization_id == org_id, StandingOrder.active.is_(True)).all()
    if not orders:
        return
    existing = {(c.order_id, c.period) for c in db.query(
        StandingCharge.order_id, StandingCharge.period).filter(
        StandingCharge.organization_id == org_id).all()}
    step = None
    changed = False
    for o in orders:
        step = _STEP.get(o.interval, 1)
        start = _parse_day(o.start_date) or o.created_at.date()
        y, m = start.year, start.month
        # bis einschließlich aktuellem Monat, in Intervallschritten
        while (y * 12 + (m - 1)) <= cur_idx:
            period = f"{y:04d}-{m:02d}"
            if (o.id, period) not in existing:
                db.add(StandingCharge(
                    organization_id=org_id, client_id=o.client_id, order_id=o.id,
                    period=period, due_date=_due_date(y, m, o.due_day),
                    title=o.title, amount=o.amount, currency=o.currency, status="open"))
                changed = True
            y, m = _add_months(y, m, step)
    if changed:
        db.commit()


def _order_out(o: StandingOrder, names: dict) -> dict:
    return {"id": o.id, "client_id": o.client_id, "client_name": names.get(o.client_id, ""),
            "title": o.title, "amount": o.amount, "currency": o.currency,
            "interval": o.interval, "due_day": o.due_day, "start_date": o.start_date,
            "active": o.active, "created_at": o.created_at.isoformat() if o.created_at else ""}


# ---------- Daueraufträge (Regeln) ----------
@router.get("/orders")
def list_orders(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    org_id = user.organization_id
    names = {c.id: c.name for c in db.query(Client).filter(Client.organization_id == org_id).all()}
    rows = db.query(StandingOrder).filter(
        StandingOrder.organization_id == org_id).order_by(StandingOrder.created_at.desc()).all()
    return [_order_out(o, names) for o in rows]


@router.post("/orders", status_code=201)
def create_order(data: dict, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    client = get_scoped_client((data.get("client_id") or "").strip(), user, db)
    interval = data.get("interval") if data.get("interval") in _STEP else "monthly"
    o = StandingOrder(
        organization_id=user.organization_id, client_id=client.id,
        title=(data.get("title") or "Dauerauftrag").strip()[:255],
        amount=float(data.get("amount") or 0), currency=(data.get("currency") or "EUR")[:8],
        interval=interval, due_day=min(max(int(data.get("due_day") or 1), 1), 28),
        start_date=(data.get("start_date") or _today().isoformat())[:10],
        active=bool(data.get("active", True)), created_by=(user.full_name or user.email))
    db.add(o)
    db.commit()
    _materialize(db, user.organization_id)
    names = {client.id: client.name}
    return _order_out(o, names)


@router.patch("/orders/{order_id}")
def update_order(order_id: str, data: dict, user: User = Depends(require_agency),
                 db: Session = Depends(get_db)) -> dict:
    o = db.get(StandingOrder, order_id)
    if not o or o.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dauerauftrag nicht gefunden")
    for k in ("title", "currency", "start_date"):
        if data.get(k) is not None:
            setattr(o, k, str(data[k])[:255])
    if data.get("amount") is not None:
        o.amount = float(data["amount"])
    if data.get("interval") in _STEP:
        o.interval = data["interval"]
    if data.get("due_day") is not None:
        o.due_day = min(max(int(data["due_day"]), 1), 28)
    if "active" in data:
        o.active = bool(data["active"])
    db.commit()
    _materialize(db, user.organization_id)
    names = {c.id: c.name for c in db.query(Client).filter(
        Client.organization_id == user.organization_id).all()}
    return _order_out(o, names)


@router.delete("/orders/{order_id}", status_code=204)
def delete_order(order_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> None:
    o = db.get(StandingOrder, order_id)
    if o and o.organization_id == user.organization_id:
        db.query(StandingCharge).filter(StandingCharge.order_id == o.id).delete(synchronize_session=False)
        db.delete(o)
        db.commit()


# ---------- Fällige Posten (offen/bezahlt) ----------
@router.get("/charges")
def list_charges(status_: str = "open", user: User = Depends(require_agency),
                 db: Session = Depends(get_db)) -> dict:
    org_id = user.organization_id
    _materialize(db, org_id)
    names = {c.id: c.name for c in db.query(Client).filter(Client.organization_id == org_id).all()}
    q = db.query(StandingCharge).filter(StandingCharge.organization_id == org_id)
    if status_ in ("open", "paid"):
        q = q.filter(StandingCharge.status == status_)
    rows = q.order_by(StandingCharge.due_date.desc()).all()
    today = _today().isoformat()
    items = [{
        "id": c.id, "client_id": c.client_id, "client_name": names.get(c.client_id, ""),
        "order_id": c.order_id, "title": c.title, "period": c.period, "due_date": c.due_date,
        "amount": c.amount, "currency": c.currency, "status": c.status,
        "overdue": c.status == "open" and bool(c.due_date) and c.due_date <= today,
        "paid_at": c.paid_at.isoformat() if c.paid_at else "",
    } for c in rows]
    open_total = sum(c.amount for c in rows if c.status == "open")
    return {"charges": items, "open_total": open_total,
            "open_count": sum(1 for c in rows if c.status == "open")}


@router.post("/charges/{charge_id}/paid")
def mark_paid(charge_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    c = db.get(StandingCharge, charge_id)
    if not c or c.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Posten nicht gefunden")
    c.status = "paid"
    c.paid_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/charges/{charge_id}/open")
def mark_open(charge_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    c = db.get(StandingCharge, charge_id)
    if not c or c.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Posten nicht gefunden")
    c.status = "open"
    c.paid_at = None
    db.commit()
    return {"ok": True}
