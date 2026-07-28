"""Celery-App für geplante/asynchrone Report-Läufe (Schritt 6)."""
from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "reporting",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(task_track_started=True, timezone="Europe/Berlin")


@celery_app.task(name="run_report_task")
def run_report_task(report_id: str) -> str:
    """Asynchroner Report-Lauf (für geplante Aktualisierung). Nutzt eine
    eigene DB-Session, da außerhalb des Request-Kontexts."""
    from app.database import SessionLocal
    from app.models import ReportRun
    from app.services.reports import run_report

    db = SessionLocal()
    try:
        report = db.get(ReportRun, report_id)
        if report:
            run_report(db, report)
        return report_id
    finally:
        db.close()
