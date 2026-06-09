"""Orchestriert einen Report-Lauf: holt Daten je Konto-Typ, wertet aus und
speichert die Snapshots am ReportRun. Das PDF entsteht erst beim Download."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Account, AccountType, Client, ReportRun, ReportStatus
from app.services import ads, merchant, seo

settings = get_settings()


def run_report(db: Session, report: ReportRun) -> ReportRun:
    report.status = ReportStatus.running
    report.data_source = "live" if settings.use_live_data else "demo"
    db.commit()

    try:
        client = db.get(Client, report.client_id)
        accounts = client.accounts if client else []

        ads_accs = [a for a in accounts if a.type == AccountType.google_ads]
        merch_accs = [a for a in accounts if a.type == AccountType.merchant_center]
        sites = [a for a in accounts if a.type == AccountType.website]

        if report.type.value in ("ads", "combined") and ads_accs:
            report.ads_data = ads.collect_ads_data(
                ads_accs[0].external_id, report.period_start, report.period_end
            )
        if report.type.value in ("merchant", "combined") and merch_accs:
            report.merchant_data = merchant.collect_merchant_data(merch_accs[0].external_id)
        if report.type.value in ("seo", "combined") and sites:
            report.seo_data = seo.analyze_url(sites[0].external_id)

        report.status = ReportStatus.completed
        report.completed_at = datetime.now(timezone.utc)
    except Exception as exc:  # pragma: no cover
        report.status = ReportStatus.failed
        report.error = str(exc)
    db.commit()
    db.refresh(report)
    return report


def build_pdf_payload(db: Session, report: ReportRun) -> dict:
    client = db.get(Client, report.client_id)
    return {
        "client_name": client.name if client else "",
        "period_start": report.period_start,
        "period_end": report.period_end,
        "data_source": report.data_source,
        "ads_data": report.ads_data,
        "merchant_data": report.merchant_data,
        "seo_data": report.seo_data,
    }
