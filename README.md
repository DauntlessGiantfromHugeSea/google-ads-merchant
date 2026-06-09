# North-Lab Reporting-Plattform

Multi-Tenant-Webanwendung für eine Agentur: mehrere Kunden verwalten, deren
**Google Ads**- und **Merchant-Center**-Konten auswerten, **SEO** bewerten und
**PDF-Reports** auf dem eigenen Briefpapier erzeugen. Kunden bekommen eigene
Logins und sehen nur ihre Daten.

Details zur Architektur: siehe [PLAN.md](PLAN.md).

## Schnellstart (Docker)

```bash
cp .env.example .env
# In .env mindestens SECRET_KEY und CREDENTIAL_ENCRYPTION_KEY setzen
docker compose up --build
```

- Frontend:  http://localhost:5173
- Backend-API + Docs: http://localhost:8000/api/docs

## Entwicklung ohne Docker

Backend (SQLite-Fallback):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=sqlite:///./dev.db DATA_SOURCE_MODE=demo uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev      # Proxy /api -> http://localhost:8000
```

## Briefpapier

Eigenes Briefpapier als `backend/app/templates/letterhead.pdf` ablegen (oder
`LETTERHEAD_PATH` setzen). Der Report-Inhalt wird per Overlay passgenau auf
jede Seite gelegt. PNG/JPG/SVG werden ebenfalls unterstützt.

Seitenränder des Inhalts: oben 4 cm, rechts 5 cm, unten 3,2 cm, links 2,8 cm
(in `backend/app/templates/report.html`).

## Daten: Demo vs. Live

Ohne hinterlegte Zugangsdaten laufen Reports mit realistischen **Demo-Daten**.
Die echten Google-Zugangsdaten werden **pro Kunde im Tool** hinterlegt
(verschlüsselt) – Schritt-für-Schritt in [ANLEITUNG-GOOGLE.md](ANLEITUNG-GOOGLE.md).
Schlägt ein Live-Abruf fehl, fällt das System automatisch auf Demo zurück.

## Online stellen (north-flow.de)

Schlüsselfertiges Deployment mit automatischem HTTPS (Caddy):
siehe [DEPLOY.md](DEPLOY.md).
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Status

| Bereich | Stand |
|---|---|
| Backend, Auth, Mandantentrennung | ✅ |
| Ads / Merchant / SEO (Demo + Live-Adapter) | ✅ |
| Google-API pro Kunde verbinden (verschlüsselt) + Anleitung | ✅ |
| PDF-Reports auf Briefpapier (flüchtig) | ✅ |
| Frontend (Login, Kunden, Onboarding, Reports) | ✅ |
| Produktions-Deployment (Docker + Caddy/HTTPS) | ✅ |
| Celery-Scheduling (automatische Reports) | ⬜ Grundgerüst vorhanden |
