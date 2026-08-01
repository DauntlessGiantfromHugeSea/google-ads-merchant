"""SEO-Audit-Oberfläche: Analyse starten, Verlauf/Drift, PDF-Report.

Deterministisch (ohne KI), Ergebnis im Claude-SEO-Format (Kategorien, Findings,
Action-Plan, Health-Score). Ersetzt die frühere SEO-Analyse.
"""
import io

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Account, AccountType, Client, Organization, SeoAudit, User, UserRole
from app.services import pdf, seo_audit, timeutil
from app.services.notify import _agency_user_ids, notify_users

router = APIRouter(prefix="/api/seo", tags=["seo"])


class AuditRun(BaseModel):
    url: str
    client_id: str | None = None


class ClientAuditRun(BaseModel):
    url: str | None = None


def _norm_url(u: str) -> str:
    """Für den Vergleich: Schema/Slash/Case vereinheitlichen."""
    u = (u or "").strip().lower().rstrip("/")
    for pfx in ("https://", "http://"):
        if u.startswith(pfx):
            u = u[len(pfx):]
            break
    return u.removeprefix("www.")


def _client_sites(client: Client, db: Session) -> list[str]:
    """Alle Websites eines Kunden: Website-Feld + verknüpfte Website-Konten,
    dedupliziert (Reihenfolge: Kundenfeld zuerst, dann Konten nach Anlage)."""
    sites: list[str] = []
    seen: set[str] = set()
    for raw in [client.website or ""] + [
        a.external_id for a in (db.query(Account)
                                .filter(Account.client_id == client.id,
                                        Account.type == AccountType.website)
                                .order_by(Account.created_at.asc()).all())
    ]:
        raw = (raw or "").strip()
        key = _norm_url(raw)
        if raw and key and key not in seen:
            seen.add(key)
            sites.append(raw)
    return sites


def _scoped_audit(audit_id: str, user: User, db: Session) -> SeoAudit:
    """Audit laden und Mandanten-/Kundentrennung erzwingen."""
    a = db.get(SeoAudit, audit_id)
    if not a or a.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audit nicht gefunden")
    # Kunden-Nutzer dürfen nur Audits des eigenen Kunden sehen.
    if user.role == UserRole.client_user and a.client_id != user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Kein Zugriff auf dieses Audit")
    return a


def _run_and_store(url: str, client_id: str | None, user: User, db: Session) -> dict:
    env = seo_audit.run_audit(url)
    audit = SeoAudit(organization_id=user.organization_id, client_id=client_id,
                     url=env.get("url") or url, score=env.get("health_score", 0),
                     grade=env.get("grade", ""), data=env, created_by=user.full_name or user.email)
    db.add(audit)
    db.commit()
    db.refresh(audit)
    prev = (db.query(SeoAudit)
            .filter(SeoAudit.organization_id == user.organization_id, SeoAudit.url == audit.url,
                    SeoAudit.id != audit.id)
            .order_by(SeoAudit.created_at.desc()).first())
    result = _out(audit)
    result["drift"] = {"previous_score": prev.score, "delta": audit.score - prev.score,
                       "previous_at": prev.created_at.isoformat()} if prev else None
    return result


def _out(a: SeoAudit) -> dict:
    return {"id": a.id, "url": a.url, "score": a.score, "grade": a.grade,
            "client_id": a.client_id, "created_by": a.created_by,
            "created_at": a.created_at.isoformat(), "data": a.data}


def _brief(a: SeoAudit) -> dict:
    return {"id": a.id, "url": a.url, "score": a.score, "grade": a.grade,
            "client_id": a.client_id, "created_at": a.created_at.isoformat()}


@router.post("/audit")
def run_audit(data: AuditRun, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> dict:
    if not data.url.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte eine URL angeben.")
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
    return _run_and_store(data.url.strip(), data.client_id, user, db)


@router.get("/for/{client_id}")
def list_client_audits(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Audits eines Kunden – auch für den Kunden selbst sichtbar."""
    get_scoped_client(client_id, user, db)
    audits = (db.query(SeoAudit)
              .filter(SeoAudit.organization_id == user.organization_id, SeoAudit.client_id == client_id)
              .order_by(SeoAudit.created_at.desc()).limit(50).all())
    return [_out(a) for a in audits]


@router.get("/for/{client_id}/sites")
def client_sites(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[str]:
    """Websites eines Kunden – für die Auswahl beim Messen (Mehrfach-Websites)."""
    client = get_scoped_client(client_id, user, db)
    return _client_sites(client, db)


@router.post("/for/{client_id}/run")
def run_client_audit(client_id: str, data: ClientAuditRun = Body(default=None),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Neu messen für einen Kunden. Die messbaren URLs stammen ausschließlich aus
    den hinterlegten Websites des Kunden – Kunden können also nur eigene Seiten
    messen. Bei mehreren Websites bestimmt `url`, welche gemessen wird."""
    client = get_scoped_client(client_id, user, db)
    sites = _client_sites(client, db)
    if not sites:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Für diesen Kunden ist keine Website hinterlegt.")
    wanted = (data.url if data else None) or ""
    if wanted.strip():
        # Nur eine der hinterlegten Websites zulassen (kein freies Crawlen).
        match = next((s for s in sites if _norm_url(s) == _norm_url(wanted)), None)
        if not match:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Diese Website ist für den Kunden nicht hinterlegt.")
        target = match
    else:
        target = sites[0]
    result = _run_and_store(target, client_id, user, db)
    # Wenn ein Kunde selbst misst, die Agentur in-app informieren.
    if user.role == UserRole.client_user:
        notify_users(db, _agency_user_ids(db, user.organization_id),
                     org_id=user.organization_id, client_id=client_id,
                     type_="seo_rerun", title="SEO neu gemessen",
                     body=f"{client.name} · {result.get('url', '')}: Score {result.get('score', '')}".strip(),
                     link=f"/clients/{client_id}")
    return result


@router.get("")
def list_audits(client_id: str | None = None, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    q = db.query(SeoAudit).filter(SeoAudit.organization_id == user.organization_id)
    if client_id:
        q = q.filter(SeoAudit.client_id == client_id)
    return [_brief(a) for a in q.order_by(SeoAudit.created_at.desc()).limit(100).all()]


@router.get("/{audit_id}")
def get_audit(audit_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return _out(_scoped_audit(audit_id, user, db))


@router.delete("/{audit_id}", status_code=204)
def delete_audit(audit_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    a = db.get(SeoAudit, audit_id)
    if a and a.organization_id == user.organization_id:
        db.delete(a)
        db.commit()


@router.get("/{audit_id}/pdf")
def audit_pdf(audit_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _scoped_audit(audit_id, user, db)
    client = db.get(Client, a.client_id) if a.client_id else None
    org = db.get(Organization, user.organization_id)
    tz = (org.timezone if org else None) or "Europe/Berlin"
    payload = {**a.data, "client_name": client.name if client else "",
               "created_at": timeutil.fmt_local(a.created_at, "%d.%m.%Y %H:%M", tz, with_tz=True)}
    data = pdf.render_seo_pdf(payload)
    fn = f"SEO-{payload.get('domain') or 'Audit'}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})
