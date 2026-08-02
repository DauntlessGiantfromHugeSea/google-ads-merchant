import { useEffect, useMemo, useRef, useState } from "react";
import { ChecklistEntry, api } from "../api";
import { useToast } from "../toast";

// Geführte Onboarding-Struktur: zwei Blöcke, je mehrere Felder.
type Field = { id: string; label: string; hint?: string; big?: boolean };
type Block = { key: string; title: string; intro: string; fields: Field[] };

const BLOCKS: Block[] = [
  {
    key: "ist", title: "Ist-Analyse (Status quo)",
    intro: "Wo steht der Kunde heute? Ausgangslage sauber aufnehmen.",
    fields: [
      { id: "ist_unternehmen", label: "Unternehmen & Angebot", hint: "Was macht der Kunde, was verkauft er?", big: true },
      { id: "ist_zielgruppe", label: "Zielgruppe / Wunschkunde", hint: "Wen will er erreichen?" },
      { id: "ist_website", label: "Aktuelle Website", hint: "URL + Zustand (Technik, Design, Alter)" },
      { id: "ist_kanaele", label: "Aktuelle Kanäle", hint: "SEO, Google Ads, Social, Newsletter … was läuft?" },
      { id: "ist_probleme", label: "Was fehlt / Probleme", hint: "Was funktioniert nicht, was nervt?", big: true },
      { id: "ist_wettbewerb", label: "Wettbewerb / Vorbilder", hint: "Mitbewerber, Seiten die gefallen" },
      { id: "ist_assets", label: "Vorhandene Assets", hint: "Logo, Texte, Bilder, CI, Zugänge vorhanden?" },
    ],
  },
  {
    key: "anf", title: "Anforderungen ans Projekt",
    intro: "Was soll erreicht werden und was gehört dazu?",
    fields: [
      { id: "anf_ziel", label: "Projektziel", hint: "Das eine Hauptziel", big: true },
      { id: "anf_scope", label: "Umfang / Leistungen", hint: "Was wird gemacht (Scope)?", big: true },
      { id: "anf_musts", label: "Must-haves / No-gos", hint: "Unbedingt nötig / auf keinen Fall" },
      { id: "anf_botschaft", label: "Botschaft & Tonalität", hint: "Wie soll der Auftritt wirken?" },
      { id: "anf_kpis", label: "Erfolgskriterien / KPIs", hint: "Woran messen wir Erfolg?" },
      { id: "anf_timeline", label: "Timeline / Deadline", hint: "Wichtige Termine, Go-live" },
      { id: "anf_budget", label: "Budget", hint: "Rahmen / Paket" },
      { id: "anf_verantwortung", label: "Verantwortlichkeiten", hint: "Ansprechpartner auf beiden Seiten" },
      { id: "anf_zugaenge", label: "Benötigte Zugänge/Assets", hint: "Domain, Hosting, Google, Social-Logins, Material", big: true },
    ],
  },
];
const ALL_FIELDS = BLOCKS.flatMap((b) => b.fields);
const STATUS = [
  { key: "offen", label: "Offen" },
  { key: "in_arbeit", label: "In Arbeit" },
  { key: "fertig", label: "Fertig" },
];

// Standard-Agenda für das Kickoff-Meeting (wird geladen, wenn noch leer).
const DEFAULT_CHECKLIST: { group: string; text: string }[] = [
  { group: "Kickoff", text: "Vorstellung & gegenseitige Erwartungen geklärt" },
  { group: "Kickoff", text: "Projektziel gemeinsam definiert" },
  { group: "Kickoff", text: "Zielgruppe / Wunschkunde besprochen" },
  { group: "Ist-Aufnahme", text: "Aktuelle Website & Kanäle gemeinsam angeschaut" },
  { group: "Ist-Aufnahme", text: "Probleme / Pain Points notiert" },
  { group: "Ist-Aufnahme", text: "Wettbewerb & Vorbilder besprochen" },
  { group: "Technik & Zugänge", text: "Domain & Hosting geklärt" },
  { group: "Technik & Zugänge", text: "Google-Zugänge angefragt (Analytics / Ads / Business)" },
  { group: "Technik & Zugänge", text: "Social-Media-Logins & CMS-Zugang" },
  { group: "Inhalte & Design", text: "Logo / CI vorhanden? Dateien angefordert" },
  { group: "Inhalte & Design", text: "Quelle für Texte & Bilder geklärt" },
  { group: "Ziele & Rahmen", text: "KPIs / Erfolgskriterien vereinbart" },
  { group: "Ziele & Rahmen", text: "Budget bestätigt" },
  { group: "Ziele & Rahmen", text: "Timeline & Deadlines abgestimmt" },
  { group: "Ziele & Rahmen", text: "Ansprechpartner beidseitig benannt" },
  { group: "Abschluss", text: "Nächste Schritte vereinbart" },
  { group: "Abschluss", text: "Folgetermin festgelegt" },
];

let _idc = 0;
const newId = () => `c${Date.now().toString(36)}${(_idc++).toString(36)}`;
const seedChecklist = (): ChecklistEntry[] =>
  DEFAULT_CHECKLIST.map((c) => ({ id: newId(), text: c.text, done: false, note: "", group: c.group }));

