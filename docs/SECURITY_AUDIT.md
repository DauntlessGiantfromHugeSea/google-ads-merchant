# Security-Audit — North Flow (Backend)

Durchgeführt am 2026-10-11 nach dem Muster des Cloudflare „security-audit-skill":
Codebase kartiert → mehrere Prüf-Agents parallel (Auth/Mandantentrennung,
öffentliche Endpunkte/Dateien/SSRF, Secrets/Krypto/Injection) → jeder Fund
**gegengeprüft** (Verdikt CONFIRMED / NEEDS_VALIDATION / REJECTED).

Gesamtbefund: Die Mandantentrennung ist über weite Strecken sauber (`get_scoped_client`,
org-/client-Scoping fast überall), SQL ist parametrisiert, Mails/PDFs sind escaped,
DB/Redis sind nicht öffentlich. Es gab einige klare Lücken — die bestätigten wurden
in diesem Durchgang behoben.

## Behobene Funde

| # | Schwere | Fund | Fix | Datei |
|---|---|---|---|---|
| 1 | HIGH | `/api/clients/{id}/projectdoc/anleitung` (JSON) gab dem Kunden **alle** Doku-Bereiche zurück (Technik/SEO/SEA, inkl. „Login & Zugänge") statt nur „Anleitung". | Antwort auf die Anleitung-Gruppe gefiltert (wie schon im PDF-Pfad). | `projectdoc.py` |
| 2 | HIGH | `/api/mail/connect` ohne Rollenprüfung → ein Kunden-Login konnte das Microsoft-Postfach der Agentur überschreiben/übernehmen (danach liefe aller Mailversand über das fremde Postfach). | `connect` → **Admin**; `status`/`preview`/`test` → **Agentur**. | `mail.py` |
| 3 | HIGH | **SSRF**: `link_url` der Dateifreigabe war frei wählbar; `link_download` holte die URL server-seitig (Cloud-Metadaten `169.254.169.254`, interne Dienste erreichbar). | Nur http/https; Ziel-IP gegen privat/loopback/link-local/metadata gesperrt; Redirects **pro Hop** geprüft; endlicher Timeout. | `fileshare.py` |
| 4 | MEDIUM | Kein Brute-Force-Schutz auf den 6-stelligen E-Mail-Codes (Dateifreigabe, Angebote, Verträge): kein Zähler, Code wurde bei Fehlversuch nicht invalidiert, `==`-Vergleich. 1 Mio. Codes in 15 min ist brute-forcebar. | Pro Objekt **max. 5 Fehlversuche** → Code wird ungültig (429); **konstantzeitiger** Vergleich (`hmac.compare_digest`); Zähler-Reset bei neuem Code/Erfolg. | `fileshare.py`, `offers.py`, `contracts.py` |
| 5 | MEDIUM | `require_tailnet` nahm den **linken** `X-Forwarded-For`-Eintrag (client-spoofbar) → Tailscale-Schutz umgehbar. | Nutzt den **rechten** (vom vertrauenswürdigen Caddy gesetzten) Eintrag. | `deps.py` |
| 6 | MEDIUM | Prod-Secret-Guard (Default-/zu kurzer `SECRET_KEY`) griff nur bei exakt `APP_ENV=production` → bei `Production`/`prod`/Tippfehler stiller Ausfall (forgebare JWTs). | Robuste Erkennung (`_is_production`, normalisiert, akzeptiert `prod`). | `main.py` |
| 7 | MEDIUM/LOW | Login-Dummy-Hash (`"$2b$..z"*53`) evtl. ungültig → 500/Timing-Orakel zur Nutzer-Enumeration. | Echter, bei Import berechneter bcrypt-Hash; `verify_password` wirft nie mehr (Fehler → „passt nicht"). | `auth.py`, `core/security.py` |
| 8 | LOW | Share-Download akzeptierte das Zugriffs-JWT auch via `?t=` (Token-Leak in Logs/Referer). | Nur noch `Authorization`-Header. | `fileshare.py` |

## Offene Empfehlungen (nicht geändert — bewusst/abzuwägen)

- **Dateifreigabe „1× öffnen":** Eine Verifizierung = eine Öffnung; innerhalb der
  Token-Gültigkeit (Standard 60 min) sind mehrere Downloads möglich. Wenn „einmal
  herunterladen" strikt gelten soll, pro Download zählen. (NEEDS_VALIDATION — Produktentscheidung.)
- **Credential-Encryption-Key** wird bei fehlendem `CREDENTIAL_ENCRYPTION_KEY` aus dem
  `SECRET_KEY` abgeleitet (in Prod nur Warnung). Empfehlung: eigenen Fernet-Key in Prod
  **verpflichtend** machen (Schlüsseltrennung; sonst entschlüsselt ein SECRET_KEY-Leak auch
  alle gespeicherten Zugangsdaten/MS-Tokens).
- **CSP/HSTS** fehlen im In-App-Security-Header-Middleware (nur in Caddy gesetzt) → beim
  direkten Tailscale-Zugriff ohne CSP/HSTS. Ergänzen, falls HTML über diesen Pfad kommt.
- **Graph-Fehlertexte** werden in API-Fehler an die Agentur zurückgegeben (`mail.py`): lieber
  generische Meldung + Server-Log.
- **`receipt_filename`** erscheint in der Kunden-Rechnungsliste (Datei-Download ist agentur-only).
  Minimaler Infoleak — entfernen, wenn gewünscht.
- **`/participants/confirm-logo|confirm-banner/{client_id}`** sind ohne Token öffentlich
  (für Mail-Einbettung gedacht) → erlauben Existenz-Enumeration. Low.

## Was geprüft und als sicher verworfen wurde (Auszug)
Panel-Webhook-HMAC (roher Body, `compare_digest`, Replay-Fenster, Idempotenz), Pfad-Traversal
bei Datei-Downloads, E-Mail-Header-Injection (Graph-JSON, kein SMTP), SQL-Injection
(`_ensure_columns` nur aus hartkodierten Dicts), Template-/PDF-Injection (Autoescape an),
Impersonation & Share-Token-Cross-Use, Login-Lockout, DB/Redis-Exposition, committete Secrets,
Backup-Krypto-Key-Handling, Mass-Assignment (Pydantic-/Whitelist-basiert).

## Hinweis
Die Fixes wurden in dieser Umgebung nur **syntaktisch** geprüft (keine `.venv` zum Laufzeit-Test
verfügbar). Nach dem Deploy sollten die betroffenen Flows einmal durchgetestet werden:
Kunden-Anleitung, Mailversand/Testmail (als Admin), Dateifreigabe (Code + Download + Nextcloud),
Angebot annehmen/Vertrag signieren per Code.
