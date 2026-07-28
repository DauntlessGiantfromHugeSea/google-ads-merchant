"""Angebote: erstellen, PDF (Briefpapier), per Mail senden, online ansehen/annehmen."""
import io
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import Client, Offer, OfferItem, Organization, User
from app.schemas import OfferAccept, OfferCreate, OfferItemOut, OfferOut, OfferUpdate
from app.services import pdf
from app.services.notify import _agency_user_ids, notify_users

settings = get_settings()
client_router = APIRouter(prefix="/api/clients/{client_id}/offers", tags=["offers"])
public_router = APIRouter(prefix="/api/offers", tags=["offers"])


def _eur(n: float) -> str:
    return f"{n:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _qty(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else f"{n:.2f}".replace(".", ",")


def _totals(offer: Offer):
    net = sum(i.quantity * i.unit_price for i in offer.items)
    vat = net * (offer.vat_rate or 0) / 100
    return round(net, 2), round(vat, 2), round(net + vat, 2)


def _out(offer: Offer, db: Session) -> OfferOut:
    net, vat, gross = _totals(offer)
    client = db.get(Client, offer.client_id)
    items = [OfferItemOut(id=i.id, position=i.position, description=i.description,
                          quantity=i.quantity, unit=i.unit, unit_price=i.unit_price,
                          line_total=round(i.quantity * i.unit_price, 2)) for i in offer.items]
    return OfferOut(
        id=offer.id, client_id=offer.client_id, client_name=client.name if client else "",
        number=offer.number, date=offer.date, title=offer.title, intro=offer.intro,
        status=offer.status, vat_rate=offer.vat_rate, public_token=offer.public_token,
        accepted_by=offer.accepted_by, created_at=offer.created_at, sent_at=offer.sent_at,
        accepted_at=offer.accepted_at, items=items, net=net, vat=vat, gross=gross)


def _set_items(offer: Offer, items, db: Session) -> None:
    for old in list(offer.items):
        db.delete(old)
    offer.items = []
    for idx, it in enumerate(items, start=1):
        offer.items.append(OfferItem(position=idx, description=it.description,
                                     quantity=it.quantity, unit=it.unit, unit_price=it.unit_price))


def _pdf_payload(offer: Offer, db: Session) -> dict:
    net, vat, gross = _totals(offer)
    client = db.get(Client, offer.client_id)
    items = []
    for i in offer.items:
        parts = (i.description or "").split("\n", 1)
        items.append({"position": i.position, "title": parts[0],
                      "desc": parts[1].strip() if len(parts) > 1 else "",
                      "quantity_str": _qty(i.quantity), "unit": i.unit,
                      "amount_str": _eur(round(i.quantity * i.unit_price, 2))})
    return {
        "recipient": {
            "company": (client.company or client.name) if client else "",
            "name": client.contact_person if client else "",
            "address": (client.billing_address or client.address) if client else "",
        },
        "number": offer.number, "date": offer.date, "title": offer.title, "intro": offer.intro,
        "positions": items, "show_vat": (offer.vat_rate or 0) > 0,
        "vat_rate_str": _qty(offer.vat_rate or 0),
        "net_str": _eur(net), "vat_str": _eur(vat), "gross_str": _eur(gross),
        "accepted_at": offer.accepted_at.strftime("%d.%m.%Y") if offer.accepted_at else "",
        "accepted_by": offer.accepted_by,
    }


