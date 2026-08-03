import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Client, DocBlock, RichDoc, RichDocBrief, api } from "../api";
import { useToast } from "../toast";

let _bid = 0;
const nid = () => `b${Date.now().toString(36)}${(_bid++).toString(36)}`;

const BLOCK_TYPES: { type: string; label: string }[] = [
  { type: "eyebrow", label: "Kennzeile (klein)" },
  { type: "title", label: "Titel (groß)" },
  { type: "lead", label: "Einleitung" },
  { type: "heading", label: "Abschnitts-Überschrift" },
  { type: "text", label: "Text" },
  { type: "badge", label: "Badge (farbig)" },
  { type: "numbered", label: "Nummerierter Punkt" },
  { type: "callout", label: "Hervorhebung (Box)" },
  { type: "quote", label: "Zitat / Randnotiz" },
  { type: "meta", label: "Info-Tabelle (Feld/Wert)" },
  { type: "table", label: "Tabelle (2 Spalten)" },
  { type: "divider", label: "Trennlinie" },
];
const newBlock = (type: string): DocBlock => {
  const b: DocBlock = { id: nid(), type };
  if (type === "badge") b.color = "green";
  if (type === "meta") b.rows = [{ k: "", v: "" }];
  if (type === "table") { b.columns = ["Spalte 1", "Spalte 2"]; b.rows = [["", ""]]; }
  return b;
};

