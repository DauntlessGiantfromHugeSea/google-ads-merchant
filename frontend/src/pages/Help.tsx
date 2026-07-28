const SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: "Kunden",
    items: [
      ["Kunden & Leads", "Kunden anlegen, Status (Lead/Aktiv/Pausiert/Beendet) und Tags setzen, suchen und filtern. Archivieren blendet aus (reversibel), Löschen (Admin) entfernt alles endgültig."],
      ["Kunden-Login & Einladung", "Unter „Kontakt & Verlauf → Kunden-Zugang“ per E-Mail einladen – der Kunde legt sein Passwort selbst fest. Ohne Microsoft-Verbindung teilst du den angezeigten Link."],
      ["Als Kunde ansehen", "Oben im Kundenprofil: 1 Klick in die Kundenansicht (nur lesen), Banner zum Zurückwechseln."],
    ],
  },
  {
    title: "Projekte & Aufgaben",
    items: [
      ["Launch-Roadmap", "Meilensteine (geplant → in Arbeit → fertig) als Timeline – auch für den Kunden sichtbar."],
      ["Projekte (Kanban)", "Projekte per Drag & Drop zwischen Spalten ziehen; Typen (Design/Marketing/Web/SEO/Social). Globales Board unter „Projekte“ (Topbar)."],
      ["Freigaben", "Freigabe anfragen (z. B. Staging-Link); der Kunde gibt frei oder fordert Änderungen an."],
      ["To-Dos", "Aufgaben mit Priorität & Zuständigkeit. Globale Ansicht unter „Aufgaben“ mit Fälligkeits-Ampel."],
    ],
  },
  {
    title: "Reporting & Monitoring",
    items: [
      ["Reports", "Google Ads, Merchant Center & SEO als PDF auf deinem Briefpapier. SEO crawlt live (Sitemap + Unterseiten, „wo fehlt was“)."],
      ["Google-Ads-Aktivitäten", "Maßnahmen/Änderungen protokollieren – erscheinen im Report als „Durchgeführte Maßnahmen“."],
      ["Website-Monitoring", "Uptime Kuma per Webhook (Einstellungen). Monitore per Checkbox dem Kunden zuordnen (mehrere möglich), Status & Verlauf sichtbar."],
    ],
  },
  {
    title: "Angebote & Vertrag",
    items: [
      ["Leistungen & Pakete", "Katalog mit Einheit & Stundensatz (Einstellungen) – als Vorlage für Angebotspositionen."],
      ["Angebote", "Positions-Builder (Menge × Preis), PDF auf Briefpapier, per Mail senden (mit Anhang), online ansehen & annehmen. Annahme setzt Lead → aktiv."],
      ["Vertragsdaten & Rechnungsdaten", "Paket, Laufzeit, Gebühr sowie Firma/USt-IdNr/Rechnungsadresse. Dokumente/Rechnungen hochladen und per Mail an den Kunden senden."],
    ],
  },
  {
    title: "Kommunikation & Formulare",
    items: [
      ["Verlauf & Nachrichten", "Gemeinsamer Kanal: du postest Updates, der Kunde kann antworten."],
      ["E-Mail (Microsoft 365)", "Postfach verbinden (Einstellungen) und Mails direkt aus dem Tool senden – gebrandetes Design, Vorschau & Testmail."],
      ["Kundendaten-Formulare", "Öffentlicher Link, über den (potenzielle) Kunden ihre Rechnungs-/Stammdaten selbst eintragen – per Klick als Kunde übernehmen."],
      ["Passwort-Safe", "Ende-zu-Ende verschlüsselt senden (Burn-after-Read) oder per Link anfordern."],
    ],
  },
  {
    title: "Einstellungen & Team",
    items: [
      ["Team", "Mitarbeiter oder weitere Admins einladen; Rollen ändern."],
      ["Branding", "Logo hochladen (Login, Favicon, E-Mails, PDFs)."],
      ["Sicherheit", "Selbst-Registrierung ist nach dem Erst-Setup gesperrt – Zugänge nur per Einladung. Rechnungsversand optional nur über Tailscale."],
    ],
  },
];

export default function Help() {
  return (
    <>
      <div className="hero">
        <h1>Hilfe & Funktionen</h1>
        <div className="sub">Kurzüberblick über alle Bereiche des Tools.</div>
      </div>
      {SECTIONS.map((s) => (
        <div key={s.title} className="section">
          <h2>{s.title}</h2>
          <dl className="kv" style={{ gridTemplateColumns: "220px 1fr" }}>
            {s.items.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}
