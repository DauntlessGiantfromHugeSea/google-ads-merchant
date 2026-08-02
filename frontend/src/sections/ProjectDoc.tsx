import { useEffect, useRef, useState } from "react";
import { WorkLogEntry, api } from "../api";
import { useToast } from "../toast";

// Feste Abschnitts-Boxen – gespiegelt mit dem Backend (projectdoc.py SECTIONS).
const SECTIONS: { id: string; label: string; hint: string; big?: boolean }[] = [
  { id: "uebersicht", label: "Projektübersicht", hint: "Kurzbeschreibung des Projekts", big: true },
  { id: "ziele", label: "Ziele & Zweck", hint: "Warum machen wir das? Zielbild" },
  { id: "umfang", label: "Umfang / Leistungen", hint: "Was ist enthalten (Scope)?", big: true },
  { id: "technik", label: "Technisches Setup", hint: "Hosting, CMS, Stack, Domains" },
  { id: "vorgehen", label: "Vorgehen / Meilensteine", hint: "Phasen, Ablauf, Termine" },
  { id: "entscheidungen", label: "Wichtige Entscheidungen", hint: "Festlegungen & Begründung" },
  { id: "offen", label: "Offene Punkte", hint: "To-dos, Risiken, wartende Punkte" },
  { id: "uebergabe", label: "Übergabe / Wartung", hint: "Zugänge, Support, Betrieb" },
];

let _idc = 0;
const newId = () => `l${Date.now().toString(36)}${(_idc++).toString(36)}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function ProjectDoc({ clientId, clientName }: { clientId: string; clientName: string }) {
  const toast = useToast();
  const [sections, setSections] = useState<Record<string, string>>({});
  const [log, setLog] = useState<WorkLogEntry[]>([]);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  // Formular für neuen Protokoll-Eintrag
  const [nDate, setNDate] = useState(today());
  const [nTitle, setNTitle] = useState("");
  const [nText, setNText] = useState("");

  const ref = useRef({ sections, log, status });
  ref.current = { sections, log, status };

  useEffect(() => {
    api.getProjectDoc(clientId).then((d) => {
      setSections(d.sections || {}); setLog(d.log || []); setStatus(d.status || ""); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [clientId]);

  const persist = async () => {
    setSaveState("saving");
    try {
      await api.saveProjectDoc(clientId, ref.current);
      setSaveState("saved");
    } catch (e) { toast((e as Error).message, "err"); setSaveState("dirty"); }
  };
  const touch = () => setSaveState("dirty");
  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(() => { persist(); }, 1500);
    return () => clearTimeout(t);
  }, [saveState, sections, log, status]);

  const updSec = (id: string, v: string) => { setSections((s) => ({ ...s, [id]: v })); touch(); };
  const addEntry = () => {
    if (!nText.trim()) { toast("Bitte einen Text eingeben.", "err"); return; }
    setLog((l) => [...l, { id: newId(), date: nDate || today(), title: nTitle.trim(), text: nText.trim(), author: "" }]);
    setNTitle(""); setNText(""); setNDate(today()); touch();
  };
  const delEntry = (id: string) => { setLog((l) => l.filter((e) => e.id !== id)); touch(); };

  const pdf = async (kind: "doc" | "worklog") => {
    try { await api.downloadProjectDocPdf(clientId, clientName, kind); }
    catch (e) { toast((e as Error).message, "err"); }
  };

  if (!loaded) return <div className="section"><div className="muted">lädt…</div></div>;
  const saveLabel = saveState === "saving" ? "Speichert…" : saveState === "saved" ? "✓ Gespeichert"
    : saveState === "dirty" ? "Nicht gespeichert" : "Gespeichert";
  const sorted = [...log].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <>
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Projekt-Dokumentation</h2>
            <div className="muted" style={{ fontSize: 13 }}>Feste Abschnitte, Arbeitsstand &amp; „was wurde gemacht" – als PDF.</div>
          </div>
          <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 12 }}>{saveLabel}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => pdf("doc")}>📄 Doku-PDF</button>
            <button className="btn btn-ghost btn-sm" onClick={() => pdf("worklog")}>📄 Arbeitsnachweis</button>
          </div>
        </div>
      </div>

      {/* Aktueller Arbeitsstand – hervorgehoben */}
      <div className="section" style={{ borderLeft: "3px solid var(--coral)" }}>
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>Aktueller Arbeitsstand</h3>
          <input className="input form-light" style={{ maxWidth: 220 }} value={status}
            onChange={(e) => { setStatus(e.target.value); touch(); }} placeholder="Phase/Status, z. B. In Umsetzung" />
        </div>
        <textarea className="input form-light" style={{ marginTop: 10 }} rows={3}
          value={sections["arbeitsstand"] || ""} onChange={(e) => updSec("arbeitsstand", e.target.value)}
          placeholder="Wo stehen wir gerade? Nächste Schritte …" />
      </div>

      {/* Feste Boxen */}
      <div className="section">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Projekt-Abschnitte</h3>
        <div className="ob-grid">
          {SECTIONS.map((s) => (
            <div key={s.id} className="field" style={s.big ? { gridColumn: "1 / -1" } : undefined}>
              <label>{s.label}<span className="muted" style={{ fontWeight: 400 }}> · {s.hint}</span></label>
              <textarea className="input form-light" rows={s.big ? 3 : 2}
                value={sections[s.id] || ""} onChange={(e) => updSec(s.id, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Arbeitsprotokoll: Was wurde gemacht */}
      <div className="section">
        <h3 style={{ fontSize: 16, marginBottom: 2 }}>Was wurde gemacht</h3>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Fortlaufendes Arbeitsprotokoll – landet im Arbeitsnachweis-PDF.</div>
        <div className="form-light" style={{ marginBottom: 14 }}>
          <div className="row-inline">
            <div className="field" style={{ maxWidth: 160 }}><label>Datum</label>
              <input className="input" type="date" value={nDate} onChange={(e) => setNDate(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Titel (optional)</label>
              <input className="input" value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="z. B. Startseite umgesetzt" /></div>
          </div>
          <div className="field"><label>Was wurde gemacht?</label>
            <textarea className="input" value={nText} onChange={(e) => setNText(e.target.value)} rows={2} /></div>
          <button className="btn btn-primary btn-sm" onClick={addEntry}>+ Eintrag</button>
        </div>

        {sorted.length === 0 ? <div className="empty sm">Noch keine Einträge.</div> : sorted.map((e) => (
          <div key={e.id} className="worklog-entry">
            <div className="worklog-date">{e.date}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {e.title && <strong>{e.title}</strong>}
              <div className="muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{e.text}</div>
            </div>
            <button className="del" onClick={() => delEntry(e.id)}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}
