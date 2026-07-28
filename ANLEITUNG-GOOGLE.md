# Anleitung: Google-API pro Kunde verbinden

Die Zugangsdaten werden **pro Kunde manuell** im Tool hinterlegt
(Kunde → Verknüpfte Konten → „Google-API verbinden"). Sie werden
**verschlüsselt** gespeichert und nie wieder angezeigt. Ohne Zugangsdaten
laufen Reports mit realistischen **Demo-Daten**.

Diese Anleitung steht auch direkt in der App (Button „Anleitung" am Konto).

---

## A) Google Ads verbinden

Du brauchst: **Developer-Token**, **OAuth Client-ID + Secret**,
**Refresh-Token** und die **Customer-ID** des Kunden (10-stellig).

1. **Developer-Token**
   Im Google-Ads-Konto: *Tools → API-Center* → Developer-Token beantragen.
   (Für den Zugriff auf eigene/verwaltete Konten genügt „Basic Access".)
2. **OAuth-Client (Google Cloud Console)**
   - Projekt anlegen, *APIs & Dienste → OAuth-Zustimmungsbildschirm* konfigurieren.
   - *Anmeldedaten → OAuth-Client-ID erstellen* (Typ „Desktop") →
     **Client-ID** und **Client-Secret** notieren.
3. **Refresh-Token erzeugen** (Scope `https://www.googleapis.com/auth/adwords`)
   - Bequem über den [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):
     eigenes OAuth-Client-Secret eintragen, Scope `adwords` autorisieren,
     „Exchange authorization code" → **Refresh-Token** kopieren.
4. **Customer-ID**: 10-stellige Nummer oben rechts im Ads-Konto.
   Bei MCC zusätzlich die **Login-Customer-ID** (MCC-Nummer) eintragen.

Felder im Tool: Developer-Token, Login-Customer-ID (optional),
Client-ID, Client-Secret, Refresh-Token.
Doku: https://developers.google.com/google-ads/api/docs/get-started/introduction

---

## B) Merchant Center verbinden — per Service-Account (einfach)

Kein OAuth-Playground, kein Refresh-Token, kein Ablauf. Du brauchst nur die
**Service-Account-JSON** und die **Händler-ID**.

1. **Content API for Shopping** in der Google Cloud Console aktivieren.
2. Cloud Console → **IAM & Verwaltung → Dienstkonten → Dienstkonto erstellen**
   (kein Rolle/keine Berechtigung nötig) → Erstellen/Fertig.
3. Beim Dienstkonto → Reiter **Schlüssel → Schlüssel hinzufügen → JSON** →
   Datei wird heruntergeladen.
4. Im **Merchant Center → Einstellungen → Nutzer / Kontozugriff**: die
   **Dienstkonto-E-Mail** (Feld `client_email` aus der JSON) als Nutzer mit
   Zugriff (Standard/Admin) hinzufügen.
5. **Händler-ID**: oben rechts im Merchant Center (= external_id des Kontos).

Feld im Tool: kompletten **Service-Account-JSON-Inhalt** einfügen + Händler-ID.
Doku: https://developers.google.com/shopping-content/guides/how-tos/service-accounts

*(Alternativ geht weiterhin OAuth mit Client-ID/Secret/Refresh-Token wie bei Ads.)*

---

## C) SEO

Keine Zugangsdaten nötig – es genügt die Website-URL beim Konto „Website".
Optional kann serverseitig ein `PAGESPEED_API_KEY` gesetzt werden, um
technische Ladezeit-Werte einzubeziehen.

---

### Was passiert nach dem Verbinden?
Beim nächsten Report-Lauf zieht das Tool die echten Daten über die API.
Schlägt ein Live-Abruf fehl (z.B. falscher Token), wird automatisch auf
Demo-Daten zurückgefallen und der Fehler im Report-Datensatz vermerkt –
es bricht also nie ab.
