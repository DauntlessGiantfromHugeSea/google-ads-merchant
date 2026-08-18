import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMsg, api } from "../api";
import { useToast } from "../toast";

// Kunden-Anleitung: zwei Gruppen, bewusst tiefer. Gespiegelt mit projectdoc.py.
const GROUPS: { title: string; fields: { id: string; label: string; hint: string; big?: boolean }[] }[] = [
  {
    title: "Anleitung für den Kunden",
    fields: [
      { id: "ueberblick", label: "Überblick", hint: "Was ist die Website, worum geht’s?", big: true },
      { id: "ziel", label: "Ziel & Zielgruppe", hint: "Wen soll die Seite erreichen, was ist das Ziel?" },
      { id: "struktur", label: "Aufbau & Seitenstruktur", hint: "Welche Seiten/Bereiche gibt es?", big: true },
      { id: "inhalte", label: "Inhalte selbst pflegen", hint: "Wie ändert man Texte/Bilder – konkret & ausführlich", big: true },
      { id: "aufgaben", label: "Häufige Aufgaben – Schritt für Schritt", hint: "z. B. Beitrag anlegen, Bild tauschen (mit **fett** & Aufzählungen)", big: true },
      { id: "medien", label: "Bilder & Medien", hint: "Formate, Größen, wo hochladen" },
      { id: "zugaenge", label: "Login & Zugänge", hint: "Wo einloggen (ohne Passwörter hier)" },
      { id: "dos", label: "Do’s & Don’ts", hint: "Worauf achten, was vermeiden", big: true },
      { id: "support", label: "Support & Ansprechpartner", hint: "Wie erreicht man euch, Reaktionszeiten" },
    ],
  },
  {
    title: "Technische Doku (Website)",
    fields: [
      { id: "setup", label: "Setup & Hosting", hint: "Wo läuft die Seite? Hoster, Server, Umgebung", big: true },
      { id: "domain", label: "Domain, E-Mail & DNS", hint: "Domain(s), Mail, wichtige DNS-Einträge" },
      { id: "cms", label: "CMS & Logins", hint: "Welches System, wo einloggen (Passwörter in den Zugangsdaten)" },
      { id: "stack", label: "Technik / Stack & Plugins", hint: "CMS/Framework, Theme, Plugins, Libraries", big: true },
      { id: "integrationen", label: "Integrationen & Schnittstellen", hint: "APIs, Tracking, Zahlung, Formulare/Webhooks, Newsletter", big: true },
      { id: "einstellungen", label: "Wichtige Einstellungen", hint: "Caching, SEO, Tracking, Cookie-Banner …" },
      { id: "deployment", label: "Deployment & Updates", hint: "Wie kommt eine Änderung live? Update-Prozess", big: true },
      { id: "sicherheit", label: "Sicherheit & Backups", hint: "Backups, Updates, SSL, Zugriffsschutz", big: true },
      { id: "monitoring", label: "Monitoring & Verfügbarkeit", hint: "Uptime/Fehler-Überwachung, wer wird alarmiert" },
      { id: "uebergabe", label: "Übergabe & Wartung", hint: "Was ist zu tun, Wartungsintervalle", big: true },
    ],
  },
  {
    title: "SEO-Doku (Website)",
    fields: [
      { id: "seo_keywords", label: "Keywords & Fokusthemen", hint: "Haupt-Keywords, Suchintention, Prioritäten", big: true },
      { id: "seo_onpage", label: "OnPage (Titel, Meta, Überschriften)", hint: "Title/Meta-Strategie, H1/H2, interne Links", big: true },
      { id: "seo_technik", label: "Technisches SEO", hint: "Sitemap, robots.txt, Canonicals, Ladezeit, Mobile" },
      { id: "seo_content", label: "Content & Seitenstruktur", hint: "Seitenstruktur, Content-Plan, Landingpages", big: true },
      { id: "seo_local", label: "Local SEO", hint: "Google Business Profil, NAP, Verzeichnisse" },
      { id: "seo_tracking", label: "Tracking & Tools", hint: "Search Console, Analytics, Rank-Tracking" },
      { id: "seo_backlinks", label: "Backlinks & Offpage", hint: "Linkaufbau, Erwähnungen, Partner" },
      { id: "seo_todos", label: "Maßnahmen & To-dos", hint: "geplante/erledigte SEO-Maßnahmen", big: true },
    ],
  },
  {
    title: "SEA-Doku (Google Ads)",
    fields: [
      { id: "sea_konten", label: "Konten & Zugänge", hint: "Google-Ads-Konto-ID, MCC, wo einloggen (Passwörter in Zugangsdaten)" },
      { id: "sea_ziele", label: "Ziele & Budget", hint: "Ziele, Gesamtbudget, Zeitraum" },
      { id: "sea_kampagnen", label: "Kampagnen", hint: "Mehrere: je Kampagne Typ, Budget, Ziel – z. B. **Suche Brand**, dann Aufzählung", big: true },
      { id: "sea_zielgruppen", label: "Zielgruppen & Keywords", hint: "Zielgruppen, Keywords, Ausschlüsse", big: true },
      { id: "sea_anzeigen", label: "Anzeigen & Assets", hint: "Anzeigentexte, Assets, Erweiterungen" },
      { id: "sea_gebote", label: "Gebotsstrategie", hint: "Smart Bidding, Ziel-CPA/ROAS …" },
      { id: "sea_tracking", label: "Conversion-Tracking", hint: "Conversions, Tag, Import aus Analytics" },
      { id: "sea_todos", label: "Maßnahmen & To-dos", hint: "geplante/erledigte SEA-Maßnahmen", big: true },
    ],
  },
];

