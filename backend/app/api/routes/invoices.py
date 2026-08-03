"""Rechnungs-Register: extern erstellte (E-)Rechnungen hochladen und den
Zahlungsstatus verwalten. Erstellt keine Rechnungen – nur Übersicht/Status."""
import base64
import io
import os
import zipfile
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_agency
from app.api.routes.mail import render_email_html, send_via_graph
from app.database import get_db
from app.models import Client, Invoice, Organization, User
from app.schemas import InvoiceOut, InvoiceUpdate
from app.services import einvoice, pdf, timeutil

router = APIRouter(prefix="/api/invoices", tags=["invoices"])
_MAX_BYTES = 15 * 1024 * 1024  # 15 MB


def _basis_month(inv: Invoice, basis: str) -> str:
    if basis == "service":
        return inv.service_period or (inv.issue_date or "")[:7]
    if basis == "paid":
        return inv.paid_at.date().isoformat()[:7] if (inv.status == "bezahlt" and inv.paid_at) else ""
    return (inv.issue_date or "")[:7]


def _in_scope(inv: Invoice, year: str, month: int, basis: str) -> bool:
    m = _basis_month(inv, basis)
    if not m or m[:4] != year:
        return False
    if month and m[5:7] != f"{month:02d}":
        return False
    return True


def _is_overdue(inv: Invoice) -> bool:
    return bool(inv.status == "offen" and inv.due_date and inv.due_date < date.today().isoformat())


def _out(inv: Invoice, db: Session) -> InvoiceOut:
    client = db.get(Client, inv.client_id) if inv.client_id else None
    return InvoiceOut(
        id=inv.id, number=inv.number, amount=inv.amount, currency=inv.currency,
        issue_date=inv.issue_date, due_date=inv.due_date, service_period=inv.service_period or "",
        status=inv.status, overdue=_is_overdue(inv), note=inv.note, source=inv.source,
        paid_at=inv.paid_at.date().isoformat() if inv.paid_at else "",
        filename=inv.filename, has_file=bool(inv.data_base64),
        has_receipt=bool(inv.receipt_base64), receipt_filename=inv.receipt_filename or "",
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
    service_period: str = Form(""), note: str = Form(""),
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
        issue_date=issue_date, due_date=due_date, service_period=(service_period or "")[:7],
        note=note, source=source,
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


@router.post("/{invoice_id}/receipt", response_model=InvoiceOut)
async def upload_receipt(invoice_id: str, file: UploadFile = File(...),
                        user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Zahlungsbeleg (Kontoauszug/Nachweis) zur Rechnung hochladen."""
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rechnung nicht gefunden")
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datei zu groß (max. 15 MB)")
    inv.receipt_filename = file.filename or "beleg"
    inv.receipt_content_type = file.content_type or "application/octet-stream"
    inv.receipt_base64 = base64.b64encode(data).decode()
    db.commit()
    db.refresh(inv)
    return _out(inv, db)


@router.get("/{invoice_id}/receipt")
def download_receipt(invoice_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.organization_id != user.organization_id or not inv.receipt_base64:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kein Beleg vorhanden")
    return Response(content=base64.b64decode(inv.receipt_base64),
                    media_type=inv.receipt_content_type or "application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{inv.receipt_filename or "beleg"}"'})


@router.delete("/{invoice_id}/receipt", status_code=204)
def delete_receipt(invoice_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if inv and inv.organization_id == user.organization_id:
        inv.receipt_filename = inv.receipt_content_type = inv.receipt_base64 = ""
        db.commit()


def _scope_invoices(user: User, db: Session, year: str, month: int, basis: str, client_id: str | None):
    q = db.query(Invoice).filter(Invoice.organization_id == user.organization_id, Invoice.status != "storniert")
    if client_id:
        q = q.filter(Invoice.client_id == client_id)
    rows = [i for i in q.all() if _in_scope(i, year, month, basis)]
    rows.sort(key=lambda i: (i.issue_date or "", i.number or ""))
    return rows


def _period_label(year: str, month: int) -> str:
    names = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
             "September", "Oktober", "November", "Dezember"]
    return f"{names[month]} {year}" if month else f"Jahr {year}"


def _report_payload(rows, client, org) -> dict:
    tz = (org.timezone if org else None) or "Europe/Berlin"
    payload = {
        "client_name": client.name if client else "",
        "period": "", "basis": "",
        "generated_at": timeutil.now_local_str("%d.%m.%Y", tz, with_tz=False),
        "rows": [{"number": i.number, "issue_date": i.issue_date, "service_period": i.service_period,
                  "amount": f"{i.amount:.2f} {i.currency}", "status": i.status,
                  "paid_at": i.paid_at.date().isoformat() if i.paid_at else ""} for i in rows],
        "gestellt": f"{sum(i.amount for i in rows):.2f} €",
        "bezahlt": f"{sum(i.amount for i in rows if i.status == 'bezahlt'):.2f} €",
        "offen": f"{sum(i.amount for i in rows if i.status == 'offen'):.2f} €",
    }
    return payload


@router.get("/report/pdf")
def report_pdf(year: str, month: int = 0, basis: str = "issue", client_id: str | None = None,
               user: User = Depends(require_agency), db: Session = Depends(get_db)):
    rows = _scope_invoices(user, db, year, month, basis, client_id)
    client = db.get(Client, client_id) if client_id else None
    org = db.get(Organization, user.organization_id)
    payload = _report_payload(rows, client, org)
    payload["period"] = _period_label(year, month)
    payload["basis"] = {"service": "Leistungszeitraum", "paid": "Zahlungsdatum"}.get(basis, "Rechnungsdatum")
    data = pdf.render_kostenaufstellung_pdf(payload)
    fn = f"Kostenaufstellung-{client.name if client else 'alle'}-{year}{'-' + f'{month:02d}' if month else ''}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.get("/report/zip")
def report_zip(year: str, month: int = 0, basis: str = "issue", client_id: str | None = None,
               user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Komplett-Export: Kostenaufstellung-PDF + alle Rechnungen + alle Belege."""
    rows = _scope_invoices(user, db, year, month, basis, client_id)
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Keine Rechnungen im Zeitraum")
    client = db.get(Client, client_id) if client_id else None
    org = db.get(Organization, user.organization_id)
    payload = _report_payload(rows, client, org)
    payload["period"] = _period_label(year, month)
    payload["basis"] = {"service": "Leistungszeitraum", "paid": "Zahlungsdatum"}.get(basis, "Rechnungsdatum")
    pdf_data = pdf.render_kostenaufstellung_pdf(payload)

    buf = io.BytesIO()
    ext = lambda name, ct: (os.path.splitext(name or "")[1] or "").lstrip(".") or ("pdf" if "pdf" in (ct or "") else "dat")
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        if pdf_data:
            z.writestr("Kostenaufstellung.pdf", pdf_data)
        for i in rows:
            tag = (i.number or i.id[:8]).replace("/", "-")
            if i.data_base64:
                z.writestr(f"Rechnungen/Rechnung_{tag}.{ext(i.filename, i.content_type)}", base64.b64decode(i.data_base64))
            if i.receipt_base64:
                z.writestr(f"Belege/Beleg_{tag}.{ext(i.receipt_filename, i.receipt_content_type)}", base64.b64decode(i.receipt_base64))
    buf.seek(0)
    client = db.get(Client, client_id) if client_id else None
    fn = f"Kostenaufstellung-{client.name if client else 'alle'}-{year}.zip".replace(" ", "_")
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


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
