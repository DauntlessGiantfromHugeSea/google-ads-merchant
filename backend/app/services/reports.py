"""Orchestriert einen Report-Lauf: holt Daten je Konto-Typ, wertet aus und
speichert die Snapshots am ReportRun. Das PDF entsteht erst beim Download."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.crypto import decrypt_json
from app.models import Account, AccountType, AdsActivity, Client, ReportRun, ReportStatus
from app.services import ads, merchant, seo_audit


def _creds(account: Account) -> dict | None:
    if account.credential and account.credential.encrypted_payload:
        return decrypt_json(account.credential.encrypted_payload)
    return None


def run_report(db: Session, report: ReportRun) -> ReportRun:
    report.status = ReportStatus.running
    db.commit()

    try:
        client = db.get(Client, report.client_id)
        accounts = client.accounts if client else []

        ads_accs = [a for a in accounts if a.type == AccountType.google_ads]
        merch_accs = [a for a in accounts if a.type == AccountType.merchant_center]
        sites = [a for a in accounts if a.type == AccountType.website]

        used_live = False
        if report.type.value in ("ads", "combined") and ads_accs:
            creds = _creds(ads_accs[0])
            used_live = used_live or bool(creds)
            report.ads_data = ads.collect_ads_data(
                ads_accs[0].external_id, report.period_start, report.period_end, creds
            )
            # Durchgeführte Maßnahmen im Zeitraum (Ads-Aktivitätsprotokoll)
            acts = (db.query(AdsActivity)
                    .filter(AdsActivity.client_id == report.client_id)
                    .order_by(AdsActivity.date.desc()).all())
            ps, pe = report.period_start, report.period_end
            report.ads_data["activities"] = [
                {"date": a.date, "category": a.category, "title": a.title, "body": a.body}
                for a in acts if (not a.date) or (ps <= a.date <= pe) or (not ps and not pe)
            ]
        if report.type.value in ("merchant", "combined") and merch_accs:
            creds = _creds(merch_accs[0])
            used_live = used_live or bool(creds)
            report.merchant_data = merchant.collect_merchant_data(merch_accs[0].external_id, creds)
        if report.type.value in ("seo", "combined") and sites:
            # Alle Websites des Kunden auditieren (neue Engine, mehrere möglich).
            site_results = [seo_audit.run_audit(s.external_id) for s in sites]
            report.seo_data = {"sites": site_results}
            # Echter SEO-Crawl zählt als Live-Daten (nicht Demo).
            if any(sr.get("fetched_live") for sr in site_results):
                used_live = True

        report.data_source = "live" if used_live else "demo"
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
