import { useEffect, useState } from "react";
import { Doc, api } from "../api";

const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

export default function Documents({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.documents(clientId).then(setDocs).catch(() => {});
  useEffect(() => { load(); }, [clientId]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setBusy(true);
    try { await api.uploadDocument(clientId, file); load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const del = async (d: Doc) => { await api.deleteDocument(clientId, d.id); load(); };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Dokumente</h2>
        {isAgency && (
          <label className="btn btn-primary btn-sm" style={{ cursor: "pointer" }}>
            {busy ? "Lädt…" : "+ Hochladen"}
            <input type="file" style={{ display: "none" }} onChange={onFile} disabled={busy} />
          </label>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {docs.length === 0 ? <div className="empty">Noch keine Dokumente.</div> : docs.map((d) => (
        <div key={d.id} className="list-row">
          <div>
            <strong>{d.filename}</strong>
            <div className="muted" style={{ fontSize: 12 }}>{fmtSize(d.size)} · {d.uploaded_by} · {new Date(d.created_at).toLocaleDateString("de-DE")}</div>
          </div>
          <div className="row-inline" style={{ alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => api.downloadDocument(clientId, d.id, d.filename)}>Download</button>
            {isAgency && <button className="del" onClick={() => del(d)}>löschen</button>}
          </div>
        </div>
      ))}
      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Max. 15 MB pro Datei. Sichtbar auch für den Kunden.</div>
    </div>
  );
}
