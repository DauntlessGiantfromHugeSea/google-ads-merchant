#!/bin/sh
# Spielt eine Sicherung zurück in die Datenbank.
#
#   restore.sh /backups/daily/northflow-YYYYmmdd-HHMMSS.sql.gz
#
# ACHTUNG: überschreibt die aktuelle Datenbank (der Dump enthält DROP/CREATE).
# Vorher wird sicherheitshalber ein frischer Dump gezogen.
set -eu

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Nutzung: restore.sh <pfad-zur-sicherung.sql.gz>"
  echo "Verfügbare Sicherungen:"
  ls -1t "${BACKUP_DIR:-/backups}/daily"/*.sql.gz 2>/dev/null || echo "  (keine gefunden)"
  exit 1
fi

HOST="${DB_HOST:-db}"
export PGPASSWORD="$POSTGRES_PASSWORD"

echo "[restore] Sicherheits-Dump vor dem Zurückspielen…"
pre="${BACKUP_DIR:-/backups}/daily/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump -h "$HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip > "$pre" \
  && echo "[restore] Sicherheits-Dump: $pre"

echo "[restore] Spiele $FILE zurück…"
gunzip -c "$FILE" | psql -h "$HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q
echo "[restore] Fertig. (Backend/Worker anschließend neu starten.)"
