import { useEffect, useState } from "react";
import { Client, MailThread, MailThreadDetail, api } from "../api";
import { useToast } from "../toast";

type Att = { name: string; content_type: string; content_bytes: string; size: number };
const MAX_TOTAL = 13 * 1024 * 1024;
const fmtKB = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function AttachField({ atts, setAtts }: { atts: Att[]; setAtts: React.Dispatch<React.SetStateAction<Att[]>> }) {
  const toast = useToast();
  const add = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => {
        const b64 = String(rd.result).split(",")[1] || "";
        setAtts((a) => {
          if (a.some((x) => x.name === f.name && x.size === f.size)) return a;
          const next = [...a, { name: f.name, content_type: f.type || "application/octet-stream", content_bytes: b64, size: f.size }];
          if (next.reduce((s, x) => s + x.size, 0) > MAX_TOTAL) { toast("Anhänge zu groß (max. ~13 MB gesamt).", "err"); return a; }
          return next;
        });
      };
      rd.readAsDataURL(f);
    });
  };
  return (
    <div className="field">
      <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", display: "inline-block" }}>
        + Datei anhängen
        <input type="file" multiple style={{ display: "none" }} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>
      {atts.map((a, i) => (
        <div key={i} className="list-row" style={{ padding: "6px 0" }}>
          <span style={{ fontSize: 13 }}>📎 {a.name} <span className="muted">· {fmtKB(a.size)}</span></span>
          <button type="button" className="del" onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}>entfernen</button>
        </div>
      ))}
    </div>
  );
}

