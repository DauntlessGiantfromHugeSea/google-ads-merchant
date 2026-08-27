#!/usr/bin/env bash
# North Flow – Produktions-Deploy. Immer dieses Skript nutzen, NICHT "docker compose up".
# Nimmt automatisch die prod-Compose-Datei + .env.prod (verhindert die 8000-Port-Kollision).
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

echo "→ Neuesten Stand holen"
git pull --ff-only

echo "→ Bauen & starten (Produktion)"
"${COMPOSE[@]}" up -d --build

echo "→ Status"
"${COMPOSE[@]}" ps
echo "✓ Fertig."
