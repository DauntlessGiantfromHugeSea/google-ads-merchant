# Datensicherung (PostgreSQL → Synology)

Der `backup`-Container zieht **jede Nacht** ein `pg_dump` der Datenbank, komprimiert
es (`.sql.gz`), rotiert automatisch (Standard: 14 täglich + 8 wöchentlich) und legt
die Dateien im Host-Ordner **`./backups`** ab (`daily/`, `weekly/`).

Damit sind alle Daten gesichert: Kunden, Reports, Angebote, Verträge, Rechnungen,
Dokumente usw. liegen alle in der Datenbank.

## Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backup
```

Der Dienst macht sofort eine erste Sicherung und danach alle 24 h.

Manuelle Sicherung sofort (z. B. vor einem Update):
```bash
docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh once
```

## Auf die Synology bringen – drei Wege (einer reicht)

### A) Synology holt sich die Backups (empfohlen, keine Zugangsdaten auf dem Server)
Auf der Synology **Hyper Backup** oder einen **rsync-/Cloud-Sync-Task** einrichten, der
den Server-Ordner `.../northflow/backups` regelmäßig zieht (per SSH/rsync).
Nichts weiter am Server nötig.

### B) Synology-Freigabe am Server einhängen
Eine SMB/NFS-Freigabe der Synology am Server mounten und `./backups` dorthin zeigen
lassen (z. B. via Bind-Mount oder Symlink). Dann landen die Dumps direkt auf der NAS.

### C) Server schiebt per rsync/SSH (z. B. über Tailscale)
In `.env.prod` setzen und den SSH-Key nach `deploy/backup/keys/id_backup` legen:
```
SYNOLOGY_RSYNC_TARGET=backup@deine-synology:/volume1/northflow-backups/
SYNOLOGY_SSH_PORT=22
```
Auf der Synology: **SSH aktivieren**, Benutzer `backup` anlegen, öffentlichen Key
hinterlegen, Zielordner freigeben. Danach `backup` neu starten. Der Push läuft nach
jeder Sicherung.

## Download über die Oberfläche
Als Admin unter **Einstellungen → Datensicherung** – erreichbar **nur über Tailscale**
(die Dumps enthalten alle Daten). Praktisch, um schnell eine Kopie zu greifen.

## Wiederherstellung (Restore)

> Achtung: überschreibt die aktuelle Datenbank. Das Skript zieht vorher automatisch
> einen Sicherheits-Dump.

```bash
# verfügbare Sicherungen ansehen
docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/restore.sh

# eine bestimmte zurückspielen
docker compose -f docker-compose.prod.yml exec backup \
  /usr/local/bin/restore.sh /backups/daily/northflow-YYYYmmdd-HHMMSS.sql.gz

# danach Backend + Worker neu starten
docker compose -f docker-compose.prod.yml restart backend worker
```

Eine von der Synology geholte Datei zuerst nach `./backups/daily/` zurückkopieren,
dann wie oben zurückspielen.

## Einstellungen (optional, in `.env.prod`)
| Variable | Standard | Bedeutung |
|---|---|---|
| `KEEP_DAILY` | 14 | Anzahl täglicher Sicherungen |
| `KEEP_WEEKLY` | 8 | Anzahl wöchentlicher Sicherungen (sonntags) |
| `SYNOLOGY_RSYNC_TARGET` | – | Ziel für den optionalen Push (Weg C) |
| `SYNOLOGY_SSH_PORT` | 22 | SSH-Port der Synology |