// ---------- Detailansicht einer Konversation ----------
function ThreadView({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [t, setT] = useState<MailThreadDetail | null>(null);
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => api.mailThread(id).then(setT).catch((e) => toast((e as Error).message, "err"));
  useEffect(() => { load(); }, [id]);
  if (!t) return <div className="empty sm">Lädt…</div>;

  const reply = async () => {
    if (!body.trim() && atts.length === 0) return;
    setBusy(true);
    try {
      const d = await api.replyThread(id, { body, attachments: atts.map(({ name, content_type, content_bytes }) => ({ name, content_type, content_bytes })) });
      setT(d); setBody(""); setAtts([]); onChanged(); toast("Antwort gesendet.");
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  const toggleStatus = async () => { await api.setThreadStatus(id, t.status === "closed" ? "open" : "closed"); load(); onChanged(); };

  return (
    <div className="section form-light">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <span className="back-link" onClick={onBack}>← Konversationen</span>
          <h2 style={{ margin: "6px 0 2px" }}>{t.subject || "(ohne Betreff)"}</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            {t.contact_name ? `${t.contact_name} · ` : ""}{t.contact_email} · Ref. <code>{t.reference}</code>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={toggleStatus}>{t.status === "closed" ? "Wieder öffnen" : "Als erledigt schließen"}</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "16px 0" }}>
        {t.messages.map((m) => {
          const out = m.direction === "out";
          return (
            <div key={m.id} style={{ alignSelf: out ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <div style={{
                background: out ? "var(--coral, #c4553f)" : "#eef0f3", color: out ? "#fff" : "#1f2933",
                borderRadius: 12, padding: "10px 14px", whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5,
              }}>{m.body || <span style={{ opacity: 0.7 }}>(kein Text)</span>}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3, textAlign: out ? "right" : "left" }}>
                {out ? (m.author || "Agentur") : (m.author || m.from_email)} · {when(m.created_at)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="field">
        <label>Antwort schreiben</label>
        <textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Deine Antwort … (Referenznummer wird automatisch mitgeschickt)" />
      </div>
      <AttachField atts={atts} setAtts={setAtts} />
      <button className="btn btn-primary" disabled={busy} onClick={reply}>{busy ? "Sende…" : "Antwort senden"}</button>
    </div>
  );
}

// ---------- Neue Konversation ----------
function Composer({ client, onCreated }: { client: Client; onCreated: (t: MailThread) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(client.contact_email || client.billing_email || "");
  const [name, setName] = useState(client.contact_person || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) return;
    setBusy(true);
    try {
      const t = await api.startThread({
        to, contact_name: name, subject, body, client_id: client.id,
        attachments: atts.map(({ name, content_type, content_bytes }) => ({ name, content_type, content_bytes })),
      });
      setSubject(""); setBody(""); setAtts([]); setOpen(false);
      onCreated(t);
      toast(`Gesendet · Referenz ${t.reference}`);
    } catch (err) { toast((err as Error).message, "err"); } finally { setBusy(false); }
  };

  if (!open) return <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ Neue Nachricht</button>;
  return (
    <form onSubmit={send} style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
      <div className="row-inline">
        <div className="field" style={{ flex: 2 }}><label>An</label>
          <input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} required /></div>
        <div className="field"><label>Name (optional)</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      <div className="field"><label>Betreff</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="z. B. Angebot Website-Relaunch" /></div>
      <div className="field"><label>Nachricht</label>
        <textarea className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Dein Text …" /></div>
      <AttachField atts={atts} setAtts={setAtts} />
      <div className="row-inline" style={{ gap: 8 }}>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Sende…" : "Senden & Konversation starten"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Es wird automatisch eine Referenznummer angehängt (z. B. <code>[NF-7QK4T-9ZM2P]</code>). Antwortet der Kunde,
        landet die Antwort über „Posteingang abrufen“ direkt hier in der Konversation.
      </div>
    </form>
  );
}

// ---------- Container ----------
export default function Conversations({ client }: { client: Client }) {
  const toast = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = () => api.mailThreads(client.id).then(setThreads).catch(() => {});
  useEffect(() => {
    api.mailStatus().then((s) => setConnected(s.connected)).catch(() => setConnected(false));
    load();
  }, [client.id]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.syncThreads();
      toast(r.new > 0 ? `${r.new} neue Antwort${r.new === 1 ? "" : "en"} abgerufen.` : "Keine neuen Antworten.");
      load();
    } catch (e) { toast((e as Error).message, "err"); } finally { setSyncing(false); }
  };

  if (connected === null) return null;
  if (openId) return <ThreadView id={openId} onBack={() => { setOpenId(null); load(); }} onChanged={load} />;

  return (
    <div className="section form-light">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><h2 style={{ marginBottom: 2 }}>E-Mail-Konversationen</h2>
          <div className="muted" style={{ fontSize: 13 }}>Mit Referenznummer – Antworten landen automatisch hier.</div></div>
        {connected && <button className="btn btn-ghost btn-sm" disabled={syncing} onClick={sync}>{syncing ? "Rufe ab…" : "⟳ Posteingang abrufen"}</button>}
      </div>

      {!connected ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Kein Microsoft-Konto verbunden. Verbinde es in den <strong>Einstellungen → E-Mail</strong>, um von hier zu senden und Antworten abzurufen.
        </p>
      ) : (
        <>
          {threads.length === 0 ? (
            <div className="empty sm" style={{ margin: "12px 0" }}>Noch keine Konversation. Starte unten eine neue Nachricht.</div>
          ) : (
            <div style={{ margin: "12px 0" }}>
              {threads.map((t) => (
                <div key={t.id} className="list-row" style={{ cursor: "pointer", alignItems: "center" }} onClick={() => setOpenId(t.id)}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{t.subject || "(ohne Betreff)"}</strong>
                    {t.unread && <span className="badge-count" style={{ marginLeft: 6 }}>neu</span>}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t.contact_name || t.contact_email} · {t.last_direction === "in" ? "↩ Antwort" : "→ gesendet"} · {when(t.last_message_at)} · <code>{t.reference}</code>
                    </div>
                  </div>
                  <span className={`status-badge ${t.status === "closed" ? "st-pausiert" : "st-aktiv"}`}>
                    {t.status === "closed" ? "erledigt" : "offen"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Composer client={client} onCreated={(t) => { load(); setOpenId(t.id); }} />
        </>
      )}
    </div>
  );
}
