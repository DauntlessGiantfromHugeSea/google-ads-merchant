import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";

// Geführte Onboarding-Struktur: zwei Blöcke, je mehrere Felder.
type Field = { id: string; label: string; hint?: string; big?: boolean };
type Block = { key: string; title: string; intro: string; fields: Field[] };

const BLOCKS: Block[] = [
  {
    key: "ist", title: "1 · Ist-Analyse (Status quo)",
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
    key: "anf", title: "2 · Anforderungen ans Projekt",
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

export default function Onboarding({ clientId, onStatus }:
  { clientId: string; onStatus?: (done: boolean) => void }) {
  const toast = useToast();
  const [data, setData] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("offen");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.getOnboarding(clientId).then((o) => {
      setData(o.data || {}); setStatus(o.status || "offen"); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [clientId]);

  const filled = useMemo(() => ALL_FIELDS.filter((f) => (data[f.id] || "").trim()).length, [data]);
  const pct = Math.round((filled / ALL_FIELDS.length) * 100);

  const upd = (id: string, v: string) => { setData((d) => ({ ...d, [id]: v })); setDirty(true); };

  const save = async (newStatus = status) => {
    setSaving(true);
    try {
      await api.saveOnboarding(clientId, { data, status: newStatus });
      setStatus(newStatus); setDirty(false);
      onStatus?.(newStatus === "fertig");
      toast("Onboarding gespeichert.");
    } catch (e) { toast((e as Error).message, "err"); }
    finally { setSaving(false); }
  };

  if (!loaded) return <div className="section"><div className="muted">lädt…</div></div>;

  return (
    <>
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Onboarding</h2>
            <div className="muted" style={{ fontSize: 13 }}>Ist-Analyse &amp; Anforderungen – die Basis fürs Projekt.</div>
          </div>
          <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
            <select className="select form-light" style={{ maxWidth: 150 }} value={status}
              onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={saving}>
              {saving ? "Speichere…" : "Speichern"}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="row-inline" style={{ justifyContent: "space-between", fontSize: 12 }}>
            <span className="muted">{filled} / {ALL_FIELDS.length} Feldern ausgefüllt</span>
            <span className="muted">{pct} %</span>
          </div>
          <div className="ob-progress"><div className="ob-progress-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {BLOCKS.map((block) => (
        <div key={block.key} className="section">
          <h3 style={{ fontSize: 16, marginBottom: 2 }}>{block.title}</h3>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{block.intro}</div>
          <div className="ob-grid">
            {block.fields.map((f) => (
              <div key={f.id} className="field" style={f.big ? { gridColumn: "1 / -1" } : undefined}>
                <label>{f.label}{f.hint && <span className="muted" style={{ fontWeight: 400 }}> · {f.hint}</span>}</label>
                <textarea className="input form-light" rows={f.big ? 3 : 2}
                  value={data[f.id] || ""} onChange={(e) => upd(f.id, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {dirty ? "Nicht gespeicherte Änderungen." : "Alles gespeichert."}
        </span>
        <div className="row-inline" style={{ gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => save()} disabled={saving}>Speichern</button>
          {status !== "fertig"
            ? <button className="btn btn-primary" onClick={() => save("fertig")} disabled={saving}>✓ Onboarding abschließen</button>
            : <button className="btn btn-ghost" onClick={() => save("in_arbeit")} disabled={saving}>Wieder öffnen</button>}
        </div>
      </div>
    </>
  );
}
