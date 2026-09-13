#!/bin/sh
# PostgreSQL-Sicherung mit Rotation, optionalem Synology-Push (rsync) und
# optionalem verschlüsseltem Upload zur Hetzner Storage Box (rclone crypt via SFTP).
# Läuft als eigener Container im Stack. Schreibt nach /backups (Host: ./backups).
#
#   backup.sh once   -> genau eine Sicherung, dann beenden (manuell/vor Updates)
#   backup.sh        -> Dauerbetrieb: alle BACKUP_INTERVAL Sekunden (Standard: 1 h),
#                       reagiert zusätzlich auf den Trigger /backups/.run_now (live)
set -eu

DIR="${BACKUP_DIR:-/backups}"
KEEP_DAILY="${KEEP_DAILY:-72}"     # so viele Sicherungen lokal behalten (stündlich = 3 Tage)
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"    # so viele Wochen-Sicherungen (sonntags)
INTERVAL="${BACKUP_INTERVAL:-3600}"
STATUS="$DIR/status.json"
TRIGGER="$DIR/.run_now"

mkdir -p "$DIR/daily" "$DIR/weekly"

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }
now_iso() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

HETZNER_RESULT="off"
SYNOLOGY_RESULT="off"
DUMP_SIZE=""

write_status() {
  # Kompakte Status-Datei, die das Backend in den Einstellungen anzeigt.
  printf '{"dumped_at":"%s","size":"%s","hetzner":"%s","synology":"%s","interval":%s,"ok":%s}\n' \
    "$1" "${DUMP_SIZE}" "$HETZNER_RESULT" "$SYNOLOGY_RESULT" "$INTERVAL" "$2" > "$STATUS.tmp" \
    && mv "$STATUS.tmp" "$STATUS"
}

run_backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  dow=$(date +%u)                  # 1..7 (7 = Sonntag)
  out="$DIR/daily/northflow-$ts.sql.gz"
  log "Dump -> $out"
  if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "${DB_HOST:-db}" -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" --clean --if-exists 2>/tmp/pgdump.err | gzip > "$out.tmp"; then
    mv "$out.tmp" "$out"
    DUMP_SIZE=$(du -h "$out" | cut -f1)
    log "OK ($DUMP_SIZE)"
  else
    rm -f "$out.tmp"
    log "FEHLER beim Dump: $(cat /tmp/pgdump.err)"
    write_status "$(now_iso)" false
    return 1
  fi

  # Wochen-Kopie sonntags – höchstens einmal pro Tag (bei stündlichem Lauf).
  wf="$DIR/weekly/northflow-$(date +%Y%m%d).sql.gz"
  [ "$dow" = "7" ] && [ ! -f "$wf" ] && cp "$out" "$wf"

  # Rotation (neueste behalten, Rest löschen)
  ls -1t "$DIR/daily"/*.sql.gz 2>/dev/null  | tail -n +"$((KEEP_DAILY + 1))"  | while read -r f; do rm -f "$f"; done
  ls -1t "$DIR/weekly"/*.sql.gz 2>/dev/null | tail -n +"$((KEEP_WEEKLY + 1))" | while read -r f; do rm -f "$f"; done

  maybe_push "$out"
  maybe_push_hetzner "$out"
  write_status "$(now_iso)" true
}

# Optionaler Push zur Synology (rsync über SSH, z. B. via Tailscale).
maybe_push() {
  [ -n "${SYNOLOGY_RSYNC_TARGET:-}" ] || { SYNOLOGY_RESULT="off"; return 0; }
  key="${SYNOLOGY_SSH_KEY:-/keys/id_backup}"
  port="${SYNOLOGY_SSH_PORT:-22}"
  log "rsync -> $SYNOLOGY_RSYNC_TARGET"
  if rsync -az --delete -e "ssh -i $key -p $port -o StrictHostKeyChecking=accept-new" \
        "$DIR/daily/" "$SYNOLOGY_RSYNC_TARGET" 2>/tmp/rsync.err; then
    SYNOLOGY_RESULT="ok"; log "Push OK"
  else
    SYNOLOGY_RESULT="error"; log "Push FEHLER: $(cat /tmp/rsync.err)"
  fi
}

# rclone-Konfiguration (einmalig) aus Umgebungsvariablen bauen: Hetzner-Storage-Box
# per SFTP + crypt-Wrapper (verschlüsselt Inhalt UND Dateinamen).
_rclone_conf="/tmp/rclone.conf"
build_rclone_conf() {
  [ -f "$_rclone_conf" ] && return 0
  cpass=$(rclone obscure "${BACKUP_CRYPT_PASSWORD}")
  hpass=$(rclone obscure "${HETZNER_SFTP_PASS:-}")
  cat > "$_rclone_conf" <<EOF
[hetzner]
type = sftp
host = ${HETZNER_SFTP_HOST}
user = ${HETZNER_SFTP_USER:-}
port = ${HETZNER_SFTP_PORT:-23}
pass = ${hpass}
shell_type = unix

[hetznercrypt]
type = crypt
remote = hetzner:${HETZNER_REMOTE_PATH:-northflow-backups}
password = ${cpass}
filename_encryption = standard
directory_name_encryption = true
EOF
}

# Optionaler, verschlüsselter Upload zur Hetzner Storage Box (SFTP via rclone crypt).
maybe_push_hetzner() {
  [ -n "${HETZNER_SFTP_HOST:-}" ] || { HETZNER_RESULT="off"; return 0; }
  if [ -z "${BACKUP_CRYPT_PASSWORD:-}" ]; then
    HETZNER_RESULT="error"
    log "Hetzner-Push übersprungen: BACKUP_CRYPT_PASSWORD nicht gesetzt (Verschlüsselung Pflicht)"
    return 0
  fi
  build_rclone_conf
  log "rclone -> Hetzner (verschlüsselt)"
  if rclone --config "$_rclone_conf" copy "$1" hetznercrypt: 2>/tmp/rclone.err; then
    rclone --config "$_rclone_conf" delete --min-age "${HETZNER_KEEP_HOURS:-720}h" hetznercrypt: 2>/dev/null || true
    HETZNER_RESULT="ok"; log "Hetzner-Push OK"
  else
    HETZNER_RESULT="error"; log "Hetzner-Push FEHLER: $(cat /tmp/rclone.err)"
  fi
}

if [ "${1:-}" = "once" ]; then
  run_backup
  exit $?
fi

log "Backup-Dienst gestartet (Intervall ${INTERVAL}s, behalte ${KEEP_DAILY} lokal / ${KEEP_WEEKLY} wöchentlich)"
elapsed="$INTERVAL"   # beim Start sofort einmal sichern
while true; do
  if [ -f "$TRIGGER" ]; then
    rm -f "$TRIGGER"
    log "Manuelle Sicherung (Trigger)"
    run_backup || log "Sicherung fehlgeschlagen"
    elapsed=0
  elif [ "$elapsed" -ge "$INTERVAL" ]; then
    run_backup || log "Sicherung fehlgeschlagen – nächster Versuch in ${INTERVAL}s"
    elapsed=0
  fi
  sleep 20
  elapsed=$((elapsed + 20))
done
