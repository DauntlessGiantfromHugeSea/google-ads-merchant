# North Flow – Änderungsdokumentation

Nachvollziehbare Übersicht aller Änderungen auf dem Branch `claude/serene-gauss-b3alke`
(gegenüber `main`). Stand: 2026-09-03.

**Umfang:** 114 Commits · 140 Dateien · ~17.600 neue Zeilen.
Zeitraum der Commits: 2026-07-28 – 2026-09-03.

Jeder Abschnitt nennt: **was**, die **Datei(en)**, das **Wie** (Funktionsweise) und die
zugehörigen **Commits** (Kurz-Hash). Hash im Terminal auflösbar mit `git show <hash>`.

## Grundmuster (gilt für fast alle Punkte)

- **Backend:** FastAPI + SQLAlchemy 2.0 (`Mapped`/`mapped_column`), Pydantic v2, JWT-Auth.
  Neue Spalten werden beim Start automatisch angelegt über `_ensure_columns(...)` in
  `backend/app/main.py` (`_ensure_schema()`), neue Tabellen über `Base.metadata.create_all`.
  Es gibt also **keine** separaten Migrationsdateien – Schemaänderungen stehen in
  `models.py` **und** im passenden Migrations-Dict in `main.py`.
- **Scoping/Sicherheit:** `get_scoped_client(...)`, `require_agency`, `require_admin`,
  `get_current_user`. Kunden sehen ausschließlich eigene, freigegebene Daten; interne
  Bereiche (Onboarding, interner Verlauf, Zugangsdaten, Belege, Technik-/SEO-/SEA-Doku)
  sind agentur-only.
- **Frontend:** React + TypeScript + Vite, Router v6, zentraler API-Client
  `frontend/src/api.ts` (`request<T>()`), Toasts über `useToast()`, PDF/ZIP-Downloads per
  authentifiziertem `fetch` + Blob.
- **PDFs:** WeasyPrint + Jinja-Templates in `backend/app/templates/`, Briefpapier-Overlay
  über `backend/app/services/pdf.py`.
- **Mailversand:** Microsoft Graph in `backend/app/api/routes/mail.py`
  (`send_via_graph(...)`, `render_email_html(...)`).

---

## 1. E-Mail-Konversationen / Ticketing

