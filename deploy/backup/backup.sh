#!/bin/sh
# Nächtliche PostgreSQL-Sicherung mit Rotation und optionalem Push zur Synology.
# Läuft als eigener Container im Stack. Schreibt nach /backups (Host: ./backups).
#
#   backup.sh once   -> genau eine Sicherung, dann beenden (manuell/vor Updates)
#   backup.sh        -> Dauerbetrieb: alle 24 h eine Sicherung
set -eu

DIR="${BACKUP_DIR:-/backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"     # so viele Tages-Sicherungen behalten
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"    # so viele Wochen-Sicherungen (sonntags)
INTERVAL="${BACKUP_INTERVAL:-86400}"

mkdir -p "$DIR/daily" "$DIR/weekly"

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

run_backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  dow=$(date +%u)                  # 1..7 (7 = Sonntag)
  out="$DIR/daily/northflow-$ts.sql.gz"
  log "Dump -> $out"
  # --clean --if-exists: der Dump kann sauber in eine bestehende DB zurückgespielt werden.
  if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "${DB_HOST:-db}" -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" --clean --if-exists 2>/tmp/pgdump.err | gzip > "$out.tmp"; then
    mv "$out.tmp" "$out"
    log "OK ($(du -h "$out" | cut -f1))"
  else
    rm -f "$out.tmp"
    log "FEHLER beim Dump: $(cat /tmp/pgdump.err)"
    return 1
  fi

  # Wochen-Kopie sonntags
  [ "$dow" = "7" ] && cp "$out" "$DIR/weekly/"

  # Rotation (neueste behalten, Rest löschen)
  ls -1t "$DIR/daily"/*.sql.gz 2>/dev/null  | tail -n +"$((KEEP_DAILY + 1))"  | while read -r f; do rm -f "$f"; done
  ls -1t "$DIR/weekly"/*.sql.gz 2>/dev/null | tail -n +"$((KEEP_WEEKLY + 1))" | while read -r f; do rm -f "$f"; done

  maybe_push "$out"
}

# Optionaler Push zur Synology (rsync über SSH, z. B. via Tailscale).
# Aktiv, sobald SYNOLOGY_RSYNC_TARGET gesetzt ist, z. B.:
#   SYNOLOGY_RSYNC_TARGET=backup@synology:/volume1/northflow-backups/
# SSH-Key als ./deploy/backup/keys/id_backup einhängen (-> /keys/id_backup).
maybe_push() {
  [ -n "${SYNOLOGY_RSYNC_TARGET:-}" ] || return 0
  key="${SYNOLOGY_SSH_KEY:-/keys/id_backup}"
  port="${SYNOLOGY_SSH_PORT:-22}"
  log "rsync -> $SYNOLOGY_RSYNC_TARGET"
  if rsync -az --delete -e "ssh -i $key -p $port -o StrictHostKeyChecking=accept-new" \
        "$DIR/daily/" "$SYNOLOGY_RSYNC_TARGET" 2>/tmp/rsync.err; then
    log "Push OK"
  else
    log "Push FEHLER: $(cat /tmp/rsync.err)"
  fi
}

if [ "${1:-}" = "once" ]; then
  run_backup
  exit $?
fi

log "Backup-Dienst gestartet (Intervall ${INTERVAL}s, behalte ${KEEP_DAILY} täglich / ${KEEP_WEEKLY} wöchentlich)"
while true; do
  run_backup || log "Sicherung fehlgeschlagen – nächster Versuch in ${INTERVAL}s"
  sleep "$INTERVAL"
done