export default function Briefe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [list, setList] = useState<RichDocBrief[]>([]);
  const [doc, setDoc] = useState<RichDoc | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const ref = useRef<RichDoc | null>(null);
  ref.current = doc;

  const loadList = () => api.richdocs().then(setList).catch(() => {});
  useEffect(() => { loadList(); api.clients().then((c) => setClients(c.filter((x) => !x.archived))).catch(() => {}); }, []);
  useEffect(() => { if (id) api.richdoc(id).then((d) => { setDoc(d); setSaveState("idle"); }).catch(() => toast("Nicht gefunden.", "err")); else setDoc(null); }, [id]);

  const persist = async () => {
    if (!ref.current) return;
    setSaveState("saving");
    try { await api.updateRichdoc(ref.current.id, ref.current); setSaveState("saved"); loadList(); }
    catch (e) { toast((e as Error).message, "err"); setSaveState("dirty"); }
  };
  const touch = () => setSaveState("dirty");
  useEffect(() => { if (saveState !== "dirty") return; const t = setTimeout(persist, 1500); return () => clearTimeout(t); }, [saveState, doc]);

  const upd = (patch: Partial<RichDoc>) => { setDoc((d) => (d ? { ...d, ...patch } : d)); touch(); };
  const updBlock = (bid: string, patch: Partial<DocBlock>) => {
    setDoc((d) => d ? { ...d, blocks: d.blocks.map((b) => (b.id === bid ? { ...b, ...patch } : b)) } : d); touch();
  };
  const addBlock = (type: string) => { setDoc((d) => d ? { ...d, blocks: [...d.blocks, newBlock(type)] } : d); touch(); };
  const delBlock = (bid: string) => { setDoc((d) => d ? { ...d, blocks: d.blocks.filter((b) => b.id !== bid) } : d); touch(); };
  const move = (bid: string, dir: -1 | 1) => setDoc((d) => {
    if (!d) return d;
    const i = d.blocks.findIndex((b) => b.id === bid); const j = i + dir;
    if (i < 0 || j < 0 || j >= d.blocks.length) return d;
    const bl = [...d.blocks]; [bl[i], bl[j]] = [bl[j], bl[i]]; touch(); return { ...d, blocks: bl };
  });

  const create = async () => {
    const d = await api.createRichdoc({ title: "Neues Dokument", theme: "editorial", accent: "#4a7c2f",
      blocks: [{ id: nid(), type: "eyebrow", text: "REPORT" }, { id: nid(), type: "title", text: "Neuer Titel" }] });
    loadList(); navigate(`/briefe/${d.id}`);
  };
  const remove = async () => { if (!doc || !confirm("Dokument löschen?")) return; await api.deleteRichdoc(doc.id); navigate("/briefe"); loadList(); };
  const pdf = async () => { if (doc) { await persist(); api.downloadRichdocPdf(doc.id, doc.title).catch((e) => toast((e as Error).message, "err")); } };
  const send = async () => {
    if (!doc) return; await persist();
    const to = prompt("An welche E-Mail senden? (leer = Kunden-Adresse)", "");
    if (to === null) return;
    try { const r = await api.sendRichdoc(doc.id, { to }); toast(`Gesendet an ${r.to}.`); }
    catch (e) { toast((e as Error).message, "err"); }
  };

  const saveLabel = saveState === "saving" ? "Speichert…" : saveState === "saved" ? "✓ Gespeichert" : saveState === "dirty" ? "…" : "";

  // ---- Liste ----
  if (!id) {
    return (
      <>
        <div className="page-head"><h1>Briefe & Reports</h1><button className="btn btn-primary" onClick={create}>+ Neues Dokument</button></div>
        {list.length === 0 ? <div className="empty">Noch keine Dokumente. Erstelle deinen ersten Report oder Brief.</div> : (
          <div className="grid">
            {list.map((d) => (
              <div key={d.id} className="card clickable" onClick={() => navigate(`/briefe/${d.id}`)}>
                <h3>{d.title}</h3>
                <div className="meta">{d.theme === "letterhead" ? "Briefpapier" : "Editorial"}{d.client_name ? ` · ${d.client_name}` : ""}</div>
                {d.updated_at && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{new Date(d.updated_at).toLocaleString("de-DE")}</div>}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  if (!doc) return <div className="empty">Lädt…</div>;

  return (
    <>
      <div className="page-head">
        <div className="row-inline" style={{ alignItems: "center", gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/briefe")}>← Alle</button>
          <h1 style={{ fontSize: 22 }}>Dokument bearbeiten</h1>
          <span className="muted" style={{ fontSize: 12 }}>{saveLabel}</span>
        </div>
        <div className="row-inline" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={pdf}>📄 PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={send}>✉ Senden</button>
          <button className="btn btn-primary btn-sm" onClick={persist}>Speichern</button>
        </div>
      </div>

      {/* Kopf */}
      <div className="section form-light">
        <div className="row-inline">
          <div className="field" style={{ flex: 2 }}><label>Titel (intern / Dateiname)</label>
            <input className="input" value={doc.title} onChange={(e) => upd({ title: e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label>Stil</label>
            <select className="select" value={doc.theme} onChange={(e) => upd({ theme: e.target.value })}>
              <option value="editorial">Editorial (eigenständig)</option>
              <option value="letterhead">Auf Briefpapier</option>
            </select></div>
          <div className="field" style={{ maxWidth: 90 }}><label>Farbe</label>
            <input className="input" type="color" value={doc.accent} onChange={(e) => upd({ accent: e.target.value })} style={{ height: 38, padding: 4 }} /></div>
        </div>
        <div className="row-inline">
          <div className="field" style={{ flex: 2 }}><label>Fußzeile (optional)</label>
            <input className="input" value={doc.footer} onChange={(e) => upd({ footer: e.target.value })} placeholder="z. B. Projektname – Stand …" /></div>
          <div className="field" style={{ flex: 1 }}><label>Kunde (optional, für Versand)</label>
            <select className="select" value={doc.client_id || ""} onChange={(e) => upd({ client_id: e.target.value || null })}>
              <option value="">— keiner —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        </div>
      </div>

      {/* Blöcke */}
      {doc.blocks.map((b, i) => (
        <div key={b.id} className="section doc-block">
          <div className="doc-block-head">
            <span className="doc-block-type">{BLOCK_TYPES.find((t) => t.type === b.type)?.label || b.type}</span>
            <div className="row-inline" style={{ gap: 4 }}>
              <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(b.id!, -1)}>↑</button>
              <button className="btn btn-ghost btn-sm" disabled={i === doc.blocks.length - 1} onClick={() => move(b.id!, 1)}>↓</button>
              <button className="del" onClick={() => delBlock(b.id!)}>×</button>
            </div>
          </div>
          <BlockEditor block={b} onChange={(p) => updBlock(b.id!, p)} />
        </div>
      ))}

      <div className="section">
        <label className="muted" style={{ fontSize: 12 }}>Block hinzufügen</label>
        <div className="doc-add">
          {BLOCK_TYPES.map((t) => <button key={t.type} className="btn btn-ghost btn-sm" onClick={() => addBlock(t.type)}>+ {t.label}</button>)}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Tipp: **Text zwischen Sternen** wird fett. Zeilenumbrüche bleiben erhalten.</div>
      </div>

      <div className="section" style={{ textAlign: "right" }}>
        <button className="del" onClick={remove}>Dokument löschen</button>
      </div>
    </>
  );
}

function BlockEditor({ block, onChange }: { block: DocBlock; onChange: (p: Partial<DocBlock>) => void }) {
  const single = ["eyebrow", "title", "heading", "badge"].includes(block.type);
  const area = ["lead", "text", "quote"].includes(block.type);
  if (single || area) {
    return (
      <div className="form-light">
        {area
          ? <textarea className="input" value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} rows={block.type === "text" ? 3 : 2} />
          : <input className="input" value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} />}
        {block.type === "badge" && (
          <select className="select" style={{ marginTop: 8, maxWidth: 160 }} value={block.color || "green"} onChange={(e) => onChange({ color: e.target.value })}>
            <option value="green">Grün (Akzent)</option><option value="red">Rot</option><option value="gray">Grau</option>
          </select>
        )}
      </div>
    );
  }
  if (block.type === "numbered" || block.type === "callout") {
    return (
      <div className="form-light">
        <input className="input" placeholder={block.type === "callout" ? "Überschrift (optional)" : "Überschrift"} value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })} />
        <textarea className="input" style={{ marginTop: 8 }} rows={2} value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} />
      </div>
    );
  }
  if (block.type === "meta") {
    const rows = (block.rows as { k: string; v: string }[]) || [];
    return (
      <div className="form-light">
        {rows.map((r, i) => (
          <div key={i} className="row-inline" style={{ gap: 8, marginBottom: 6 }}>
            <input className="input" style={{ maxWidth: 180 }} placeholder="Feld" value={r.k} onChange={(e) => onChange({ rows: rows.map((x, j) => j === i ? { ...x, k: e.target.value } : x) })} />
            <input className="input" placeholder="Wert" value={r.v} onChange={(e) => onChange({ rows: rows.map((x, j) => j === i ? { ...x, v: e.target.value } : x) })} />
            <button className="del" onClick={() => onChange({ rows: rows.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => onChange({ rows: [...rows, { k: "", v: "" }] })}>+ Zeile</button>
      </div>
    );
  }
  if (block.type === "table") {
    const cols = block.columns || ["", ""];
    const rows = (block.rows as string[][]) || [];
    return (
      <div className="form-light">
        <div className="row-inline" style={{ gap: 8, marginBottom: 8 }}>
          {cols.map((c, i) => <input key={i} className="input" placeholder={`Spalte ${i + 1}`} value={c} onChange={(e) => onChange({ columns: cols.map((x, j) => j === i ? e.target.value : x) })} />)}
        </div>
        {rows.map((row, ri) => (
          <div key={ri} className="row-inline" style={{ gap: 8, marginBottom: 6 }}>
            {row.map((cell, ci) => <input key={ci} className="input" value={cell} onChange={(e) => onChange({ rows: rows.map((r, j) => j === ri ? r.map((c, k) => k === ci ? e.target.value : c) : r) })} />)}
            <button className="del" onClick={() => onChange({ rows: rows.filter((_, j) => j !== ri) })}>×</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => onChange({ rows: [...rows, cols.map(() => "")] })}>+ Zeile</button>
      </div>
    );
  }
  return <div className="muted" style={{ fontSize: 13 }}>Trennlinie</div>;
}