@client_router.post("", response_model=OfferOut, status_code=201)
def create_offer(client_id: str, data: OfferCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    number = data.number
    if not number:
        n = db.query(Offer).filter(Offer.organization_id == user.organization_id).count() + 1
        number = f"AG-{datetime.now(timezone.utc):%y%m%d}-{n}"
    date = data.date or datetime.now(timezone.utc).strftime("%d.%m.%Y")
    offer = Offer(organization_id=user.organization_id, client_id=client_id, number=number,
                  date=date, title=data.title, intro=data.intro, vat_rate=data.vat_rate,
                  public_token=pysecrets.token_urlsafe(20))
    db.add(offer)
    _set_items(offer, data.items, db)
    db.commit()
    db.refresh(offer)
    return _out(offer, db)


@client_router.get("", response_model=list[OfferOut])
def list_offers(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    offers = db.query(Offer).filter(Offer.client_id == client_id).order_by(Offer.created_at.desc()).all()
    return [_out(o, db) for o in offers]


def _load(client_id, offer_id, user, db, agency=False) -> Offer:
    get_scoped_client(client_id, user, db)
    offer = db.get(Offer, offer_id)
    if not offer or offer.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Angebot nicht gefunden")
    return offer


@client_router.get("/{offer_id}", response_model=OfferOut)
def get_offer(client_id: str, offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(_load(client_id, offer_id, user, db), db)


@client_router.post("/{offer_id}/accept", response_model=OfferOut)
def accept_offer_inapp(client_id: str, offer_id: str,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Angenommen durch einen eingeloggten Nutzer (Kunde/Agentur) – bereits per
    Login verifiziert, daher ohne Code."""
    offer = _load(client_id, offer_id, user, db)
    if offer.status != "accepted":
        offer.status = "accepted"
        offer.accepted_by = user.full_name or user.email
        offer.accepted_email = user.email
        offer.accepted_at = datetime.now(timezone.utc)
        client = db.get(Client, client_id)
        if client and client.status == "lead":
            client.status = "aktiv"
        notify_users(db, _agency_user_ids(db, offer.organization_id),
                     org_id=offer.organization_id, client_id=client_id,
                     type_="offer_accepted", title=f"Angebot {offer.number} angenommen",
                     body=f"{offer.accepted_by} · {client.name if client else ''}",
                     link=f"/clients/{client_id}")
        db.commit()
        db.refresh(offer)
    return _out(offer, db)


@client_router.patch("/{offer_id}", response_model=OfferOut)
def update_offer(client_id: str, offer_id: str, data: OfferUpdate,
                 user: User = Depends(require_agency), db: Session = Depends(get_db)):
    offer = _load(client_id, offer_id, user, db)
    for f in ("title", "number", "date", "intro", "vat_rate"):
        v = getattr(data, f)
        if v is not None:
            setattr(offer, f, v)
    if data.items is not None:
        _set_items(offer, data.items, db)
    db.commit()
    db.refresh(offer)
    return _out(offer, db)


@client_router.delete("/{offer_id}", status_code=204)
def delete_offer(client_id: str, offer_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    offer = _load(client_id, offer_id, user, db)
    db.delete(offer)
    db.commit()


@client_router.get("/{offer_id}/pdf")
def offer_pdf(client_id: str, offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load(client_id, offer_id, user, db)
    data = pdf.render_offer_pdf(_pdf_payload(offer, db))
    fn = f"Angebot-{offer.number}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@client_router.post("/{offer_id}/send")
def send_offer(client_id: str, offer_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    offer = _load(client_id, offer_id, user, db)
    client = db.get(Client, client_id)
    to = (client.billing_email or client.contact_email) if client else ""
    if not to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keine Kunden-E-Mail hinterlegt.")
    org = db.get(Organization, user.organization_id)
    link = f"{settings.public_base_url.rstrip('/')}/angebot/{offer.public_token}"
    from app.api.routes.mail import render_email_html, send_via_graph
    body = (f"Guten Tag,\n\nanbei unser Angebot {offer.number}. Du kannst es online ansehen "
            f"und direkt annehmen:\n\n{link}\n\nBeste Grüße")
    pdf_bytes = pdf.render_offer_pdf(_pdf_payload(offer, db))
    import base64
    send_via_graph(org, to, f"Angebot {offer.number}", render_email_html(org, body), html=True,
                   attachments=[{"name": f"Angebot-{offer.number}.pdf", "contentType": "application/pdf",
                                 "contentBytes": base64.b64encode(pdf_bytes).decode()}])
    if offer.status == "draft":
        offer.status = "sent"
    offer.sent_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "to": to, "link": link}


# --- Öffentlich (ohne Login) ---
def _by_token(token: str, db: Session) -> Offer:
    offer = db.query(Offer).filter(Offer.public_token == token).first()
    if not offer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Angebot nicht gefunden")
    return offer


def _client_email(client: Client | None) -> str:
    if not client:
        return ""
    return (client.billing_email or client.contact_email or "").strip()


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return ""
    local, _, domain = email.partition("@")
    dl = (local[0] + "•" * max(1, len(local) - 1)) if local else ""
    dom_name, _, tld = domain.partition(".")
    dd = (dom_name[0] + "•" * max(1, len(dom_name) - 1)) if dom_name else ""
    return f"{dl}@{dd}.{tld}" if tld else f"{dl}@{dd}"


def _mail_ready(offer: Offer, client: Client | None, db: Session) -> bool:
    org = db.get(Organization, offer.organization_id)
    return bool(org and org.ms_refresh_token and _client_email(client))


@public_router.get("/{token}")
def public_offer(token: str, db: Session = Depends(get_db)) -> dict:
    offer = _by_token(token, db)
    org = db.get(Organization, offer.organization_id)
    client = db.get(Client, offer.client_id)
    out = _out(offer, db).model_dump()
    out["net_str"] = _eur(out["net"]); out["vat_str"] = _eur(out["vat"]); out["gross_str"] = _eur(out["gross"])
    out["items"] = [{**it, "line_total_str": _eur(it["line_total"]), "quantity_str": _qty(it["quantity"])}
                    for it in out["items"]]
    out["agency"] = {"name": getattr(org, "agency_contact_name", "") or (org.name if org else ""),
                     "email": getattr(org, "agency_contact_email", "") or ""}
    # Verifizierungs-Infos für die Annahme
    out["verify"] = {
        "email_hint": _mask_email(_client_email(client)),
        "mail": _mail_ready(offer, client, db),  # Code per Mail möglich?
        "has_email": bool(_client_email(client)),
    }
    return out


@public_router.post("/{token}/request-code")
def request_accept_code(token: str, db: Session = Depends(get_db)) -> dict:
    """Sendet einen 6-stelligen Bestätigungscode an die hinterlegte Kunden-Mail."""
    offer = _by_token(token, db)
    if offer.status == "accepted":
        return {"already": True}
    client = db.get(Client, offer.client_id)
    to = _client_email(client)
    if not to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Für diesen Kunden ist keine E-Mail hinterlegt.")
    org = db.get(Organization, offer.organization_id)
    if not (org and org.ms_refresh_token):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "E-Mail-Versand ist nicht eingerichtet.")
    code = f"{pysecrets.randbelow(1000000):06d}"
    offer.accept_code = code
    offer.accept_code_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    from app.api.routes.mail import render_email_html, send_via_graph
    body = (f"Guten Tag,\n\nzur verbindlichen Annahme von Angebot {offer.number} lautet dein "
            f"Bestätigungscode:\n\n    {code}\n\nDer Code ist 15 Minuten gültig. Wenn du das Angebot "
            f"nicht annehmen möchtest, ignoriere diese E-Mail einfach.")
    send_via_graph(org, to, f"Bestätigungscode für Angebot {offer.number}",
                   render_email_html(org, body), html=True)
    db.commit()
    return {"sent": True, "email_hint": _mask_email(to)}


@public_router.post("/{token}/accept")
def accept_offer(token: str, data: OfferAccept, db: Session = Depends(get_db)) -> dict:
    offer = _by_token(token, db)
    if offer.status == "accepted":
        return {"ok": True, "already": True}
    client = db.get(Client, offer.client_id)
    target = _client_email(client).lower()
    entered = (data.email or "").strip().lower()

    if _mail_ready(offer, client, db):
        # Code-Verifizierung (Code ging an die hinterlegte Kunden-Mail)
        now = datetime.now(timezone.utc)
        exp = offer.accept_code_expires
        if exp is not None and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if not offer.accept_code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte zuerst einen Bestätigungscode anfordern.")
        if not exp or exp < now:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Der Code ist abgelaufen. Bitte neu anfordern.")
        if (data.code or "").strip() != offer.accept_code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code ungültig.")
        verified_email = _client_email(client)
    elif target:
        # Fallback ohne Mailversand: eingegebene Adresse muss zur hinterlegten passen.
        if not entered:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte deine E-Mail-Adresse zur Bestätigung eingeben.")
        if entered != target:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Die E-Mail-Adresse stimmt nicht mit der hinterlegten Adresse überein.")
        verified_email = _client_email(client)
    else:
        # Kein E-Mail-Bezug hinterlegt: nur Name, aber Adresse mitschreiben.
        if not entered:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte deine E-Mail-Adresse eingeben.")
        verified_email = data.email.strip()

    offer.status = "accepted"
    offer.accepted_by = (data.name or verified_email)[:255]
    offer.accepted_email = verified_email[:255]
    offer.accepted_at = datetime.now(timezone.utc)
    offer.accept_code = ""
    offer.accept_code_expires = None
    if client and client.status == "lead":
        client.status = "aktiv"
    # Agentur benachrichtigen
    notify_users(db, _agency_user_ids(db, offer.organization_id),
                 org_id=offer.organization_id, client_id=offer.client_id,
                 type_="offer_accepted", title=f"Angebot {offer.number} angenommen",
                 body=f"{offer.accepted_by} · {client.name if client else ''}",
                 link=f"/clients/{offer.client_id}")
    db.commit()
    return {"ok": True}
