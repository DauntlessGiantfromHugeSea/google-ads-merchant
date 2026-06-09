"""FastAPI-Einstiegspunkt der Reporting-Plattform."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, clients, reports
from app.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # MVP: Tabellen automatisch anlegen. Produktion: Alembic-Migrationen.
    Base.metadata.create_all(bind=engine)
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
