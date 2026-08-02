"""Rechnungs-Register: extern erstellte (E-)Rechnungen hochladen und den
Zahlungsstatus verwalten. Erstellt keine Rechnungen – nur Übersicht/Status."""
import base64
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_agency
from app.api.routes.mail import render_email_html, send_via_graph
from app.database import get_db
from app.models import Client, Invoice, Organization, User
from app.schemas import InvoiceOut, InvoiceUpdate
from app.services import einvoice

router = APIRouter(prefix="/api/invoices", tags=["invoices"])
_MAX_BYTES = 15 * 1024 * 1024  # 15 MB


def _is_overdue(inv: Invoice) -> bool:
    return bool(inv.status == "offen" and inv.due_date and inv.due_date < date.today().isoformat())


def _out(inv: Invoice, db: Session) -> InvoiceOut:
    client = db.get(Client, inv.client_id) if inv.client_id else None
    return InvoiceOut(
        id=inv.id, number=inv.number, amount=inv.amount, currency=inv.currency,
        issue_date=inv.issue_date, due_date=inv.due_date, status=inv.status,
        overdue=_is_overdue(inv), note=inv.note, source=inv.source,
        filename=inv.filename, has_file=bool(inv.data_base64),
        client_id=inv.client_id, client_name=client.name if client else "",
        created_at=inv.created_at,
    )


@router.get("", response_model=list[InvoiceOut])
def list_invoices(client_id: str | None = None, status_filter: str | None = None,
                  user: User = Depends(require_agency), db: Session = Depends(get_db)):
    q = db.query(Invoice).filter(Invoice.organization_id == user.organization_id)
    if client_id:
        q = q.filter(Invoice.client_id == client_id)
    rows = q.order_by(Invoice.issue_date.desc(), Invoice.created_at.desc()).all()
    out = [_out(i, db) for i in rows]
    if status_filter == "offen":
        out = [o for o in out if o.status == "offen"]
    elif status_filter == "ueberfaellig":
        out = [o for o in out if o.overdue]
    elif status_filter == "bezahlt":
        out = [o for o in out if o.status == "bezahlt"]
    return out


@router.post("", response_model=InvoiceOut, status_code=201)
async def upload_invoice(
    file: UploadFile | None = File(None),
    client_id: str = Form(""), number: str = Form(""), amount: float = Form(0.0),
    currency: str = Form("EUR"), issue_date: str = Form(""), due_date: str = Form(""),
    note: str = Form(""),
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    """Rechnung anlegen. Optional mit Datei; bei E-Rechnung (XRechnung/ZUGFeRD)
    werden fehlende Felder automatisch ausgelesen."""
    data = b""
    filename = content_type = ""
    source = "upload"
    if file is not None:
        data = await file.read()
        if len(data) > _MAX_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datei zu groß (max. 15 MB)")
        filename = file.filename or "rechnung"
        content_type = file.content_type or "application/octet-stream"
        parsed = einvoice.parse_einvoice(data, content_type, filename)
        if parsed:
            source = parsed.pop("source", "xrechnung")
            number = number or parsed.get("number", "")
            amount = amount or parsed.get("amount", 0.0)
            currency = parsed.get("currency") or currency
            issue_date = issue_date or parsed.get("issue_date", "")
            due_date = due_date or parsed.get("due_date", "")

    if client_id:
        c = db.get(Client, client_id)
        if not c or c.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kunde nicht gefunden")

    inv = Invoice(
        organization_id=user.organization_id, client_id=client_id or None,
        number=number, amount=amount, currency=currency or "EUR",
        issue_date=issue_date, due_date=due_date, note=note, source=source,
        filename=filename, content_type=content_type,
        data_base64=base64.b64encode(data).decode() if data else "",
        created_by=user.full_name or user.email,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _out(inv, db)


@router.patch("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: str, data: InvoiceUpdate,
                   user: User = Depends(require_agency), db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rechnung nicht gefunden")
    payload = data.model_dump(exclude_unset=True)
    if payload.get("client_id"):
        c = db.get(Client, payload["client_id"])
        if not c or c.organization_id != user.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kunde nicht gefunden")
    for field, value in payload.items():
        setattr(inv, field, value)
    if payload.get("status") == "bezahlt" and not inv.paid_at:
        inv.paid_at = datetime.now(timezone.utc)
    if payload.get("status") == "offen":
        inv.paid_at = None
    db.commit()
    db.refresh(inv)
    return _out(inv, db)


@router.delete("/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if inv and inv.organization_id == user.organization_id:
        db.delete(inv)
        db.commit()


@router.get("/{invoice_id}/file")
def download_invoice(invoice_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.organization_id != user.organization_id or not inv.data_base64:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Keine Datei vorhanden")
    return Response(
        content=base64.b64decode(inv.data_base64),
        media_type=inv.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{inv.filename or "rechnung"}"'},
    )


@router.post("/{invoice_id}/remind")
def remind_invoice(invoice_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Zahlungserinnerung an den Kunden per Microsoft-Mail."""
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rechnung nicht gefunden")
    client = db.get(Client, inv.client_id) if inv.client_id else None
    to = (client.billing_email or client.contact_email) if client else ""
    if not to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Für den Kunden ist keine E-Mail hinterlegt.")
    org = db.get(Organization, user.organization_id)
    body = (f"Sehr geehrte Damen und Herren,\n\n"
            f"unsere Rechnung {inv.number or ''} über {inv.amount:.2f} {inv.currency} "
            f"(fällig am {inv.due_date or '–'}) ist noch offen.\n"
            f"Wir bitten um Ausgleich. Falls sich Ihre Zahlung überschnitten hat, "
            f"betrachten Sie diese Erinnerung als gegenstandslos.\n\n"
            f"Freundliche Grüße")
    send_via_graph(org, to=to, subject=f"Zahlungserinnerung Rechnung {inv.number or ''}".strip(),
                   body=render_email_html(org, body), html=True)
    inv.reminded_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "to": to}
