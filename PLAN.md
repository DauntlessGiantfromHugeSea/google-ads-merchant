# Projektplan: Agentur-Reporting-Plattform

Multi-Tenant-Webanwendung, mit der eine Agentur mehrere Kunden verwaltet,
deren Google-Ads- und Merchant-Center-Konten auswertet, SEO bewertet und
auf Knopfdruck PDF-Reports erzeugt. Kunden bekommen eigene Logins und sehen
nur ihre eigenen Daten.

## Kernprinzip: Daten vs. PDF
Beim Report-Lauf werden Kennzahlen geholt, ausgewertet und als **Snapshot in
der Datenbank gespeichert** (bleibt dauerhaft). Das **PDF wird erst beim
Download flüchtig erzeugt**, an den Browser gestreamt und danach verworfen —
es landet nie dauerhaft auf der Platte.

## Technologie-Stack
| Bereich | Wahl |
|---|---|
| Backend | Python + FastAPI |
| Datenbank | PostgreSQL + SQLAlchemy (SQLite-Fallback für Dev) |
| Hintergrundjobs | Celery + Redis |
| Frontend | React + TypeScript (Vite) |
| PDF | WeasyPrint (HTML/CSS → PDF) |
| Google Ads | google-ads |
| Merchant Center | google-api-python-client (Content API) |
| SEO | httpx + BeautifulSoup/lxml + PageSpeed Insights API |
| Deployment | Docker Compose (backend, worker, frontend, postgres, redis) |

## Datenmodell (Kernobjekte)
- **Organization** – die Agentur (Top-Level-Mandant)
- **User** – Rollen: agency_admin, agency_member, client_user
- **Client (Kunde)** – gehört zur Organization
- **AdAccount / MerchantAccount / Website** – mehrere pro Kunde möglich
- **GoogleCredential** – OAuth-Tokens, verschlüsselt gespeichert
- **ReportRun** + Snapshots: AdsSnapshot, MerchantSnapshot, SeoAuditSnapshot
- **OnboardingStatus**, **AuditLog**

Strikte Mandantentrennung: jede Abfrage ist auf Organization/Client gescoped.

## Auswertungs-Module
1. **Google Ads** – Kosten/Budget, Performance (Impr., Klicks, CTR, Conv.,
   ROAS), Aufschlüsselung pro Kampagne/Anzeigengruppe/Keyword, Suchbegriff-
   & Qualitätsfaktor-Analyse.
2. **Merchant Center** – abgelehnte Produkte + Gründe, Feed-Qualität,
   Preis-/Verfügbarkeits-Mismatches, Produkt-Performance.
3. **SEO** – On-Page, Technisch, Content-Qualität + Gesamt-Score und
   priorisierte Empfehlungen.
4. **Report-Generator** – kombiniert Snapshots → gebrandetes PDF, flüchtiger
   Download.

## Onboarding-Flow
Agentur legt Kunde an → Kunden-User per E-Mail einladen → Google-Konten via
OAuth verbinden → Websites hinterlegen → erster Datenabruf → erster Report.

## Echte Daten
Für Live-Daten nötig: Google-Ads-Developer-Token, OAuth-Client (Google Cloud
Projekt), Merchant-IDs. Solange diese fehlen, liefern **Demo-Daten-Adapter**
realistische Daten, damit das System sofort lauffähig ist. Wechsel auf echte
APIs ist reine Konfiguration (Adapter-Pattern).

## Baureihenfolge
1. Gerüst: Docker-Compose, FastAPI, DB, Auth (Rollen), Org/Client/User
2. Frontend-Grundgerüst: Login, Kundenliste, Onboarding
3. Ads-Modul (Demo-Adapter) → Snapshot → Dashboard
4. Merchant-Modul + SEO-Modul
5. PDF-Generator (flüchtiger Download)
6. Hintergrundjobs (geplante Aktualisierung)
7. Echte Google-API-Adapter + Verschlüsselung + Härtung
