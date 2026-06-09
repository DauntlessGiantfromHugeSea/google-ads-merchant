"""FastAPI-Einstiegspunkt der Reporting-Plattform."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.routes import (
    auth, branding, clients, dashboard, documents, org, reports, secrets, team,
)
from app.database import Base, engine

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
}
_ORG_COLUMNS = {
    "logo_base64": "TEXT DEFAULT ''", "logo_content_type": "VARCHAR(64) DEFAULT ''",
    "agency_contact_name": "VARCHAR(255) DEFAULT ''", "agency_contact_email": "VARCHAR(255) DEFAULT ''",
    "agency_contact_phone": "VARCHAR(64) DEFAULT ''", "agency_contact_note": "TEXT DEFAULT ''",
}
_TODO_COLUMNS = {"priority": "VARCHAR(16) DEFAULT 'normal'"}


def _ensure_columns(insp, table: str, columns: dict) -> None:
    if table not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns(table)}
    with engine.begin() as conn:
        for name, sqltype in columns.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sqltype}"))


def _ensure_schema() -> None:
    insp = inspect(engine)
    _ensure_columns(insp, "clients", _CLIENT_COLUMNS)
    _ensure_columns(insp, "organizations", _ORG_COLUMNS)
    _ensure_columns(insp, "todos", _TODO_COLUMNS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_schema()
    yield


app = FastAPI(title="Agentur-Reporting-Plattform", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Dev. Produktion: konkrete Frontend-Domain eintragen.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(reports.router)
app.include_router(branding.router)
app.include_router(dashboard.router)
app.include_router(documents.router)
app.include_router(team.router)
app.include_router(org.router)
app.include_router(secrets.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