export default function Onboarding({ clientId, onStatus }:
  { clientId: string; onStatus?: (done: boolean) => void }) {
  const toast = useToast();
  const [data, setData] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<ChecklistEntry[]>([]);
  const [status, setStatus] = useState("offen");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  // aktuelle Werte für den Autosave-Timer, ohne Neuaufbau des Effekts
  const ref = useRef({ data, checklist, status });
  ref.current = { data, checklist, status };

  useEffect(() => {
    api.getOnboarding(clientId).then((o) => {
      setData(o.data || {});
      setChecklist(o.checklist?.length ? o.checklist : seedChecklist());
      setStatus(o.status || "offen");
      setLoaded(true);
    }).catch(() => { setChecklist(seedChecklist()); setLoaded(true); });
  }, [clientId]);

  const persist = async (nextStatus?: string) => {
    const st = nextStatus ?? ref.current.status;
    setSaveState("saving");
    try {
      await api.saveOnboarding(clientId, { data: ref.current.data, checklist: ref.current.checklist, status: st });
      if (nextStatus) setStatus(nextStatus);
      onStatus?.(st === "fertig");
      setSaveState("saved");
    } catch (e) { toast((e as Error).message, "err"); setSaveState("dirty"); }
  };

  // Autosave: 1,5 s nach der letzten Änderung.
  const touch = () => setSaveState("dirty");
  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(() => { persist(); }, 1500);
    return () => clearTimeout(t);
  }, [saveState, data, checklist]);

  const filled = useMemo(() => ALL_FIELDS.filter((f) => (data[f.id] || "").trim()).length, [data]);
  const done = checklist.filter((c) => c.done).length;
  const groups = useMemo(() => {
    const g: Record<string, ChecklistEntry[]> = {};
    checklist.forEach((c) => (g[c.group || "Weitere"] ||= []).push(c));
    return g;
  }, [checklist]);

  const updField = (id: string, v: string) => { setData((d) => ({ ...d, [id]: v })); touch(); };
  const updItem = (id: string, patch: Partial<ChecklistEntry>) => {
    setChecklist((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))); touch();
  };
  const addItem = (group: string) => {
    setChecklist((cs) => [...cs, { id: newId(), text: "", done: false, note: "", group }]); touch();
  };
  const delItem = (id: string) => { setChecklist((cs) => cs.filter((c) => c.id !== id)); touch(); };
  const resetChecklist = () => {
    if (!confirm("Checkliste auf die Standard-Agenda zurücksetzen? Notizen gehen verloren.")) return;
    setChecklist(seedChecklist()); touch();
  };

  if (!loaded) return <div className="section"><div className="muted">lädt…</div></div>;

  const saveLabel = saveState === "saving" ? "Speichert…" : saveState === "saved" ? "✓ Gespeichert"
    : saveState === "dirty" ? "Nicht gespeichert" : "Gespeichert";

  return (
    <>
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Onboarding</h2>
            <div className="muted" style={{ fontSize: 13 }}>Meeting-Checkliste, Ist-Analyse &amp; Anforderungen.</div>
          </div>
          <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>{saveLabel}</span>
            <select className="select form-light" style={{ maxWidth: 140 }} value={status}
              onChange={(e) => { setStatus(e.target.value); touch(); }}>
              {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => persist()}>Speichern</button>
          </div>
        </div>
      </div>

      {/* Meeting-Checkliste */}
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>Meeting-Checkliste</h3>
          <div className="row-inline" style={{ alignItems: "center", gap: 10 }}>
            <span className="muted" style={{ fontSize: 12 }}>{done} / {checklist.length} erledigt</span>
            <button className="btn btn-ghost btn-sm" onClick={resetChecklist}>Standard-Agenda</button>
          </div>
        </div>
        <div className="ob-progress" style={{ marginTop: 8 }}>
          <div className="ob-progress-fill" style={{ width: `${checklist.length ? (done / checklist.length) * 100 : 0}%` }} />
        </div>

        {Object.entries(groups).map(([group, items]) => (
          <div key={group} style={{ marginTop: 16 }}>
            <div className="ob-group-head">{group}</div>
            {items.map((c) => (
              <div key={c.id} className={`ob-check ${c.done ? "is-done" : ""}`}>
                <label className="ob-check-box">
                  <input type="checkbox" checked={c.done} onChange={(e) => updItem(c.id, { done: e.target.checked })} />
                </label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input className="ob-check-text" value={c.text} placeholder="Punkt…"
                    onChange={(e) => updItem(c.id, { text: e.target.value })} />
                  <input className="ob-check-note" value={c.note} placeholder="Notiz aus dem Meeting…"
                    onChange={(e) => updItem(c.id, { note: e.target.value })} />
                </div>
                <button className="ob-check-del" title="entfernen" onClick={() => delItem(c.id)}>×</button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => addItem(group)}>+ Punkt</button>
          </div>
        ))}
      </div>

      {/* Strukturierte Aufnahme */}
      {BLOCKS.map((block) => (
        <div key={block.key} className="section">
          <h3 style={{ fontSize: 16, marginBottom: 2 }}>{block.title}</h3>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{block.intro}</div>
          <div className="ob-grid">
            {block.fields.map((f) => (
              <div key={f.id} className="field" style={f.big ? { gridColumn: "1 / -1" } : undefined}>
                <label>{f.label}{f.hint && <span className="muted" style={{ fontWeight: 400 }}> · {f.hint}</span>}</label>
                <textarea className="input form-light" rows={f.big ? 3 : 2}
                  value={data[f.id] || ""} onChange={(e) => updField(f.id, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>
          Ist-Analyse: {filled} / {ALL_FIELDS.length} Feldern · {saveLabel.replace("✓ ", "")}
        </span>
        <div className="row-inline" style={{ gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => persist()}>Speichern</button>
          {status !== "fertig"
            ? <button className="btn btn-primary" onClick={() => persist("fertig")}>✓ Onboarding abschließen</button>
            : <button className="btn btn-ghost" onClick={() => persist("in_arbeit")}>Wieder öffnen</button>}
        </div>
      </div>
    </>
  );
}
