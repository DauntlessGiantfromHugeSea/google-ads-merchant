"""Verträge je Kunde – online digital unterschreibbar (einfache elektronische
Signatur: gezeichnete/getippte Unterschrift + E-Mail-Verifizierung + Audit)."""
import io
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import Client, Contract, Organization, User
from app.schemas import ContractCreate, ContractOut, ContractPatch, ContractSign
from app.services import pdf
from app.services.notify import _agency_user_ids, notify_users

settings = get_settings()
client_router = APIRouter(prefix="/api/clients/{client_id}/contracts", tags=["contracts"])
public_router = APIRouter(prefix="/api/contracts", tags=["contracts"])


def _aware(dt):
    return dt if (dt is None or dt.tzinfo) else dt.replace(tzinfo=timezone.utc)


def _client_email(client) -> str:
    return (client.billing_email or client.contact_email or "").strip() if client else ""


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return ""
    local, _, domain = email.partition("@")
    dom, _, tld = domain.partition(".")
    m = lambda s: (s[0] + "•" * max(1, len(s) - 1)) if s else ""
    return f"{m(local)}@{m(dom)}.{tld}" if tld else f"{m(local)}@{m(dom)}"


def _mail_ready(contract, client, db) -> bool:
    org = db.get(Organization, contract.organization_id)
    return bool(org and org.ms_refresh_token and _client_email(client))


def _body_lines(body: str) -> list[dict]:
    out = []
    for raw in (body or "").split("\n"):
        t = raw.rstrip()
        if not t.strip():
            continue
        out.append({"text": t, "heading": t.lstrip().startswith("§")})
    return out


def _pdf_payload(contract: Contract) -> dict:
    fdt = lambda dt, f: _aware(dt).strftime(f) if dt else ""
    return {
        "id": contract.id, "number": contract.number, "date": contract.date,
        "title": contract.title, "body_lines": _body_lines(contract.body),
        "provider_block": contract.provider_block, "client_block": contract.client_block,
        "fully_signed": bool(contract.signed_at and contract.agency_signed_at),
        # Kunde
        "signer_name": contract.signer_name, "signer_email": contract.signer_email,
        "signature_image": contract.signature_image,
        "signed_at": fdt(contract.signed_at, "%d.%m.%Y %H:%M UTC"),
        "signed_date": fdt(contract.signed_at, "%d.%m.%Y"), "signed_ip": contract.signed_ip,
        # Agentur
        "agency_signer_name": contract.agency_signer_name,
        "agency_signature_image": contract.agency_signature_image,
        "agency_signed_at": fdt(contract.agency_signed_at, "%d.%m.%Y %H:%M UTC"),
        "agency_signed_date": fdt(contract.agency_signed_at, "%d.%m.%Y"),
    }


def _out(c: Contract) -> ContractOut:
    return ContractOut.model_validate(c)


def _load(client_id: str, cid: str, user: User, db: Session) -> Contract:
    get_scoped_client(client_id, user, db)
    c = db.get(Contract, cid)
    if not c or c.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vertrag nicht gefunden")
    return c


def _valid_signature(sig: str) -> str:
    """Nur eine dekodierbare PNG/JPEG-Data-URL zulassen (sonst leer) – schützt
    die PDF-Erzeugung vor kaputten Bilddaten."""
    if not sig.startswith("data:image/") or "," not in sig or len(sig) > 2_000_000:
        return ""
    import base64
    from io import BytesIO
    try:
        from PIL import Image  # noqa: PLC0415
        raw = base64.b64decode(sig.split(",", 1)[1], validate=True)
        Image.open(BytesIO(raw)).verify()
        return sig
    except Exception:
        return ""


def _provider_block(org) -> str:
    parts = [org.name if org else ""]
    if org and org.agency_contact_name:
        parts.append(org.agency_contact_name)
    if org and org.agency_address:
        parts.append(org.agency_address)
    return "\n".join(p for p in parts if p).strip()


def _client_block(client) -> str:
    if not client:
        return ""
    parts = [client.company or client.name]
    addr = client.billing_address or client.address
    if addr:
        parts.append(addr)
    return "\n".join(p for p in parts if p).strip()


def _complete_if_done(c: Contract) -> None:
    """Vollständig unterschrieben, wenn beide Parteien signiert haben."""
    if c.agency_signed_at and c.signed_at:
        c.status = "signed"
    elif c.status == "draft":
        c.status = "sent"


