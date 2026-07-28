import { useEffect, useState } from "react";
import { Client, api } from "../api";
import { useToast } from "../toast";

export default function MailCompose({ client }: { client: Client }) {
  const toast = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [to, setTo] = useState(client.contact_email || client.billing_email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.mailStatus().then((s) => setConnected(s.connected)).catch(() => setConnected(false)); }, []);

  if (connected === null) return null;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) return;
    setBusy(true);
    try { await api.mailSend({ to, subject, body }); setSubject(""); setBody(""); toast("E-Mail gesendet."); }
    catch (err) { toast((err as Error).message, "err"); }
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
          <div className="field"><label>Nachricht</label><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={5} /></div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Sende…" : "Senden"}</button>
        </form>
      )}
    </div>
  );
}
