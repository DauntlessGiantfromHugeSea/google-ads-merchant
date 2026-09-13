# NorthLab Control Panel → North Flow (Webhook)

Empfängt die Webhooks von `panel.north-lab.de` (WordPress-Verwaltung: Updates,
Verfügbarkeit, Security, Wartung) und zeigt den Stand pro Kunde im Portal.

## Endpunkt

```
POST https://north-flow.de/api/panel/webhook
Content-Type: application/json
X-NorthLab-Event      z. B. update.applied
X-NorthLab-Delivery   eindeutige ID (Idempotenz)
X-NorthLab-Timestamp  Unix-Zeit
X-NorthLab-Signature  sha256=<HMAC>
```

Signatur = `sha256=` + HMAC-SHA256(**Secret**, `"<timestamp>.<roher Body>"`).
Geprüft wird timing-sicher; Zeitstempel älter als 5 Min. werden abgelehnt
(Replay-Schutz); bereits gesehene `X-NorthLab-Delivery` werden mit 200
quittiert, aber nicht erneut verarbeitet. Angenommen wird sofort (200), die
Auswertung läuft asynchron im Hintergrund.

## Secret hinterlegen

Nur in der Umgebung, nie im Repository. In `.env.prod`:

```
NORTHLAB_PANEL_SECRET=<geheim, identisch im Panel hinterlegen>
NORTHLAB_PANEL_TOKEN=<Bearer-Token für die Abruf-API des Panels>
```

Secret erzeugen: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
Nach dem Setzen deployen: `./deploy.sh`.

## Kunden-Zuordnung

Das Panel hat eigene Kunden-IDs. Unter **Analyse → Website-Verwaltung** ordnest
du jeden Panel-Kunden einem Kunden im Tool zu. Erst dann sieht dessen Login die
eigenen Seiten (Reiter **Reporting → Website-Status**). Die Prüfung passiert in
der Abfrage – ein Kunde bekommt ausschließlich Seiten mit seiner Zuordnung.

## Zustellung lokal nachstellen

```bash
SECRET="dein-secret"
TS=$(date +%s)
BODY='{"event":"site.online","occurred_at":"2026-09-13T18:30:00+00:00","site":{"id":7,"client_id":2},"data":{"source":"heartbeat","downtime_seconds":120}}'
SIG="sha256=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -sS -X POST http://localhost:8000/api/panel/webhook \
  -H "Content-Type: application/json" \
  -H "X-NorthLab-Event: site.online" \
  -H "X-NorthLab-Delivery: $(openssl rand -hex 16)" \
  -H "X-NorthLab-Timestamp: $TS" \
  -H "X-NorthLab-Signature: $SIG" \
  --data "$BODY"
# -> {"ok":true}   (gleiche Delivery-ID erneut -> {"ok":true,"duplicate":true})
```

Wichtig: den Body als **exakt dieselben Bytes** senden, über die die Signatur
gebildet wurde (nicht neu serialisieren/formatieren).

## Verhalten

- **snapshot.full** (Erstbefüllung + täglich): Wahrheitsquelle – Kunden, Seiten,
  Störungen und Tages-Uptime werden per Upsert abgeglichen.
- **update.applied**: Einträge in die Update-Historie („das haben wir getan").
- **updates.available**: offene Updates je Seite.
- **site.offline/online**: Störung öffnen/schließen (Downtime).
- **security.changed**: Sicherheitsbewertung 0–100.
- **site.connected/disconnected**: Verbindungsstatus.
- Unbekannte Events und unbekannte Felder werden ignoriert (nicht abgelehnt).
- Alle Zeiten werden in UTC gespeichert, erst in der Anzeige umgerechnet.
- `message` ist reiner Anzeigetext und wird nie ausgewertet – nur `data`.

## Erstimport / Recovery (Abruf-API des Panels)

```
GET https://panel.north-lab.de/api/v1/export?days=30
Authorization: Bearer <NORTHLAB_PANEL_TOKEN>
```

Liefert exakt die `data`-Struktur von `snapshot.full`; kann bei Bedarf als
`snapshot.full` eingespielt werden, um den Bestand neu aufzusetzen.
