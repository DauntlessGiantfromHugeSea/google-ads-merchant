import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Item = { q: string; a: string; steps?: string[] };
type Cat = { id: string; title: string; icon: string; items: Item[] };

const CATS: Cat[] = [
  {
    id: "start", title: "Erste Schritte", icon: "🚀",
    items: [
      { q: "So richtest du North Flow ein", a: "In dieser Reihenfolge bist du in wenigen Minuten startklar:",
        steps: [
          "Einstellungen → Branding: Logo hochladen (erscheint im Login, in E-Mails und auf PDFs).",
          "Einstellungen → Agentur-Kontakt: Kontaktdaten, Zeitzone (Standard Berlin) und Standard-Terminlink setzen.",
          "Einstellungen → E-Mail: Microsoft-365-Postfach verbinden, damit Mails & Benachrichtigungen rausgehen.",
          "Einstellungen → Team: Mitarbeiter oder weitere Admins einladen.",
          "Ersten Kunden anlegen (Dashboard → „+ Neuer Kunde“) und loslegen.",
        ] },
      { q: "Konto absichern (2FA)", a: "Aktiviere unter „Mein Konto & 2FA“ die Zwei-Faktor-Authentifizierung per Authenticator-App. Für Kunden wird 2FA automatisch angeboten. Passwörter brauchen mind. 8 Zeichen mit Buchstaben und Zahlen." },
    ],
  },
  {
    id: "cockpit", title: "Dashboard & CRM", icon: "📊",
    items: [
      { q: "Cockpit (Startseite)", a: "Zeigt offene Pipeline, aktive Kunden, Leads, heute fällige Aufgaben und Termine, dazu Widgets für deine Aufgaben, anstehende Termine, fällige Follow-ups, den Pipeline-Snapshot und bald auslaufende Verträge." },
      { q: "CRM / Sales-Pipeline", a: "Kanban-Board (Lead → Kontaktiert → Angebot → Gewonnen/Verloren) per Drag & Drop. Je Kunde Deal-Wert und nächstes Follow-up (überfällig rot). Oben: offene Pipeline, gewichteter Forecast und Gewonnen-Summe. Angebote heben die Phase automatisch an." },
      { q: "Sales / Gap-Analyse", a: "Geführtes Verkaufsgespräch: Ist/Soll je Bereich (Website, SEO, Ads, Local) mit Ampel, automatische Handlungsempfehlung und passende Paketvorschläge – mit einem Klick daraus ein Angebot erstellen." },
    ],
  },
  {
    id: "onboarding", title: "Onboarding & Doku", icon: "📋",
    items: [
      { q: "Onboarding je Kunde", a: "Interner Arbeitsplatz für den Projektstart mit Meeting-Checkliste (abhaken + Notizen, autospeichernd), Ist-Analyse und Anforderungen. „Abschließen“ setzt den Onboarding-Status des Kunden.",
        steps: [
          "Kundenprofil → Tab „Onboarding“.",
          "Im Meeting die Checkliste durchgehen, Punkte abhaken und Notizen eintragen (speichert automatisch).",
          "Ist-Analyse und Anforderungen in die Felder füllen.",
          "Am Ende „✓ Onboarding abschließen“.",
        ] },
      { q: "Projekt-Dokumentation", a: "Tab „Doku“: feste Boxen (Übersicht, Ziele, Umfang, Technik, Vorgehen, Entscheidungen, Übergabe), ein hervorgehobener aktueller Arbeitsstand und das Protokoll „Was wurde gemacht“. Zwei PDF-Buttons: Doku-PDF und Arbeitsnachweis." },
    ],
  },
  {
    id: "zeit", title: "Zeiterfassung & Abrechnung", icon: "⏱️",
    items: [
      { q: "Stoppuhr", a: "Im Bereich „Zeit“ (Topbar): Beschreibung eintippen, optional Kunde und Projekt wählen, Start. Die laufende Uhr übersteht einen Reload. Pro Person läuft nur eine Uhr – ein neuer Start beendet die vorherige." },
      { q: "Nachtragen & bearbeiten", a: "„＋ Zeit nachtragen“ für Datum + Minuten. Jeder Eintrag ist voll bearbeitbar (Datum verschieben, Minuten, Kunde, Projekt, Beschreibung). Minuten am besten in 15er-Schritten." },
      { q: "Abrechnung im 15-Minuten-Takt", a: "Ansicht „Abrechnung“: Zeiten je Kunde/Projekt, jeder Eintrag auf volle 15 Minuten aufgerundet. Stundensatz je Kunde (und optional je Projekt, überschreibt den Kundensatz) direkt in der Tabelle eintragen – die Beträge rechnen sich live." },
      { q: "Im Kundenprofil & CSV", a: "Im Kundenprofil unter „Angebote & Vertrag → Zeiten & Abrechnung“ siehst du alle Zeiten dieses Kunden (ganzes Team). Mit „⬇ CSV“ exportierst du die Monatszeiten für deine Rechnungssoftware (Excel-freundlich, Semikolon/Komma)." },
    ],
  },
  {
    id: "reporting", title: "Reporting, SEO & Analytics", icon: "📈",
    items: [
      { q: "Reports (PDF)", a: "Google Ads, Merchant Center & SEO als PDF auf deinem Briefpapier – Zeitstempel in deiner Zeitzone. Reports werden nur flüchtig erzeugt, nicht gespeichert." },
      { q: "SEO-Check & PageSpeed", a: "Deterministischer Check (Score, Kategorien, Action-Plan) plus PageSpeed/Core-Web-Vitals. Mehrere Websites je Kunde möglich (Reporting → Verknüpfte Konten). Kunden sehen ihren Check und können selbst neu messen." },
      { q: "Analytics (native KPIs)", a: "Nutzer/Sitzungen, Conversions, Umsatz und Traffic-Quellen aus einem veröffentlichten Google-Sheet (CSV) – nativ als Karten & Trends, kein iframe.",
        steps: [
          "Google-Sheet mit den GA4-Zahlen bauen (erste Spalte = Monat, dann Kennzahl-Spalten).",
          "Sheet „Im Web veröffentlichen“ als CSV.",
          "Kundenprofil → Reporting → Analytics → „Quelle“ → Link eintragen. North Flow zieht die Zahlen automatisch.",
        ] },
      { q: "Live-Dashboard (Embed)", a: "Optional: einen Looker-Studio-Report einbetten (Reporting → Live-Auswertung). Hinweis: eingebettete Google-Berichte verlangen im Browser Drittanbieter-Cookies – die native KPI-Ansicht umgeht das." },
      { q: "Website-Monitoring", a: "Uptime Kuma per Webhook (Einstellungen). Monitore dem Kunden zuordnen, Status & Verlauf sichtbar, Monitoring-Report als PDF." },
    ],
  },
  {
    id: "geld", title: "Angebote, Verträge & Rechnungen", icon: "💶",
    items: [
      { q: "Angebote", a: "Positions-Builder (Menge × Preis), PDF auf Briefpapier, per Mail senden, online ansehen & annehmen. Annahme setzt den Kunden auf „gewonnen“." },
      { q: "Verträge mit Signatur", a: "Verträge erstellen, Leistungen wählen, digital unterschreiben (auch am Handy, Vollbild). Beide Parteien laden den unterschriebenen Vertrag als PDF. Erinnerung X Tage vor Vertragsende automatisch." },
      { q: "Rechnungen (Register)", a: "Extern erstellte Rechnungen (PDF/XRechnung) reinladen; bei E-Rechnungen werden Nummer/Betrag/Fälligkeit automatisch ausgelesen. Status offen/bezahlt/überfällig, Summen, Zahlungserinnerung per Mail. Bereich „Rechnungen“ (Topbar)." },
    ],
  },
  {
    id: "termine", title: "Termine & Kommunikation", icon: "📅",
    items: [
      { q: "Termine buchen", a: "Termin für einen Kunden anlegen (mit Link), Mitarbeiter als Empfänger wählen. Kunde, Mitarbeiter und Admin werden benachrichtigt; Termin erscheint im Kalender und in der Kunden-Timeline. Protokolle direkt am Termin schreiben." },
      { q: "E-Mail an Kunden", a: "Direkt aus dem Tool mailen (gebrandet), mit persönlichem Text und temporären Anhängen – die Anhänge werden mitgeschickt, aber nicht auf dem Server gespeichert." },
      { q: "Dateien anfordern", a: "Unter „Dateien“ (Topbar) eine Anforderung anlegen und den öffentlichen Link teilen. Über den Link kann jeder ohne Login hochladen (bis 10 GB). Du bekommst sofort eine E-Mail. Dateien werden nach 7 Tagen automatisch gelöscht (oder wenn du sie löschst)." },
      { q: "Benachrichtigungen", a: "Automatische Mitteilung (in-App + E-Mail über dein Microsoft-Konto) bei wichtigen Ereignissen: Vertrag unterschrieben, Angebot angenommen, neue Aufgabe/Anfrage/Termin. Ein-/ausschaltbar in den Einstellungen." },
    ],
  },
  {
    id: "sicher", title: "Zugangsdaten, Backup & Sicherheit", icon: "🔐",
    items: [
      { q: "Interner Zugangsdaten-Tresor", a: "Kundenprofil → „Kontakt & Verlauf → Interne Zugangsdaten“ (nur Team): Logins mit Benutzer/Passwort/Notiz, verschlüsselt gespeichert. Passwort auf Klick anzeigen/kopieren. Kunden sehen das nie." },
      { q: "Datensicherung", a: "Nächtliche DB-Backups mit Rotation (Server-Ordner). Auf die Synology per Hyper-Backup/rsync oder Push über Tailscale. Admin-Download unter „Einstellungen → Datensicherung“ (nur über Tailscale)." },
      { q: "Kunden-Zugang & Rechte", a: "Kunden per E-Mail einladen (setzen ihr Passwort selbst) oder Link teilen. Kunden sehen nur ihre Reports/Freigaben – keine internen Bereiche (Onboarding, Doku, Zugangsdaten, Zeiten). Reporting-Bausteine erscheinen beim Kunden erst, wenn du sie eingerichtet hast." },
      { q: "Sicherheit", a: "Selbst-Registrierung ist nach dem Erst-Setup gesperrt. 2FA für alle, sichere Passwörter erzwungen, sensible Funktionen optional nur über Tailscale." },
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState("start");

  const results = useMemo(() => {
    if (!q.trim()) return null;
    const t = q.toLowerCase();
    const out: { cat: Cat; item: Item }[] = [];
    CATS.forEach((c) => c.items.forEach((it) => {
      if ((it.q + " " + it.a + " " + (it.steps || []).join(" ")).toLowerCase().includes(t)) out.push({ cat: c, item: it });
    }));
    return out;
  }, [q]);

  const current = CATS.find((c) => c.id === active) || CATS[0];

  const Card = ({ item, tag }: { item: Item; tag?: string }) => (
    <div className="help-card">
      <h3>{item.q}{tag && <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>{tag}</span>}</h3>
      <p>{item.a}</p>
      {item.steps && <ol className="help-steps">{item.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
    </div>
  );

  return (
    <>
      <div className="hero">
        <h1>Hilfe & Dokumentation</h1>
        <div className="sub">Alles, was North Flow kann – nach Bereichen, mit Anleitungen.</div>
        <input className="input" style={{ marginTop: 16, maxWidth: 460, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}
          placeholder="🔎 Hilfe durchsuchen…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {results ? (
        <div className="section">
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{results.length} Treffer für „{q}“</div>
          {results.length === 0 ? <div className="empty">Nichts gefunden. Formuliere es anders oder stöbere in den Kategorien.</div>
            : results.map(({ cat, item }, i) => <Card key={i} item={item} tag={cat.title} />)}
        </div>
      ) : (
        <div className="client-layout">
          <nav className="client-nav">
            {CATS.map((c) => (
              <button key={c.id} className={`nav-item ${active === c.id ? "active" : ""}`} onClick={() => setActive(c.id)}>
                {c.icon} {c.title}
              </button>
            ))}
          </nav>
          <div className="client-content">
            <div className="section"><h2 style={{ margin: 0 }}>{current.icon} {current.title}</h2></div>
            {current.items.map((it, i) => <Card key={i} item={it} />)}
          </div>
        </div>
      )}

      <div className="section" style={{ textAlign: "center" }}>
        <div className="muted" style={{ fontSize: 13 }}>Noch Fragen? Schreib deiner Ansprechperson.</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => navigate("/")}>← Zurück zum Dashboard</button>
      </div>
    </>
  );
}
