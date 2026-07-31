"""SEO-Audit-Oberfläche: Analyse starten, Verlauf/Drift, PDF-Report.

Deterministisch (ohne KI), Ergebnis im Claude-SEO-Format (Kategorien, Findings,
Action-Plan, Health-Score). Ersetzt die frühere SEO-Analyse.
"""
import io

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Client, SeoAudit, User
from app.services import pdf, seo_audit

router = APIRouter(prefix="/api/seo", tags=["seo"])


class AuditRun(BaseModel):
    url: str
    client_id: str | None = None


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
    env = seo_audit.run_audit(data.url.strip())
    audit = SeoAudit(organization_id=user.organization_id, client_id=data.client_id,
                     url=env.get("url") or data.url.strip(), score=env.get("health_score", 0),
                     grade=env.get("grade", ""), data=env, created_by=user.full_name or user.email)
    db.add(audit)
    db.commit()
    db.refresh(audit)
    # Drift: Vergleich zum vorherigen Audit derselben URL
    prev = (db.query(SeoAudit)
            .filter(SeoAudit.organization_id == user.organization_id, SeoAudit.url == audit.url,
                    SeoAudit.id != audit.id)
            .order_by(SeoAudit.created_at.desc()).first())
    result = _out(audit)
    result["drift"] = {"previous_score": prev.score, "delta": audit.score - prev.score,
                       "previous_at": prev.created_at.isoformat()} if prev else None
    return result


@router.get("")
def list_audits(client_id: str | None = None, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    q = db.query(SeoAudit).filter(SeoAudit.organization_id == user.organization_id)
    if client_id:
        q = q.filter(SeoAudit.client_id == client_id)
    return [_brief(a) for a in q.order_by(SeoAudit.created_at.desc()).limit(100).all()]


@router.get("/{audit_id}")
def get_audit(audit_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    a = db.get(SeoAudit, audit_id)
    if not a or a.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audit nicht gefunden")
    return _out(a)


@router.delete("/{audit_id}", status_code=204)
def delete_audit(audit_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    a = db.get(SeoAudit, audit_id)
    if a and a.organization_id == user.organization_id:
        db.delete(a)
        db.commit()


@router.get("/{audit_id}/pdf")
def audit_pdf(audit_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(SeoAudit, audit_id)
    if not a or a.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audit nicht gefunden")
    client = db.get(Client, a.client_id) if a.client_id else None
    payload = {**a.data, "client_name": client.name if client else "",
               "created_at": a.created_at.strftime("%d.%m.%Y %H:%M")}
    data = pdf.render_seo_pdf(payload)
    fn = f"SEO-{payload.get('domain') or 'Audit'}.pdf".replace(" ", "_")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fn}"'})