def _finalize_sign(contract: Contract, name: str, email: str, signature: str, ip: str, db: Session) -> None:
    """Unterschrift des Kunden."""
    contract.signer_name = name[:255]
    contract.signer_email = email[:255]
    contract.signature_image = _valid_signature(signature)
    contract.signed_ip = ip[:64]
    contract.signed_at = datetime.now(timezone.utc)
    contract.sign_code = ""
    contract.sign_code_expires = None
    _complete_if_done(contract)
    both = bool(contract.agency_signed_at)
    notify_users(db, _agency_user_ids(db, contract.organization_id),
                 org_id=contract.organization_id, client_id=contract.client_id,
                 type_="contract_signed",
                 title=f"Vertrag {contract.number}: Kunde hat unterschrieben"
                       + (" (vollständig)" if both else ""),
                 body=f"{name}", link=f"/clients/{contract.client_id}")


def _finalize_agency_sign(contract: Contract, name: str, signature: str) -> None:
    """Unterschrift der Agentur (Dienstleister)."""
    contract.agency_signer_name = name[:255]
    contract.agency_signature_image = _valid_signature(signature)
    contract.agency_signed_at = datetime.now(timezone.utc)
    _complete_if_done(contract)


# --- Agentur (eingeloggt) ---
@client_router.post("", response_model=ContractOut, status_code=201)
def create_contract(client_id: str, data: ContractCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    client = get_scoped_client(client_id, user, db)
    org = db.get(Organization, user.organization_id)
    number = data.number or f"V-{datetime.now(timezone.utc):%y%m%d}-{db.query(Contract).filter(Contract.organization_id == user.organization_id).count() + 1}"
    date = data.date or datetime.now(timezone.utc).strftime("%d.%m.%Y")
    c = Contract(organization_id=user.organization_id, client_id=client_id, number=number, date=date,
                 title=data.title, body=data.body, public_token=pysecrets.token_urlsafe(20),
                 provider_block=data.provider_block or _provider_block(org),
                 client_block=data.client_block or _client_block(client))
    db.add(c)
    db.commit()
    db.refresh(c)
    return _out(c)


@client_router.get("", response_model=list[ContractOut])
def list_contracts(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return [_out(c) for c in db.query(Contract).filter(Contract.client_id == client_id)
            .order_by(Contract.created_at.desc()).all()]


@client_router.patch("/{cid}", response_model=ContractOut)
def update_contract(client_id: str, cid: str, data: ContractPatch, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    c = _load(client_id, cid, user, db)
    if c.signed_at or c.agency_signed_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bereits unterschriebener Vertrag kann nicht geändert werden.")
    for f, v in data.model_dump(exclude_unset=True).items():
        setattr(c, f, v)
    db.commit()
    db.refresh(c)
    return _out(c)


@client_router.delete("/{cid}", status_code=204)
def delete_contract(client_id: str, cid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    c = _load(client_id, cid, user, db)
    db.delete(c)
    db.commit()


@client_router.get("/{cid}/pdf")
def contract_pdf(client_id: str, cid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _load(client_id, cid, user, db)
    data = pdf.render_contract_pdf(_pdf_payload(c))
    fn = f"Vertrag-{c.number}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@client_router.post("/{cid}/send")
def send_contract(client_id: str, cid: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    c = _load(client_id, cid, user, db)
    client = db.get(Client, client_id)
    to = _client_email(client)
    if not to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keine Kunden-E-Mail hinterlegt.")
    org = db.get(Organization, user.organization_id)
    link = f"{settings.public_base_url.rstrip('/')}/vertrag/{c.public_token}"
    from app.api.routes.mail import render_email_html, send_via_graph
    body = (f"Guten Tag,\n\nanbei unser Vertrag {c.number}. Du kannst ihn online ansehen und direkt "
            f"digital unterschreiben:\n\n{link}\n\nBeste Grüße")
    send_via_graph(org, to, f"Vertrag {c.number}", render_email_html(org, body), html=True)
    if c.status == "draft":
        c.status = "sent"
    c.sent_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "to": to, "link": link}


@client_router.post("/{cid}/sign", response_model=ContractOut)
def sign_inapp(client_id: str, cid: str, data: ContractSign, request: Request,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unterschrift durch einen eingeloggten Nutzer – per Login verifiziert,
    daher ohne Code. Agentur-Nutzer signieren die Dienstleister-Seite, der
    Kunden-Login die Kunden-Seite."""
    from app.models import UserRole  # noqa: PLC0415
    c = _load(client_id, cid, user, db)
    name = data.name or user.full_name or user.email
    if user.role == UserRole.client_user:
        if c.signed_at:
            return _out(c)
        ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
              or (request.client.host if request.client else ""))
        _finalize_sign(c, name, user.email, data.signature_image, ip, db)
    else:
        if c.agency_signed_at:
            return _out(c)
        _finalize_agency_sign(c, name, data.signature_image)
    db.commit()
    db.refresh(c)
    return _out(c)


# --- Öffentlich (ohne Login) ---
def _by_token(token: str, db: Session) -> Contract:
    c = db.query(Contract).filter(Contract.public_token == token).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vertrag nicht gefunden")
    return c


@public_router.get("/{token}")
def public_contract(token: str, db: Session = Depends(get_db)) -> dict:
    c = _by_token(token, db)
    org = db.get(Organization, c.organization_id)
    client = db.get(Client, c.client_id)
    return {
        "number": c.number, "date": c.date, "title": c.title, "body": c.body, "status": c.status,
        "provider_block": c.provider_block, "client_block": c.client_block,
        "signer_name": c.signer_name,
        "signed_at": _aware(c.signed_at).strftime("%d.%m.%Y %H:%M") if c.signed_at else "",
        "client_signed": bool(c.signed_at),
        "agency_signer_name": c.agency_signer_name,
        "agency_signed": bool(c.agency_signed_at),
        "agency_signature_image": c.agency_signature_image,
        "agency": {"name": getattr(org, "agency_contact_name", "") or (org.name if org else ""),
                   "email": getattr(org, "agency_contact_email", "") or ""},
        "verify": {"mail": _mail_ready(c, client, db), "email_hint": _mask_email(_client_email(client)),
                   "has_email": bool(_client_email(client))},
    }


@public_router.get("/{token}/pdf")
def public_contract_pdf(token: str, db: Session = Depends(get_db)):
    """PDF über den Link – so kann auch der Kunde den (signierten) Vertrag laden."""
    c = _by_token(token, db)
    data = pdf.render_contract_pdf(_pdf_payload(c))
    fn = f"Vertrag-{c.number}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@public_router.post("/{token}/request-code")
def request_code(token: str, db: Session = Depends(get_db)) -> dict:
    c = _by_token(token, db)
    if c.signed_at:
        return {"already": True}
    client = db.get(Client, c.client_id)
    to = _client_email(client)
    org = db.get(Organization, c.organization_id)
    if not to or not (org and org.ms_refresh_token):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "E-Mail-Versand ist nicht eingerichtet.")
    code = f"{pysecrets.randbelow(1000000):06d}"
    c.sign_code = code
    c.sign_code_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    from app.api.routes.mail import render_email_html, send_via_graph
    body = (f"Guten Tag,\n\nzur digitalen Unterschrift von Vertrag {c.number} lautet dein "
            f"Bestätigungscode:\n\n    {code}\n\nDer Code ist 15 Minuten gültig.")
    send_via_graph(org, to, f"Bestätigungscode für Vertrag {c.number}", render_email_html(org, body), html=True)
    db.commit()
    return {"sent": True, "email_hint": _mask_email(to)}


@public_router.post("/{token}/sign")
def sign_contract(token: str, data: ContractSign, request: Request, db: Session = Depends(get_db)) -> dict:
    c = _by_token(token, db)
    if c.signed_at:
        return {"ok": True, "already": True}
    if not data.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte deinen Namen eingeben.")
    client = db.get(Client, c.client_id)
    target = _client_email(client).lower()
    entered = (data.email or "").strip().lower()

    if _mail_ready(c, client, db):
        now = datetime.now(timezone.utc)
        exp = _aware(c.sign_code_expires)
        if not c.sign_code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte zuerst einen Bestätigungscode anfordern.")
        if not exp or exp < now:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Der Code ist abgelaufen. Bitte neu anfordern.")
        if (data.code or "").strip() != c.sign_code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code ungültig.")
        verified_email = _client_email(client)
    elif target:
        if entered != target:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Die E-Mail-Adresse stimmt nicht mit der hinterlegten Adresse überein.")
        verified_email = _client_email(client)
    else:
        if not entered:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte deine E-Mail-Adresse eingeben.")
        verified_email = data.email.strip()

    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else ""))
    _finalize_sign(c, data.name, verified_email, data.signature_image, ip, db)
    db.commit()
    return {"ok": True}
