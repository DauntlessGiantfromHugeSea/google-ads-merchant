"""Zahlungen (einfaches Kassenbuch): Ein-/Ausgänge mit Absender/IBAN/Betreff.
Optional an einen Kunden oder eine Rechnung gekoppelt (setzt sie dann bezahlt)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, Invoice, Payment, User
from app.schemas import PaymentIn, PaymentOut

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _out(p: Payment, db: Session) -> PaymentOut:
    client = db.get(Client, p.client_id) if p.client_id else None
    inv = db.get(Invoice, p.invoice_id) if p.invoice_id else None
    return PaymentOut(
        id=p.id, date=p.date, direction=p.direction, amount=p.amount, currency=p.currency,
        counterparty=p.counterparty, iban=p.iban, reference=p.reference, note=p.note,
        client_id=p.client_id, client_name=client.name if client else "",
        invoice_id=p.invoice_id, invoice_number=inv.number if inv else "",
    )


def _apply_links(p: Payment, data: PaymentIn, user: User, db: Session) -> None:
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
    if data.invoice_id:
        inv = db.get(Invoice, data.invoice_id)
        if not inv or inv.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Rechnung nicht gefunden")
        # Eingang auf eine Rechnung -> Rechnung als bezahlt markieren.
        if data.direction == "in" and inv.status != "bezahlt":
            inv.status = "bezahlt"
            try:
                inv.paid_at = datetime.fromisoformat((data.date or "")[:10]).replace(tzinfo=timezone.utc)
            except ValueError:
                inv.paid_at = datetime.now(timezone.utc)
        if not p.client_id and inv.client_id:
            p.client_id = inv.client_id


@router.get("", response_model=list[PaymentOut])
def list_payments(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    rows = (db.query(Payment).filter(Payment.organization_id == user.organization_id)
            .order_by(Payment.date.desc(), Payment.created_at.desc()).all())
    return [_out(p, db) for p in rows]


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment(data: PaymentIn, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    p = Payment(organization_id=user.organization_id, date=(data.date or "")[:10],
                direction="out" if data.direction == "out" else "in", amount=abs(data.amount or 0),
                currency=data.currency or "EUR", counterparty=data.counterparty.strip(),
                iban=data.iban.strip(), reference=data.reference.strip(), note=data.note.strip(),
                client_id=data.client_id or None, invoice_id=data.invoice_id or None,
                created_by=user.full_name or user.email)
    _apply_links(p, data, user, db)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _out(p, db)


@router.patch("/{pay_id}", response_model=PaymentOut)
def update_payment(pay_id: str, data: PaymentIn, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    p = db.get(Payment, pay_id)
    if not p or p.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zahlung nicht gefunden")
    p.date = (data.date or "")[:10]
    p.direction = "out" if data.direction == "out" else "in"
    p.amount = abs(data.amount or 0)
    p.currency = data.currency or "EUR"
    p.counterparty = data.counterparty.strip()
    p.iban = data.iban.strip()
    p.reference = data.reference.strip()
    p.note = data.note.strip()
    p.client_id = data.client_id or None
    p.invoice_id = data.invoice_id or None
    _apply_links(p, data, user, db)
    db.commit()
    db.refresh(p)
    return _out(p, db)


@router.delete("/{pay_id}", status_code=204)
def delete_payment(pay_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    p = db.get(Payment, pay_id)
    if p and p.organization_id == user.organization_id:
        db.delete(p)
        db.commit()