**Was:** Ausgehende Mails bekommen eine Referenznummer; Kundenantworten laufen im Tool
auf, können dort beantwortet werden. Automatischer Posteingang-Abgleich (inkl. „Gesendet")
plus manueller Button. Geschlossene Konversationen löschbar. Ersteller wird angezeigt.

**Dateien:**
- `backend/app/api/routes/mail_threads.py` – Thread-/Nachrichten-CRUD, `_new_reference`
  (Format `NL-XXXXX-XXXXX`, zufällig), `sync_org_inbox` + `_sync_sent` (Dedup über Graph-ID),
  `_creator_name`, Löschen nur bei geschlossenen Threads.
- `backend/app/api/routes/mail.py` – Scopes getrennt: `SCOPE_SEND` (nur `Mail.Send`) fürs
  Senden, `SCOPE_FULL` (+`Mail.Read`) fürs Lesen; `_read_folder` liest Posteingang/Gesendet.
- `backend/app/models.py` – Modelle `MailThread`, `MailMessage`.
- `backend/app/main.py` – Registrierung Router + Hintergrund-Task `_mail_sync_loop`.
- `frontend/src/sections/Conversations.tsx` – UI (Threads, Antworten, Löschen, „von <Name>").

**Wie:** Beim Senden über das System wird eine Referenz erzeugt und im Mail-Footer platziert
(du-Form-Hinweis „bitte stehen lassen"). Ein Hintergrund-Loop pollt alle paar Minuten
Posteingang **und** Gesendet-Ordner, ordnet Nachrichten per Referenz dem Thread zu und
dedupliziert über die Graph-Message-ID.

**Commits:** `68abe71`, `2266b59`, `e35b901`, `b86159e`, `1e7b44e`, `617bda2` (Fix: Scope-
Erweiterung brach Versand → 500).

---

## 2. Webhook / Formular-Eingänge (früher „Teilnehmer")

**Was:** „Teilnehmer" → **Webhook** umbenannt. Bei neuem Eintrag: Empfänger wählbar
(ich/Team-Toggle, Kunde, Zusatzadresse), Master-Schalter ob überhaupt eine Mail kommt,
Wortlaut „Neuer Eintrag", optional alle Formularfelder + Link zum Eintrag. Kunde kann sich
eine CSV-Übersicht selbst mailen. Automatische Buchungsbestätigung an den Anmeldenden mit
pro Kunde hochladbarem Logo, Absender wählbar (z. B. `noreply@north-lab.de`).

**Dateien:**
- `backend/app/api/routes/participants.py` – `_status`, `/notify`, `/confirm`,
  `/confirm-logo` (Upload/Delete) + öffentliches `/confirm-logo/{client_id}`,
  `_mail_new_entry` (Empfänger/Felder/Link), `_send_confirmation` (Absender mit Fallback),
  `/email-me` (CSV via `_csv_bytes`).
- `backend/app/models.py` – Client-Felder `webhook_notify_enabled/agency/client/email`,
  `webhook_include_fields/link`, `webhook_confirm_enabled/subject/text`, `webhook_from`,
  `webhook_logo_base64/content_type`.
- `frontend/src/sections/Participants.tsx` – umbenannte Webhook-UI mit allen Optionen.

**Wie:** Contact-Form-7-Eingänge treffen den Endpunkt; abhängig vom Master-Schalter und den
gewählten Empfängern wird die „Neuer Eintrag"-Mail verschickt; die Bestätigung geht an den
Anmeldenden im Kunden-Branding.

**Commits:** `3e9033a`, `ddc1fe7`, `a31b443`, `a33bc1d`, `7dd7935`, `7b536a9`, `6b8a85d`,
`965eb23`.

---

## 3. Marken-Mails (Logo/Banner)

**Was:** Logo auf Banner/Gradient (weißes Logo war im Whitemode unsichtbar), Markenfarben
Coral → Dark-Navy, Logo-Verzerrung behoben.

**Dateien:** `backend/app/api/routes/mail.py` – `render_email_html(...)`, Kopf-`<div>` mit
`background-image:linear-gradient(120deg,#1c2140,#c4553f)`, Logo nur über `max-height`
begrenzt (Breite automatisch → keine Verzerrung).

**Commits:** `8166220`, `335d283`, `f5938ce`, `bf58e94`, `8e4401c`.

---

## 4. Projekt-Dokumentation (Anleitung / Technik / SEO / SEA)

**Was:** Getrennte Doku-Bereiche pro Kunde. Kunde sieht nur die **Anleitung**; Technik-,
SEO- und SEA-Doku sind intern. Jede Doku als eigenes PDF **mit Deckblatt** (Projekt +
2-Satz-Beschreibung), pro Kunde aktivierbar (nicht jeder hat SEO/SEA), und „**Alles als
PDF**" als **eine** kombinierte Datei. `**Fett**` funktioniert korrekt.

**Dateien:**
- `backend/app/api/routes/projectdoc.py` – gruppierte `SECTIONS`,
  `_anleitung_sections(...)`, `_cover_pdf(...)`, Endpunkte `/pdf` (nur Anleitung),
  `/technik.pdf`, `/seo.pdf`, `/sea.pdf`, `/gesamt.pdf` (kombiniert), Kunden-Endpunkte
  `/anleitung` + `/anleitung.pdf`.
- `backend/app/templates/technikdoc.html`, `gesamtdoc.html`, `projectdoc.html` – Deckblatt,
  TOC, Kapitel je Gruppe.
- `frontend/src/sections/ProjectDoc.tsx` – 4 Gruppen, Aktivierung über `__active__`,
  Fett-Fix in der RichText-Erkennung (Aufzählung nur bei Leerzeichen nach Marker).

**Wie:** Abschnitte sind Gruppen zugeordnet; Aktivierung steuert Sichtbarkeit/Export.
`/gesamt.pdf` rendert Deckblatt + Inhaltsverzeichnis + alle aktiven Gruppen in einem Dokument.

**Commits:** `f768439`, `3c9e44b`, `67e4d78`, `2046724`, `4044bbd`, `cd6b5a5`.

---

## 5. WordPress-Update-Monitoring (WPMonitor)

**Was:** WPMonitor-Digest per Webhook empfangen; zentrale „Schnittstelle" listet alle
überwachten Seiten mit Kunden-Zuordnungs-Dropdown. Mail bei fälligen Updates. Kunde sieht:
Updates erledigt / alles aktuell. Manueller „✓ erledigt"-Button schreibt ins Protokoll.

**Dateien:**
- `backend/app/api/routes/wp.py` – Org-Webhook `/api/wp/webhook/{token}` (HMAC-verifiziert,
  parst den Digest, ordnet Host→Kunde über `WpSite`, Auto-Match + manueller Override),
  `/webhook-url`, `/secret`, `/overview`, `/sites`, `/sites/assign`; Kunden-Router
  `/api/clients/{id}/wp` (GET, `/{update_id}/done`, `/done-all`).
- `backend/app/models.py` – `WpUpdate`, `WpSite`; Organization-Felder `wp_token`, `wp_secret`.
- `frontend/src/pages/WpMonitor.tsx` – zentrale Seite (Analyse-Menü).
- `frontend/src/sections/WpUpdates.tsx` – „✓ erledigt" je Update + „Alle erledigt".

**Wie:** Signatur = `sha256=` + HMAC-SHA256(secret, `"<timestamp>.<body>"`). „Erledigt"
schreibt einen Protokoll-Eintrag (siehe 6) und entfernt den `WpUpdate`. Recovery-Ereignisse
erzeugen automatisch einen System-Protokoll-Eintrag.

**Commits:** `b7d5173`, `c63b308`, `b3f2907`, `0ea0a35`.

---

## 6. Arbeitsprotokoll je Kunde (nicht der interne Verlauf-Chat)

**Was:** Freies Feld „was wurde wann gemacht" mit Datum/Uhrzeit; zusätzlich automatische
System-Einträge (WP-Updates). Pro Eintrag „für Kunde sichtbar" wählbar.

**Dateien:**
- `backend/app/api/routes/activity.py` – `log_activity(...)` (ohne Commit, Aufrufer committet),
  kundenscoped GET (Kunde sieht nur `client_visible`), POST/PATCH/DELETE (agentur).
- `backend/app/models.py` – `ActivityEntry` (`occurred_at`, `author`, `source`
  manual/system, `text`, `client_visible`).
- `frontend/src/sections/Activity.tsx` – Protokoll-UI.

**Commits:** `b3f2907`, `0ea0a35`.

---

## 7. Rechnungen

**Was (jüngste Änderung):** Pro Rechnung eine **abweichende Empfänger-Mail** – Rechnung
**und** Zahlungserinnerung gehen an diese Adresse statt an die Kunden-Mail; leer → Fallback
`billing_email` → `contact_email`.

**Dateien:**
- `backend/app/api/routes/invoices.py` – `upload_invoice` Feld `recipient_email`,
  `_notify_new_invoice` + `remind_invoice`:
  `to = (inv.recipient_email or client.billing_email or client.contact_email or "").strip()`.
- `backend/app/models.py` – Invoice-Feld `recipient_email`.
- `frontend/src/pages/Invoices.tsx` – Formularfeld „Rechnungs-E-Mail (abweichend, optional)".

**Weitere Rechnungs-/Zahlungs-Funktionen:** Register, Zahlungsbeleg je Rechnung,
Kostenaufstellung (PDF/ZIP), Zahlungen-Ledger mit IBAN/Betreff/±, E-Rechnung.
Dateien u. a. `backend/app/api/routes/payments.py`, `services/einvoice.py`,
`templates/kostenaufstellung.html`.

**Commits:** `7db153f`, `1098476`, `aa8d5e6`, `506677a`, `47f20f7`, `d80bfd2`, `da9462c`.

---

## 8. Sicherheit / Robustheit

**Was:** Login-Sperre nach Fehlversuchen, Prod-`SECRET_KEY`-Guard, Idle-Logout,
`Cache-Control: no-store` auf `/api/`, gehärtete CORS/Security-Header, keine Server-/IP-
Preisgabe, 2FA (TOTP). Nie mehr komplett leerer Bildschirm.

**Dateien:**
- `backend/app/api/routes/auth.py` – `_MAX_FAILED_LOGINS=5`, `_LOCK_MINUTES=15`,
  `_register_failure`, Dummy-Hash gegen Timing, 429 bei Sperre, Reset bei Erfolg;
  User-Felder `failed_logins`, `locked_until`.
- `backend/app/main.py` – `_check_production_secrets()` (RuntimeError bei Default-/kurzem
  Key in Produktion), Security-Header-Middleware.
- `frontend/src/App.tsx` – `RootBoundary` um die Routes (fängt Render-Fehler global ab).
- `frontend/src/sections/Reportings.tsx` u. a. – Teilbereich-Fehler machen den Tab nicht weiß.

**Commits:** `2542350`, `abce2ea`, `498243f`, `1f97265`, `2ea2646`, `11e0175`.

---

## 9. Aufräumen / Navigation

**Was:** Kundenprofil 8 → 6 Reiter (Projekte+Doku zusammen, Monitoring→Reporting),
Topbar 11 → 5 gruppierte Dropdowns, Titel „North Flow" statt „North Flow · Reporting",
Kundenmenüs zu 5 Bereichen + Hilfe-Seite.

**Dateien:** `frontend/src/pages/ClientDetail.tsx`, `frontend/src/App.tsx` (NavGroup-
Dropdowns), diverse `sections/`.

**Commits:** `37dfb68`, `360cf9a`, `01f9e9f`, `93f9fb9`, `9777009`.

---

## 10. Kundenstammdaten

**Was:** Name & Firma bearbeitbar, Kundenfelder editierbar, Archivieren (reversibel) &
Löschen (Admin, mit vollständigem Aufräumen), langer Text bleibt in Kacheln (Ellipsis).

**Dateien:** `backend/app/api/routes/clients.py`, `frontend/src/sections/Contact.tsx`,
`frontend/src/sections/Overview.tsx`.

**Commits:** `b4c9d7c`, `c0d65ef`, `25a86b6`.

---

## 11. Zeit-/Arbeitserfassung & Leistungsnachweis

**Was:** Stoppuhr, Projektzuordnung, Nachtragen/Bearbeiten, 15-Min-Abrechnung, Stundensätze,
CSV, Arbeitslog je Projekt + Leistungsnachweis-PDF, druckbares Web-Arbeitsprotokoll (im
Agentur-Branding, optional auf Briefpapier).

**Dateien:** `backend/app/api/routes/timetracking.py`, `projects.py`,
`templates/leistungsnachweis.html`, `worklog.html`, `worksheet.html`,
`frontend/src/pages/Zeit.tsx`, `sections/ClientTime.tsx`, `BillingTable.tsx`.

**Commits:** `4f885e1`, `82364e4`, `3cbb145`, `3df8085`, `b716ad9`, `c5dffc5`, `64a71b4`,
`f0f1b45`.

---

## 12. Weitere Bereiche (Kurzüberblick)

- **KI-Transparenz-Generator** (Art. 50 KI-VO / § 18 MStV): `frontend/src/pages/AiTransparency.tsx`. Commit `91d9bba`.
- **Verträge** (digital unterschreiben, zwei Parteien, Vorlagen, mobilfeste Signatur):
  `backend/app/api/routes/contracts.py`, `templates/contract.html`,
  `frontend/src/sections/Contracts.tsx`, `pages/Vertrag.tsx`.
  Commits `c78ab4d`, `92f697b`, `de5df53`, `960f22d`, u. a.
- **Angebote / Sales / Gap-Analyse:** `offers.py`, `templates/offer.html`,
  `sections/Offers.tsx`, `pages/Sales.tsx`, `data/northlab_prices.py`.
  Commits `1571c2d`, `392a9a3`, `f88055b`.
- **Onboarding / Briefings / Zugangsdaten-Tresor:** `onboarding.py`, `briefings.py`,
  `credentials.py` (Fernet-Verschlüsselung, `core/crypto.py`).
  Commits `4da3374`, `3bb4c35`, `f14fb50`, `d3b7028`.
- **Reporting / KPIs / SEO-Audit / Monitoring:** `kpis.py`, `seo.py`, `services/seo_audit.py`,
  `services/kpi.py`, `monitoring.py`, `templates/seo_audit.html`, `monitoring_report.html`.
- **Termine/Planner:** `appointments.py`, `pages/Planner.tsx`, `sections/Appointments.tsx`.
- **Datei-Anforderungen (öffentlicher Upload, ZIP-Download):** `filerequests.py`.
- **Datensicherung:** `deploy/backup/` (nächtliche DB-Backups + Synology + Restore).
  Commit `0749967`.

---

## 13. Deployment / Infrastruktur

**Was:** `deploy.sh` für Ein-Klick-Prod-Deploy (nutzt Prod-Compose + `.env.prod`).
Prod läuft über `docker-compose.prod.yml` (`expose: 8000` + Caddy), **nicht** über das
Dev-Compose (das `8000:8000` published und mit anderen Containern kollidiert).

**Dateien:** `deploy.sh`, `docker-compose.prod.yml`, `deploy/Caddyfile`,
`.env.prod.example`, `backend/Dockerfile`.

**Deploy-Befehl:**
```bash
cd ~/northflow/northflow && git pull && ./deploy.sh
```

**Wichtig:** In `.env.prod` muss `SECRET_KEY` gesetzt sein (≥ 32 Zeichen), sonst startet das
Backend absichtlich nicht:
```bash
SECRET_KEY=$(openssl rand -hex 48)
```

**Commits:** `51463ad`, `1e3b65e`.

---

## Anhang: alle Commits chronologisch anzeigen

```bash
git log --oneline --stat main..claude/serene-gauss-b3alke   # mit Dateien
git show <hash>                                              # ein Commit im Detail
git diff --stat main..claude/serene-gauss-b3alke            # Gesamtüberblick
```
