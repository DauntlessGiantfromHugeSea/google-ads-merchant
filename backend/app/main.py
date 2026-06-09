"""FastAPI-Einstiegspunkt der Reporting-Plattform."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.routes import auth, clients, reports
from app.database import Base, engine

# Spalten, die bei bestehenden Installationen ggf. fehlen (create_all legt nur
# neue Tabellen an, keine neuen Spalten). Idempotent beim Start nachgezogen.
_CLIENT_COLUMNS = {
    "contact_person": "VARCHAR(255)", "phone": "VARCHAR(64)",
    "website": "VARCHAR(512)", "address": "TEXT",
    "contract_package": "VARCHAR(255)", "contract_status": "VARCHAR(64)",
    "contract_start": "VARCHAR(10)", "contract_end": "VARCHAR(10)",
    "contract_fee": "VARCHAR(64)", "contract_billing": "VARCHAR(64)",
    "contract_notes": "TEXT",
}


def _ensure_schema() -> None:
    insp = inspect(engine)
    if "clients" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("clients")}
    with engine.begin() as conn:
        for name, sqltype in _CLIENT_COLUMNS.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE clients ADD COLUMN {name} {sqltype} DEFAULT ''"))


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


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
