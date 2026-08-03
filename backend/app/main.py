"""FastAPI-Einstiegspunkt der Reporting-Plattform."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.routes import (
    admin_backup, ads_activity, appointments, auth, branding, briefings, clients, contracts,
    credentials, dashboard, documents, embeds, filerequests, intake, invoices, kpis, launch, mail,
    monitoring, notifications, offers, onboarding, org, packages, participants, projectdoc,
    projects, reports, requests, richdocs, secrets, seo, tasks, team, timetracking,
)
from app.config import get_settings
from app.database import Base, engine

_settings = get_settings()

# Spalten, die bei bestehenden Installationen ggf. fehlen (create_all legt nur
# neue Tabellen an, keine neuen Spalten). Idempotent beim Start nachgezogen.
_CLIENT_COLUMNS = {
    "contact_person": "VARCHAR(255) DEFAULT ''", "phone": "VARCHAR(64) DEFAULT ''",
    "website": "VARCHAR(512) DEFAULT ''", "address": "TEXT DEFAULT ''",
    "contract_package": "VARCHAR(255) DEFAULT ''", "contract_status": "VARCHAR(64) DEFAULT ''",
    "contract_start": "VARCHAR(10) DEFAULT ''", "contract_end": "VARCHAR(10) DEFAULT ''",
    "contract_fee": "VARCHAR(64) DEFAULT ''", "contract_billing": "VARCHAR(64) DEFAULT ''",
    "contract_notes": "TEXT DEFAULT ''",
    "status": "VARCHAR(32) DEFAULT 'aktiv'", "tags": "TEXT DEFAULT ''",
    "archived": "BOOLEAN DEFAULT FALSE",
    "company": "VARCHAR(255) DEFAULT ''", "billing_address": "TEXT DEFAULT ''",
    "vat_id": "VARCHAR(64) DEFAULT ''", "billing_email": "VARCHAR(255) DEFAULT ''",
    "participants_enabled": "BOOLEAN DEFAULT FALSE", "participant_token": "VARCHAR(64) DEFAULT ''",
    "pipeline_stage": "VARCHAR(24) DEFAULT ''", "deal_value": "DOUBLE PRECISION DEFAULT 0",
    "next_followup": "VARCHAR(10) DEFAULT ''",
    "contract_end_notified": "BOOLEAN DEFAULT FALSE",
    "kpi_sheet_url": "TEXT DEFAULT ''", "kpi_synced_at": "TIMESTAMP",
    "hourly_rate": "DOUBLE PRECISION DEFAULT 0",
}
_ORG_COLUMNS = {
    "logo_base64": "TEXT DEFAULT ''", "logo_content_type": "VARCHAR(64) DEFAULT ''",
    "agency_contact_name": "VARCHAR(255) DEFAULT ''", "agency_contact_email": "VARCHAR(255) DEFAULT ''",
    "agency_contact_phone": "VARCHAR(64) DEFAULT ''", "agency_contact_note": "TEXT DEFAULT ''",
    "ms_refresh_token": "TEXT DEFAULT ''", "ms_email": "VARCHAR(255) DEFAULT ''",
    "monitor_token": "VARCHAR(64) DEFAULT ''", "agency_address": "TEXT DEFAULT ''",
    "email_notifications": "BOOLEAN DEFAULT TRUE", "meeting_link": "VARCHAR(512) DEFAULT ''",
    "login_tagline": "VARCHAR(255) DEFAULT 'Reporting-Plattform für deine Kunden.'",
    "timezone": "VARCHAR(64) DEFAULT 'Europe/Berlin'",
}
_CONTRACT_COLUMNS = {
    "provider_block": "TEXT DEFAULT ''", "client_block": "TEXT DEFAULT ''",
    "agency_signer_name": "VARCHAR(255) DEFAULT ''", "agency_signature_image": "TEXT DEFAULT ''",
    "agency_signed_at": "TIMESTAMP", "services": "JSON DEFAULT '[]'",
    "signed_place": "VARCHAR(255) DEFAULT ''", "agency_signed_place": "VARCHAR(255) DEFAULT ''",
}
_TODO_COLUMNS = {
    "priority": "VARCHAR(16) DEFAULT 'normal'", "assignee": "VARCHAR(255) DEFAULT ''",
    "project_id": "VARCHAR(36)", "assignee_id": "VARCHAR(36)",
    "overdue_notified": "BOOLEAN DEFAULT FALSE", "recurrence": "VARCHAR(16) DEFAULT ''",
}
_PROJECT_COLUMNS = {
    "brief": "TEXT DEFAULT ''", "budget": "DOUBLE PRECISION DEFAULT 0",
    "hours_quota": "DOUBLE PRECISION DEFAULT 0", "hourly_rate": "DOUBLE PRECISION DEFAULT 0",
}
_USER_COLUMNS = {
    "invite_token": "VARCHAR(64) DEFAULT ''", "invite_expires": "TIMESTAMP",
    "totp_secret": "TEXT DEFAULT ''", "totp_enabled": "BOOLEAN DEFAULT FALSE",
}
_PACKAGE_COLUMNS = {
    "unit": "VARCHAR(32) DEFAULT 'Stunden'", "unit_price": "DOUBLE PRECISION DEFAULT 0",
    "category": "VARCHAR(80) DEFAULT ''",
}
_OFFER_COLUMNS = {
    "accepted_email": "VARCHAR(255) DEFAULT ''", "accept_code": "VARCHAR(16) DEFAULT ''",
    "accept_code_expires": "TIMESTAMP",
}


def _ensure_columns(insp, table: str, columns: dict) -> None:
    if table not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns(table)}
    with engine.begin() as conn:
        for name, sqltype in columns.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sqltype}"))


_ONBOARDING_COLUMNS = {
    "checklist": "JSON DEFAULT '[]'",
}
_TIME_COLUMNS = {
    "project_id": "VARCHAR(36)",
}
_INVOICE_COLUMNS = {
    "service_period": "VARCHAR(7) DEFAULT ''",
    "receipt_filename": "VARCHAR(512) DEFAULT ''", "receipt_content_type": "VARCHAR(128) DEFAULT ''",
    "receipt_base64": "TEXT DEFAULT ''",
}


def _ensure_schema() -> None:
    insp = inspect(engine)
    _ensure_columns(insp, "clients", _CLIENT_COLUMNS)
    _ensure_columns(insp, "onboardings", _ONBOARDING_COLUMNS)
    _ensure_columns(insp, "time_entries", _TIME_COLUMNS)
    _ensure_columns(insp, "invoices", _INVOICE_COLUMNS)
    _ensure_columns(insp, "offers", _OFFER_COLUMNS)
    _ensure_columns(insp, "contracts", _CONTRACT_COLUMNS)
    _ensure_columns(insp, "organizations", _ORG_COLUMNS)
    _ensure_columns(insp, "todos", _TODO_COLUMNS)
    _ensure_columns(insp, "projects", _PROJECT_COLUMNS)
    _ensure_columns(insp, "users", _USER_COLUMNS)
    _ensure_columns(insp, "service_packages", _PACKAGE_COLUMNS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_schema()
    yield


# Docs/OpenAPI in Produktion abschalten (keine Schema-Preisgabe).
_is_prod = _settings.app_env == "production"
app = FastAPI(
    title="Agentur-Reporting-Plattform", version="0.1.0", lifespan=lifespan,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,  # nur eigene Domain + lokale Dev-Ports
    allow_credentials=False,  # Auth per Bearer-Header, keine Cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _security_headers(request, call_next):
    """Server-Banner entfernen + defensive Header (greift auch beim direkten
    Tailscale-Zugriff, der nicht über Caddy läuft)."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if "server" in response.headers:
        del response.headers["server"]
    return response

