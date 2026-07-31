"""Reports erzeugen, auflisten, Daten abrufen und PDF flüchtig herunterladen."""
import io

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import ReportRun, User
from app.schemas import ReportCreate, ReportDetailOut, ReportOut
from app.services import pdf
from app.services.reports import build_pdf_payload, run_report

router = APIRouter(prefix="/api/clients/{client_id}/reports", tags=["reports"])


@router.get("", response_model=list[ReportOut])
def list_reports(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (
        db.query(ReportRun)
        .filter(ReportRun.client_id == client_id)
        .order_by(ReportRun.created_at.desc())
        .all()
    )


@router.post("", response_model=ReportDetailOut, status_code=201)
def create_report(
    client_id: str,
    data: ReportCreate,
    user: User = Depends(require_agency),
    db: Session = Depends(get_db),
):
    """Erzeugt einen Report-Lauf. Wertet synchron aus und speichert die Daten
    (der Snapshot bleibt; das PDF entsteht erst beim Download)."""
    get_scoped_client(client_id, user, db)
    report = ReportRun(
        client_id=client_id,
        type=data.type,
        period_start=data.period_start,
        period_end=data.period_end,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return run_report(db, report)


def _load_report(client_id: str, report_id: str, user: User, db: Session) -> ReportRun:
    get_scoped_client(client_id, user, db)
    report = db.get(ReportRun, report_id)
    if not report or report.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report nicht gefunden")
    return report


@router.get("/{report_id}", response_model=ReportDetailOut)
def get_report(
    client_id: str, report_id: str,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    return _load_report(client_id, report_id, user, db)


@router.delete("/{report_id}", status_code=204)
def delete_report(
    client_id: str, report_id: str,
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    report = _load_report(client_id, report_id, user, db)
    db.delete(report)
    db.commit()


@router.get("/{report_id}/pdf")
def download_pdf(
    client_id: str, report_id: str,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Erzeugt das PDF flüchtig im Speicher und streamt es. Nichts wird auf
    der Platte gespeichert – nach dem Download ist das PDF weg."""
    report = _load_report(client_id, report_id, user, db)
    payload = build_pdf_payload(db, report)
    pdf_bytes = pdf.render_report_pdf(payload)
    filename = f"report-{payload['client_name']}-{report.period_end}.pdf".replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
