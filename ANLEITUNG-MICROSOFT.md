# Anleitung: E-Mail über Microsoft 365 verbinden

Damit das Tool E-Mails über dein Microsoft-Postfach senden kann, brauchst du
**einmalig** eine Azure-App-Registrierung (kostenlos). Danach klickst du im
Tool nur noch „Mit Microsoft anmelden".

## 1. Azure-App registrieren
1. https://entra.microsoft.com → **Identität → Anwendungen → App-Registrierungen → Neue Registrierung**.
2. Name z. B. `North Flow Mail`. Kontotypen: „Nur dieses Verzeichnis" (oder
   „Beliebige Organisation", je nach Bedarf).
3. **Weiterleitungs-URI** (Typ **Web**) eintragen:
   ```
   https://north-flow.de/api/mail/callback
   ```
4. Registrieren. Die **Anwendungs-(Client-)ID** notieren.

## 2. Client-Secret erstellen
1. In der App → **Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel**.
2. Wert (Secret) **sofort kopieren** (wird nur einmal angezeigt).

## 3. Berechtigungen
1. **API-Berechtigungen → Microsoft Graph → Delegierte Berechtigungen**:
   `Mail.Send`, `User.Read`, `offline_access` hinzufügen.
2. Optional „Administratorzustimmung erteilen".

## 4. Ins Tool eintragen (Server)
In `.env.prod` setzen und Backend neu starten:
```
PUBLIC_BASE_URL=https://north-flow.de
MICROSOFT_CLIENT_ID=<Client-ID>
MICROSOFT_CLIENT_SECRET=<Secret>
MICROSOFT_TENANT=common   # oder deine Tenant-ID
```

## 5. Verbinden
Im Tool: **Einstellungen → E-Mail (Microsoft 365) → „Mit Microsoft anmelden"**
→ anmelden, zustimmen. Danach kannst du beim Kunden unter **Kontakt** direkt
E-Mails senden.

> Hinweis: `MICROSOFT_TENANT=common` erlaubt Anmeldung mit beliebigem
> Microsoft-Konto; für ein festes Firmen-Tenant die Tenant-ID eintragen.
