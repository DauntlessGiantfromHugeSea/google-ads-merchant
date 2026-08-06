import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMsg, api } from "../api";
import { useToast } from "../toast";

// Kunden-Anleitung: zwei Gruppen, bewusst tiefer. Gespiegelt mit projectdoc.py.
const GROUPS: { title: string; fields: { id: string; label: string; hint: string; big?: boolean }[] }[] = [
  {
    title: "Anleitung für den Kunden",
    fields: [
      { id: "ueberblick", label: "Überblick", hint: "Was ist die Website, worum geht’s?", big: true },
      { id: "inhalte", label: "Inhalte selbst pflegen", hint: "Wie ändert man Texte/Bilder – konkret", big: true },
      { id: "aufgaben", label: "Häufige Aufgaben – Schritt für Schritt", hint: "z. B. neuen Beitrag anlegen, Bild tauschen", big: true },
      { id: "zugaenge", label: "Login & Zugänge", hint: "Wo einloggen (ohne Passwörter hier)" },
      { id: "support", label: "Support & Ansprechpartner", hint: "Wie erreicht man euch, Reaktionszeiten" },
    ],
  },
  {
    title: "Technische Doku",
    fields: [
      { id: "setup", label: "Setup & Hosting", hint: "Wo läuft die Seite, Serverumgebung", big: true },
      { id: "domain", label: "Domain, E-Mail & DNS", hint: "Domain, Mail, wichtige DNS-Einträge" },
      { id: "stack", label: "Verwendete Technik / Stack", hint: "CMS, Framework, Plugins, Libraries" },
      { id: "einstellungen", label: "Wichtige Einstellungen", hint: "Caching, Backups, SEO, Tracking …", big: true },
      { id: "uebergabe", label: "Übergabe & Wartung", hint: "Was ist zu tun, Wartungsintervalle" },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.fields);

// ---------- Kundenansicht (read-only Anleitung) ----------
function ClientAnleitung({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [sections, setSections] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { api.clientAnleitung(clientId).then((a) => { setSections(a.sections || {}); setLoaded(true); }).catch(() => setLoaded(true)); }, [clientId]);
  const has = ALL.some((f) => (sections[f.id] || "").trim());
  if (loaded && !has) return null;
  return (
    <>
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div><h2 style={{ marginBottom: 2 }}>Anleitung</h2>
            <div className="muted" style={{ fontSize: 13 }}>Bedienung & Technik deiner Website.</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => api.downloadProjectDocPdf(clientId, clientName, "anleitung")}>📄 Als PDF</button>
        </div>
      </div>
      {GROUPS.map((g) => {
        const fields = g.fields.filter((f) => (sections[f.id] || "").trim());
        if (!fields.length) return null;
        return (
          <div key={g.title} className="section">
            <h3 style={{ fontSize: 16, marginBottom: 10 }}>{g.title}</h3>
            {fields.map((f) => (
              <div key={f.id} style={{ marginBottom: 14 }}>
                <strong>{f.label}</strong>
                <div className="muted" style={{ fontSize: 14, whiteSpace: "pre-wrap", marginTop: 2 }}>{sections[f.id]}</div>
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
  const send = async () => {
    if (!msg.trim()) return;
    try { const d = await api.addProjectDocChat(clientId, msg); setChat(d.log || []); setMsg(""); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const delMsg = async (id: string) => { try { const d = await api.delProjectDocChat(clientId, id); setChat(d.log || []); } catch { /* ignore */ } };
  const filled = useMemo(() => ALL.filter((f) => (sections[f.id] || "").trim()).length, [sections]);
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
            <div className="muted" style={{ fontSize: 13 }}>Bekommt der Kunde am Ende – im Portal &amp; als PDF. {filled}/{ALL.length} Felder · {saveLabel}</div></div>
          <div className="row-inline" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={persist}>Speichern</button>
            <button className="btn btn-ghost btn-sm" onClick={() => api.downloadProjectDocPdf(clientId, clientName, "doc")}>📄 Anleitung-PDF</button>
          </div>
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.title} className="section">
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>{g.title}</h3>
          <div className="ob-grid">
            {g.fields.map((f) => (
              <div key={f.id} className="field" style={f.big ? { gridColumn: "1 / -1" } : undefined}>
                <label>{f.label}<span className="muted" style={{ fontWeight: 400 }}> · {f.hint}</span></label>
                <textarea className="input form-light" rows={f.big ? 3 : 2}
                  value={sections[f.id] || ""} onChange={(e) => updSec(f.id, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
