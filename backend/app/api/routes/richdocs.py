"""Report-/Brief-Builder: Dokumente aus Blöcken, als PDF und per Mail."""
import io

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, Organization, RichDoc, User
from app.schemas import RichDocBrief, RichDocIn, RichDocOut, RichDocSend
from app.services import pdf

router = APIRouter(prefix="/api/richdocs", tags=["richdocs"])


def _out(d: RichDoc, db: Session) -> RichDocOut:
    client = db.get(Client, d.client_id) if d.client_id else None
    return RichDocOut(id=d.id, title=d.title, theme=d.theme, accent=d.accent, footer=d.footer,
                      blocks=d.blocks or [], client_id=d.client_id,
                      client_name=client.name if client else "", updated_at=d.updated_at)


def _payload(d: RichDoc) -> dict:
    return {"title": d.title, "theme": d.theme, "accent": d.accent, "footer": d.footer, "blocks": d.blocks or []}


def _load(doc_id: str, user: User, db: Session) -> RichDoc:
    d = db.get(RichDoc, doc_id)
    if not d or d.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dokument nicht gefunden")
    return d


@router.get("", response_model=list[RichDocBrief])
def list_docs(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    rows = (db.query(RichDoc).filter(RichDoc.organization_id == user.organization_id)
            .order_by(RichDoc.updated_at.desc()).all())
    out = []
    for d in rows:
        client = db.get(Client, d.client_id) if d.client_id else None
        out.append(RichDocBrief(id=d.id, title=d.title or "Ohne Titel", theme=d.theme,
                                client_name=client.name if client else "", updated_at=d.updated_at))
    return out


@router.post("", response_model=RichDocOut, status_code=201)
def create_doc(data: RichDocIn, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
    d = RichDoc(organization_id=user.organization_id, client_id=data.client_id or None,
                title=data.title or "Neues Dokument", theme=data.theme or "editorial",
                accent=data.accent or "#4a7c2f", footer=data.footer or "", blocks=data.blocks or [],
                created_by=user.full_name or user.email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return _out(d, db)


@router.get("/{doc_id}", response_model=RichDocOut)
def get_doc(doc_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    return _out(_load(doc_id, user, db), db)


@router.put("/{doc_id}", response_model=RichDocOut)
def update_doc(doc_id: str, data: RichDocIn, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    d = _load(doc_id, user, db)
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
    d.title = data.title or d.title
    d.theme = data.theme or "editorial"
    d.accent = data.accent or "#4a7c2f"
    d.footer = data.footer or ""
    d.blocks = data.blocks or []
    d.client_id = data.client_id or None
    db.commit()
    db.refresh(d)
    return _out(d, db)


@router.delete("/{doc_id}", status_code=204)
def delete_doc(doc_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    d = _load(doc_id, user, db)
    db.delete(d)
    db.commit()


@router.get("/{doc_id}/pdf")
def doc_pdf(doc_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    d = _load(doc_id, user, db)
    data = pdf.render_richdoc_pdf(_payload(d))
    fn = f"{d.title or 'Dokument'}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.post("/{doc_id}/send")
def send_doc(doc_id: str, data: RichDocSend, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    d = _load(doc_id, user, db)
    to = (data.to or "").strip()
    if not to and d.client_id:
        client = db.get(Client, d.client_id)
        to = (client.billing_email or client.contact_email) if client else ""
    if not to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keine Empfänger-Adresse.")
    org = db.get(Organization, user.organization_id)
    import base64  # noqa: PLC0415
    from app.api.routes.mail import render_email_html, send_via_graph  # noqa: PLC0415
    pdf_bytes = pdf.render_richdoc_pdf(_payload(d))
    body = data.message.strip() or f"Guten Tag,\n\nanbei „{d.title}“ als PDF.\n\nFreundliche Grüße"
    send_via_graph(org, to=to, subject=data.subject.strip() or d.title or "Dokument",
                   body=render_email_html(org, body), html=True,
                   attachments=[{"name": f"{(d.title or 'Dokument').replace(' ', '_')}.pdf",
                                 "contentType": "application/pdf",
                                 "contentBytes": base64.b64encode(pdf_bytes).decode()}])
    return {"ok": True, "to": to}
