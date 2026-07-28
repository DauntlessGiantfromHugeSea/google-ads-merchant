# Tailscale: RE-/Rechnungsfunktion nur für dich (privat)

Ziel: **Kunden** erreichen die Plattform weiter **öffentlich** über
`https://north-flow.de`. Die **Rechnungs-/RE-Funktion** (Rechnung per E-Mail
senden) ist **nur über dein Tailscale-Netz** nutzbar.

So funktioniert es: Der Server prüft bei den RE-Endpunkten die Herkunfts-IP.
Ist `TAILSCALE_GUARD=true`, sind sie nur aus dem Tailscale-Bereich
(100.64.0.0/10) erreichbar. Du greifst dafür über Tailscale auf die App zu.

## 1. Tailscale auf dem VPS installieren
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Beim ersten Mal den Anmelde-Link öffnen und den Server deinem Tailnet
hinzufügen. Auf deinem Mac/Handy ebenfalls Tailscale installieren und im
selben Tailnet anmelden.

## 2. Die App im Tailnet bereitstellen
Das Frontend ist lokal auf `127.0.0.1:8080` gebunden (siehe
`docker-compose.prod.yml`). Gib es per Tailscale frei:
```bash
sudo tailscale serve --bg 8080
```
Danach zeigt `sudo tailscale serve status` eine private HTTPS-URL wie
`https://<server>.<dein-tailnet>.ts.net` — **nur in deinem Tailnet erreichbar**.

## 3. Schutz aktivieren
In `.env.prod`:
```
TAILSCALE_GUARD=true
```
und neu starten:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Nutzung
- **Kunden / normaler Betrieb:** weiter über `https://north-flow.de` (öffentlich).
- **Du – Rechnung senden:** öffne die App über die **Tailscale-URL**
  (`https://<server>.<tailnet>.ts.net`), gehe zum Kunden → **Dokumente &
  Rechnungen** → Rechnung hochladen → **„per E-Mail"**. Über north-flow.de
  wäre genau dieser Schritt gesperrt (403).

> Hinweis: Möchtest du, dass **dein kompletter Agentur-Login** nur über
> Tailscale geht (nicht nur das RE-Senden), sag Bescheid – dann weite ich den
> Schutz auf weitere Endpunkte aus. Aktuell bleibt alles außer dem
> RE-Versand öffentlich, damit Kunden und dein normaler Betrieb ungestört sind.
