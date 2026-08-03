import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Client, FileRequest, api } from "../api";
import { useToast } from "../toast";

const fileSize = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmt = (s: string) => new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

export default function Dateien() {
  const { id } = useParams();
  const toast = useToast();
  const [reqs, setReqs] = useState<FileRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sel, setSel] = useState<string | null>(id || null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [client, setClient] = useState("");

  const load = () => api.fileRequests().then((r) => { setReqs(r); if (!sel && r[0]) setSel(r[0].id); }).catch(() => {});
  useEffect(() => { load(); api.clients().then((c) => setClients(c.filter((x) => !x.archived))).catch(() => {}); }, []);

  const current = useMemo(() => reqs.find((r) => r.id === sel) || null, [reqs, sel]);
  const publicUrl = (token: string) => `${location.origin}/upload/${token}`;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.createFileRequest({ title, message, client_id: client || null });
      setTitle(""); setMessage(""); setClient(""); setShowForm(false); setSel(r.id);
      const list = await api.fileRequests(); setReqs(list);
      toast("Anforderung erstellt.");
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const copy = (token: string) => { navigator.clipboard.writeText(publicUrl(token)).then(() => toast("Link kopiert.")); };
  const toggle = async (r: FileRequest) => { await api.toggleFileRequest(r.id, !r.active); load(); };
  const delReq = async (r: FileRequest) => { if (!confirm(`„${r.title}" inkl. Dateien löschen?`)) return; await api.deleteFileRequest(r.id); setSel(null); load(); };
  const delFile = async (fileId: string) => { if (!current) return; if (!confirm("Datei löschen?")) return; await api.deleteUploadedFile(current.id, fileId); load(); };
  const dl = async (fileId: string, name: string) => { if (!current) return; try { await api.downloadUploadedFile(current.id, fileId, name); } catch (e) { toast((e as Error).message, "err"); } };

  return (
    <>
      <div className="page-head">
        <h1>Dateien anfordern</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Abbrechen" : "+ Neue Anforderung"}</button>
      </div>

      {showForm && (
        <form className="section form-light" onSubmit={create}>
          <h2>Neue Datei-Anforderung</h2>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Titel</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Logo & Bildmaterial" required /></div>
            <div className="field" style={{ flex: 1 }}><label>Kunde (optional)</label>
              <select className="select" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">— keiner —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
          <div className="field"><label>Hinweis an den Uploader (optional)</label>
            <textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Was soll hochgeladen werden?" /></div>
          <button className="btn btn-primary">Anlegen</button>
        </form>
      )}

      {reqs.length === 0 ? <div className="empty">Noch keine Anforderungen. Lege eine an und teile den öffentlichen Link.</div> : (
        <div className="client-layout">
          <nav className="client-nav">
            {reqs.map((r) => (
              <button key={r.id} className={`nav-item ${sel === r.id ? "active" : ""}`} onClick={() => setSel(r.id)}>
                {r.active ? "" : "🚫 "}{r.title}
                {r.file_count > 0 && <span className="badge-count">{r.file_count}</span>}
              </button>
            ))}
          </nav>
          <div className="client-content">
            {current && (
              <>
                <div className="section">
                  <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ marginBottom: 2 }}>{current.title}</h2>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {current.client_name && `${current.client_name} · `}{current.file_count} Datei(en) · {fileSize(current.total_size)}
                      </div>
                    </div>
                    <div className="row-inline" style={{ gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggle(current)}>{current.active ? "Deaktivieren" : "Aktivieren"}</button>
                      <button className="del" onClick={() => delReq(current)}>löschen</button>
                    </div>
                  </div>
                  {current.message && <p className="muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{current.message}</p>}
                  <div className="field" style={{ marginTop: 6 }}>
                    <label>Öffentlicher Upload-Link {current.active ? "" : "(deaktiviert)"}</label>
                    <div className="row-inline" style={{ gap: 8 }}>
                      <input className="input form-light" readOnly value={publicUrl(current.token)} onFocus={(e) => e.currentTarget.select()} />
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(current.token)}>Kopieren</button>
                      <a className="btn btn-ghost btn-sm" href={publicUrl(current.token)} target="_blank" rel="noreferrer">Öffnen</a>
                    </div>
                  </div>
                </div>

                <div className="section">
                  <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <h3 style={{ fontSize: 15, margin: 0 }}>Hochgeladene Dateien</h3>
                    {current.files.length > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => api.downloadAllFiles(current.id, current.title).catch((e) => toast((e as Error).message, "err"))}>
                        ⬇ Alle als ZIP
                      </button>
                    )}
                  </div>
                  {current.files.length === 0 ? <div className="empty sm">Noch nichts hochgeladen. Du bekommst eine Mail, sobald etwas ankommt.</div> : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="inv-table">
                        <thead><tr><th>Datei</th><th>Von</th><th>Hochgeladen</th><th>Löscht am</th><th style={{ textAlign: "right" }}>Größe</th><th></th></tr></thead>
                        <tbody>
                          {current.files.map((f) => (
                            <tr key={f.id}>
                              <td><strong>{f.filename}</strong></td>
                              <td className="muted">{f.uploader || "—"}</td>
                              <td className="muted">{fmt(f.created_at)}</td>
                              <td className="muted">{f.expires_at ? new Date(f.expires_at).toLocaleDateString("de-DE") : "—"}</td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fileSize(f.size)}</td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => dl(f.id, f.filename)}>laden</button>
                                <button className="del" onClick={() => delFile(f.id)}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
