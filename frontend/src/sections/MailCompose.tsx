import { useEffect, useState } from "react";
import { Client, api } from "../api";
import { useToast } from "../toast";

type Att = { name: string; content_type: string; content_bytes: string; size: number };
const MAX_TOTAL = 13 * 1024 * 1024; // ~13 MB
const fmtKB = (b: number) => b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function MailCompose({ client }: { client: Client }) {
  const toast = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [to, setTo] = useState(client.contact_email || client.billing_email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.mailStatus().then((s) => setConnected(s.connected)).catch(() => setConnected(false)); }, []);

  if (connected === null) return null;

  const addFiles = (files: FileList | null) => {
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

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) return;
    setBusy(true);
    try {
      await api.mailSend({ to, subject, body, attachments: atts.map(({ name, content_type, content_bytes }) => ({ name, content_type, content_bytes })) });
      setSubject(""); setBody(""); setAtts([]); toast("E-Mail gesendet.");
    } catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); }
  };

  return (
    <div className="section form-light">
      <h2>E-Mail an Kunde</h2>
      {!connected ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Kein Microsoft-Konto verbunden. Verbinde es in den <strong>Einstellungen → E-Mail</strong>, um von hier zu senden.
        </p>
      ) : (
        <form onSubmit={send}>
          <div className="field"><label>An</label><input className="input" value={to} onChange={(e) => setTo(e.target.value)} required /></div>
          <div className="field"><label>Betreff</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="field"><label>Persönliche Nachricht</label><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Dein persönlicher Text …" /></div>

          <div className="field">
            <label>Anhänge (werden nur mitgesendet, nicht gespeichert)</label>
            <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", display: "inline-block" }}>
              + Datei anhängen
              <input type="file" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {atts.map((a, i) => (
              <div key={i} className="list-row" style={{ padding: "6px 0" }}>
                <span style={{ fontSize: 13 }}>📎 {a.name} <span className="muted">· {fmtKB(a.size)}</span></span>
                <button type="button" className="del" onClick={() => setAtts((x) => x.filter((_, j) => j !== i))}>entfernen</button>
              </div>
            ))}
            {atts.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Gesamt: {fmtKB(atts.reduce((s, x) => s + x.size, 0))}</div>}
          </div>

          <button className="btn btn-primary" disabled={busy}>{busy ? "Sende…" : "Senden"}</button>
        </form>
      )}
    </div>
  );
}
