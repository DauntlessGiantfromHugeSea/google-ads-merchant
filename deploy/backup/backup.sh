#!/bin/sh
# PostgreSQL-Sicherung mit Rotation, optionalem Synology-Push (rsync) und
# optionalem verschlüsseltem Strato-Upload (rclone crypt über WebDAV).
# Läuft als eigener Container im Stack. Schreibt nach /backups (Host: ./backups).
#
#   backup.sh once   -> genau eine Sicherung, dann beenden (manuell/vor Updates)
#   backup.sh        -> Dauerbetrieb: alle BACKUP_INTERVAL Sekunden (Standard: 1 h)
set -eu

DIR="${BACKUP_DIR:-/backups}"
KEEP_DAILY="${KEEP_DAILY:-72}"     # so viele Sicherungen lokal behalten (stündlich = 3 Tage)
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"    # so viele Wochen-Sicherungen (sonntags)
INTERVAL="${BACKUP_INTERVAL:-3600}"

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

  # Wochen-Kopie sonntags – höchstens einmal pro Tag (bei stündlichem Lauf).
  wf="$DIR/weekly/northflow-$(date +%Y%m%d).sql.gz"
  [ "$dow" = "7" ] && [ ! -f "$wf" ] && cp "$out" "$wf"

  # Rotation (neueste behalten, Rest löschen)
  ls -1t "$DIR/daily"/*.sql.gz 2>/dev/null  | tail -n +"$((KEEP_DAILY + 1))"  | while read -r f; do rm -f "$f"; done
  ls -1t "$DIR/weekly"/*.sql.gz 2>/dev/null | tail -n +"$((KEEP_WEEKLY + 1))" | while read -r f; do rm -f "$f"; done

  maybe_push "$out"
  maybe_push_strato "$out"
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

# rclone-Konfiguration (einmalig) aus Umgebungsvariablen bauen: WebDAV-Ziel
# + crypt-Wrapper (verschlüsselt Inhalt UND Dateinamen). Passwörter werden
# mit `rclone obscure` verschleiert. Der crypt-Schlüssel bleibt NUR hier.
_rclone_conf="/tmp/rclone.conf"
build_rclone_conf() {
  [ -f "$_rclone_conf" ] && return 0
  wpass=$(rclone obscure "${STRATO_WEBDAV_PASS:-}")
  cpass=$(rclone obscure "${BACKUP_CRYPT_PASSWORD}")
  cat > "$_rclone_conf" <<EOF
[strato]
type = webdav
url = ${STRATO_WEBDAV_URL}
vendor = other
user = ${STRATO_WEBDAV_USER:-}
pass = ${wpass}

[stratocrypt]
type = crypt
remote = strato:${STRATO_REMOTE_PATH:-northflow-backups}
password = ${cpass}
filename_encryption = standard
directory_name_encryption = true
EOF
}

# Optionaler, verschlüsselter Upload zu Strato HiDrive (WebDAV via rclone crypt).
# Aktiv, sobald STRATO_WEBDAV_URL gesetzt ist. BACKUP_CRYPT_PASSWORD ist Pflicht
# (ohne Schlüssel wird NICHT hochgeladen – keine unverschlüsselten Daten in die Cloud).
maybe_push_strato() {
  [ -n "${STRATO_WEBDAV_URL:-}" ] || return 0
  if [ -z "${BACKUP_CRYPT_PASSWORD:-}" ]; then
    log "Strato-Push übersprungen: BACKUP_CRYPT_PASSWORD nicht gesetzt (Verschlüsselung Pflicht)"
    return 0
  fi
  build_rclone_conf
  log "rclone -> Strato (verschlüsselt)"
  if rclone --config "$_rclone_conf" copy "$1" stratocrypt: 2>/tmp/rclone.err; then
    # Aufräumen: Sicherungen älter als STRATO_KEEP_HOURS (Standard 720 h = 30 Tage)
    rclone --config "$_rclone_conf" delete --min-age "${STRATO_KEEP_HOURS:-720}h" stratocrypt: 2>/dev/null || true
    log "Strato-Push OK"
  else
    log "Strato-Push FEHLER: $(cat /tmp/rclone.err)"
  fi
}

if [ "${1:-}" = "once" ]; then
  run_backup
  exit $?
fi

log "Backup-Dienst gestartet (Intervall ${INTERVAL}s, behalte ${KEEP_DAILY} lokal / ${KEEP_WEEKLY} wöchentlich)"
while true; do
  run_backup || log "Sicherung fehlgeschlagen – nächster Versuch in ${INTERVAL}s"
  sleep "$INTERVAL"
done
