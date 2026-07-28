import { useEffect, useState } from "react";
import { Client, Doc, api } from "../api";
import { useToast } from "../toast";

const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

export default function Documents({ clientId, isAgency, client }:
  { clientId: string; isAgency: boolean; client?: Client }) {
  const toast = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [sendId, setSendId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const load = () => api.documents(clientId).then(setDocs).catch(() => {});
  useEffect(() => { load(); }, [clientId]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { await api.uploadDocument(clientId, file); load(); toast("Dokument hochgeladen."); }
    catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const del = async (d: Doc) => {
    if (!confirm(`„${d.filename}" löschen?`)) return;
    await api.deleteDocument(clientId, d.id); load(); toast("Dokument gelöscht.");
  };
  const openSend = (d: Doc) => {
    setSendId(d.id);
    setTo(client?.billing_email || client?.contact_email || "");
    setSubject(`Ihre Unterlage: ${d.filename}`);
    setBody("Guten Tag,\n\nanbei die Unterlage im Anhang.\n\nBeste Grüße");
  };
  const send = async (d: Doc, e: React.FormEvent) => {
    e.preventDefault();
    try { await api.sendDocumentEmail(clientId, d.id, { to, subject, body }); setSendId(null); toast("Per E-Mail gesendet."); }
    catch (err) { toast((err as Error).message, "err"); }
  };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Dokumente & Rechnungen</h2>
        {isAgency && (
          <label className="btn btn-primary btn-sm" style={{ cursor: "pointer" }}>
            {busy ? "Lädt…" : "+ Hochladen"}
            <input type="file" style={{ display: "none" }} onChange={onFile} disabled={busy} />
          </label>
        )}
      </div>
      {docs.length === 0 ? <div className="empty">Noch keine Dokumente.</div> : docs.map((d) => (
        <div key={d.id}>
          <div className="list-row">
            <div>
              <strong>{d.filename}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{fmtSize(d.size)} · {d.uploaded_by} · {new Date(d.created_at).toLocaleDateString("de-DE")}</div>
            </div>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => api.downloadDocument(clientId, d.id, d.filename)}>Download</button>
              {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => (sendId === d.id ? setSendId(null) : openSend(d))}>per E-Mail</button>}
              {isAgency && <button className="del" onClick={() => del(d)}>löschen</button>}
            </div>
          </div>
          {sendId === d.id && (
            <form className="card form-light" style={{ margin: "8px 0", boxShadow: "none" }}
              onSubmit={(e) => send(d, e)}>
              <div className="field"><label>An</label><input className="input" value={to} onChange={(e) => setTo(e.target.value)} required /></div>
              <div className="field"><label>Betreff</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div className="field"><label>Nachricht</label><textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={4} /></div>
              <div className="row-inline">
                <button className="btn btn-primary btn-sm">Mit Anhang senden</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSendId(null)}>Abbrechen</button>
              </div>
            </form>
          )}
        </div>
      ))}
      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        Max. 15 MB pro Datei. „per E-Mail" sendet die Datei als Anhang über dein Microsoft-Konto (in den Einstellungen verbinden).
      </div>
    </div>
  );
}