// Interne Doku-Bereiche (aktivierbar). Anleitung ist immer an.
const INTERNAL = [
  { key: "technik", title: "Technische Doku (Website)", label: "Technische Doku", pdf: "technik" as const },
  { key: "seo", title: "SEO-Doku (Website)", label: "SEO-Doku", pdf: "seo" as const },
  { key: "sea", title: "SEA-Doku (Google Ads)", label: "SEA-Doku", pdf: "sea" as const },
];
const groupMeta = (title: string) => INTERNAL.find((m) => m.title === title);

// Absätze (Leerzeile), Aufzählungen (- / * / •) und **fett** -> React-Elemente.
function RichText({ text }: { text: string }) {
  const inline = (s: string, k: number) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong> : <span key={`${k}-${i}`}>{p}</span>);
  const blocks: React.ReactNode[] = [];
  let para: string[] = [], bul: string[] = [], key = 0;
  const flushP = () => { if (para.length) { const p = para; blocks.push(<p key={key++} style={{ margin: "0 0 8px" }}>{p.map((l, i) => <span key={i}>{i > 0 && <br />}{inline(l, i)}</span>)}</p>); para = []; } };
  const flushB = () => { if (bul.length) { const b = bul; blocks.push(<ul key={key++} style={{ margin: "4px 0 8px", paddingLeft: 18 }}>{b.map((x, i) => <li key={i}>{inline(x, i)}</li>)}</ul>); bul = []; } };
  (text || "").split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushB(); flushP(); return; }
    // Aufzählung nur bei „- "/„* " (Zeichen + Leerzeichen) oder „•", damit
    // eine mit **fett** beginnende Zeile nicht als Liste missverstanden wird.
    if (/^([-*]\s+|•\s*)/.test(line)) { flushP(); bul.push(line.replace(/^([-*]\s+|•\s*)/, "")); }
    else { flushB(); para.push(line); }
  });
  flushB(); flushP();
  return <>{blocks}</>;
}