app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(reports.router)
app.include_router(branding.router)
app.include_router(dashboard.router)
app.include_router(documents.router)
app.include_router(team.router)
app.include_router(org.router)
app.include_router(secrets.router)
app.include_router(requests.router)
app.include_router(projects.client_router)
app.include_router(projects.global_router)
app.include_router(packages.router)
app.include_router(tasks.router)
app.include_router(intake.router)
app.include_router(ads_activity.router)
app.include_router(mail.router)
app.include_router(launch.router)
app.include_router(monitoring.router)
app.include_router(offers.client_router)
app.include_router(offers.public_router)
app.include_router(notifications.router)
app.include_router(briefings.router)
app.include_router(participants.router)
app.include_router(participants.public_router)
app.include_router(contracts.client_router)
app.include_router(contracts.public_router)
app.include_router(seo.router)
app.include_router(appointments.client_router)
app.include_router(appointments.global_router)
app.include_router(invoices.router)
app.include_router(embeds.router)
app.include_router(kpis.router)
app.include_router(admin_backup.router)
app.include_router(onboarding.router)
app.include_router(credentials.router)
app.include_router(projectdoc.router)
app.include_router(timetracking.router)
app.include_router(timetracking.client_router)
app.include_router(filerequests.router)
app.include_router(filerequests.public_router)
app.include_router(richdocs.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
