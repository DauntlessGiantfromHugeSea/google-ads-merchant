# Deployment: North Flow online stellen (north-flow.de)

Damit geht das Tool mit HTTPS unter **north-flow.de** live. Du brauchst einen
kleinen Linux-Server (z.B. Hetzner/IONOS/DigitalOcean, 2 GB RAM reichen) mit
Docker.

## 1. DNS einrichten
Beim Domain-Anbieter von **north-flow.de** zwei A-Records auf die
IP-Adresse deines Servers setzen:

| Typ | Name | Wert |
|-----|------|------|
| A   | @    | <Server-IP> |
| A   | www  | <Server-IP> |

> Caddy holt sich das TLS-Zertifikat automatisch, sobald die Domain auf den
> Server zeigt. (Ports 80 und 443 müssen offen sein.)

## 2. Server vorbereiten
```bash
# Docker installieren (falls noch nicht vorhanden)
curl -fsSL https://get.docker.com | sh

# Repository holen
git clone <REPO-URL> north-flow && cd north-flow
```

## 3. Konfiguration anlegen
```bash
cp .env.prod.example .env.prod

# Keys erzeugen und in .env.prod eintragen:
python3 -c "import secrets; print(secrets.token_urlsafe(48))"            # -> SECRET_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # -> CREDENTIAL_ENCRYPTION_KEY
```
In `.env.prod` setzen: `DOMAIN=north-flow.de`, `SECRET_KEY`,
`CREDENTIAL_ENCRYPTION_KEY`, ein starkes `POSTGRES_PASSWORD`.

> **Wichtig:** `CREDENTIAL_ENCRYPTION_KEY` danach nicht mehr ändern – sonst
> sind hinterlegte Google-Zugangsdaten nicht mehr entschlüsselbar.

## 4. Starten
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Nach ~1 Minute (TLS-Zertifikat) erreichbar unter **https://north-flow.de**.

## 5. Erstes Login
- Auf der Startseite **„Jetzt einrichten"** → Agentur + Admin-Zugang anlegen.
- Danach Kunden anlegen, Konten verknüpfen, Google-APIs verbinden
  (siehe [ANLEITUNG-GOOGLE.md](ANLEITUNG-GOOGLE.md)) und Reports erzeugen.

## Betrieb
```bash
docker compose -f docker-compose.prod.yml logs -f          # Logs
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build   # Update
docker compose -f docker-compose.prod.yml down             # stoppen
```

### Backups (empfohlen)
```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U reporting reporting > backup_$(date +%F).sql
```

## www → ohne www (optional)
Soll `www.north-flow.de` auf `north-flow.de` weiterleiten, in
`deploy/Caddyfile` ergänzen:
```
www.north-flow.de { redir https://north-flow.de{uri} }
```