// ---------- Kundenansicht (read-only Anleitung) ----------
function ClientAnleitung({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [sections, setSections] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { api.clientAnleitung(clientId).then((a) => { setSections(a.sections || {}); setLoaded(true); }).catch(() => setLoaded(true)); }, [clientId]);
  // Kunde sieht nur die Anleitung – die technische Doku bleibt intern.
  const clientGroups = GROUPS.filter((g) => g.title.startsWith("Anleitung"));
  const has = clientGroups.flatMap((g) => g.fields).some((f) => (sections[f.id] || "").trim());
  if (loaded && !has) return null;
  return (
    <>
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div><h2 style={{ marginBottom: 2 }}>Anleitung</h2>
            <div className="muted" style={{ fontSize: 13 }}>Bedienung deiner Website.</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => api.downloadProjectDocPdf(clientId, clientName, "anleitung")}>📄 Als PDF</button>
        </div>
      </div>
      {clientGroups.map((g) => {
        const fields = g.fields.filter((f) => (sections[f.id] || "").trim());
        if (!fields.length) return null;
        return (
          <div key={g.title} className="section">
            <h3 style={{ fontSize: 16, marginBottom: 10 }}>{g.title}</h3>
            {fields.map((f) => (
              <div key={f.id} style={{ marginBottom: 16 }}>
                <strong>{f.label}</strong>
                <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.6 }}><RichText text={sections[f.id]} /></div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function ProjectDoc({ clientId, clientName, isAgency }: { clientId: string; clientName: string; isAgency: boolean }) {
  const toast = useToast();
  const [sections, setSections] = useState<Record<string, string>>({});
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [status, setStatus] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [msg, setMsg] = useState("");
  const ref = useRef({ sections, status });
  ref.current = { sections, status };

  useEffect(() => {
    if (!isAgency) return;
    api.getProjectDoc(clientId).then((d) => {
      setSections(d.sections || {}); setChat(d.log || []); setStatus(d.status || "");
    }).catch(() => {});
  }, [clientId]);

  if (!isAgency) return <ClientAnleitung clientId={clientId} clientName={clientName} />;

  const persist = async () => {
    setSaveState("saving");
    try { await api.saveProjectDoc(clientId, ref.current); setSaveState("saved"); }
    catch (e) { toast((e as Error).message, "err"); setSaveState("dirty"); }
  };
  const touch = () => setSaveState("dirty");
  useEffect(() => { if (saveState !== "dirty") return; const t = setTimeout(persist, 1500); return () => clearTimeout(t); }, [saveState, sections, status]);

  const updSec = (id: string, v: string) => { setSections((s) => ({ ...s, [id]: v })); touch(); };
  // Aktivierte interne Doku-Bereiche (in den Sektionen gespeichert, teamweit).
  const active = (sections["__active__"] || "").split(",").filter(Boolean);
  const toggleDoc = (key: string) =>
    updSec("__active__", (active.includes(key) ? active.filter((k) => k !== key) : [...active, key]).join(","));
  const send = async () => {
    if (!msg.trim()) return;
    try { const d = await api.addProjectDocChat(clientId, msg); setChat(d.log || []); setMsg(""); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const delMsg = async (id: string) => { try { const d = await api.delProjectDocChat(clientId, id); setChat(d.log || []); } catch { /* ignore */ } };
  const anleitungFields = GROUPS[0].fields;
  const filled = useMemo(() => anleitungFields.filter((f) => (sections[f.id] || "").trim()).length, [sections]);
  const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const sorted = [...chat].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  const saveLabel = saveState === "saving" ? "Speichert…" : saveState === "saved" ? "✓ Gespeichert" : saveState === "dirty" ? "…" : "";

  return (
    <>
      {/* 1 · Interner Verlauf (Chat) */}
      <div className="section" style={{ borderLeft: "3px solid var(--coral)" }}>
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div><h2 style={{ margin: 0 }}>Interner Verlauf</h2>
            <div className="muted" style={{ fontSize: 13 }}>Team-Chat zum Arbeitsstand – Kunde sieht das nicht.</div></div>
          <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
            <input className="input form-light" style={{ maxWidth: 200 }} value={status}
              onChange={(e) => { setStatus(e.target.value); touch(); }} placeholder="Phase/Status, z. B. In Umsetzung" />
            <button className="btn btn-ghost btn-sm" onClick={() => api.downloadProjectDocPdf(clientId, clientName, "verlauf")}>📄 Verlauf</button>
          </div>
        </div>
        <div className="chat-log">
          {sorted.length === 0 ? <div className="empty sm">Noch keine Einträge. Schreib den ersten Stand rein.</div>
            : sorted.map((m) => (
              <div key={m.id} className="chat-msg">
                <div className="chat-head"><strong>{m.author}</strong><span className="muted">{when(m.created_at)}</span>
                  <button className="chat-del" title="löschen" onClick={() => delMsg(m.id)}>×</button></div>
                <div className="chat-body">{m.text}</div>
              </div>
            ))}
        </div>
        <div className="row-inline" style={{ gap: 8, marginTop: 10 }}>
          <input className="input form-light" style={{ flex: 1 }} placeholder="Nachricht schreiben…"
            value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className="btn btn-primary" onClick={send}>Senden</button>
        </div>
      </div>

      {/* 2 · Kunden-Anleitung */}
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div><h2 style={{ marginBottom: 2 }}>Anleitung für den Kunden</h2>
            <div className="muted" style={{ fontSize: 13 }}>Bekommt der Kunde am Ende – im Portal &amp; als PDF. {filled}/{anleitungFields.length} Felder · {saveLabel}</div></div>
          <div className="row-inline" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={persist}>Speichern</button>
            <button className="btn btn-ghost btn-sm" onClick={() => api.downloadProjectDocPdf(clientId, clientName, "doc")}>📄 Anleitung-PDF</button>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Tipp: Leerzeile = neuer Absatz · Zeilen mit „- " werden zu Aufzählungen · <strong>**Text**</strong> wird fett. So wird’s auch im PDF &amp; Kundenportal dargestellt.
        </div>
      </div>

      {/* 3 · Doku-Bereiche aktivieren – nur was der Kunde braucht */}
      <div className="section">
        <h3 style={{ fontSize: 16, margin: "0 0 4px" }}>Weitere Doku-Bereiche</h3>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Nicht jeder Kunde braucht alles – aktiviere pro Kunde die passenden Dokus (jede mit eigenem PDF, intern).
        </div>
        <div className="ki-chips">
          {INTERNAL.map((m) => (
            <button key={m.key} type="button" className={`chip ${active.includes(m.key) ? "on" : ""}`} onClick={() => toggleDoc(m.key)}>
              {active.includes(m.key) ? "✓ " : "+ "}{m.label}
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map((g) => {
        const meta = groupMeta(g.title);
        if (meta && !active.includes(meta.key)) return null;   // interner Bereich nicht aktiviert
        const isInternal = !!meta;
        const pdfKind = meta?.pdf ?? "technik";
        const pdfLabel = `${meta?.label ?? "Technische Doku"}-PDF`;
        return (
          <div key={g.title} className="section">
            <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>{g.title}</h3>
              {isInternal && <button className="btn btn-ghost btn-sm" onClick={() => api.downloadProjectDocPdf(clientId, clientName, pdfKind)}>📄 {pdfLabel}</button>}
            </div>
            {isInternal && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Intern – der Kunde sieht diese Doku nicht. Das PDF bekommt ein Deckblatt (Projekt + Beschreibung).</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
              {isInternal && (
                <div className="field">
                  <label>Projektbeschreibung <span className="muted" style={{ fontWeight: 400 }}>· fürs Deckblatt, 1–2 Sätze</span></label>
                  <textarea className="input form-light" rows={2} style={{ lineHeight: 1.6 }}
                    value={sections["beschreibung"] || ""} onChange={(e) => updSec("beschreibung", e.target.value)} />
                </div>
              )}
              {g.fields.map((f) => (
                <div key={f.id} className="field">
                  <label>{f.label}<span className="muted" style={{ fontWeight: 400 }}> · {f.hint}</span></label>
                  <textarea className="input form-light" rows={f.big ? 6 : 4} style={{ lineHeight: 1.6 }}
                    value={sections[f.id] || ""} onChange={(e) => updSec(f.id, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
