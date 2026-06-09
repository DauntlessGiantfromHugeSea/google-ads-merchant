import { useEffect, useState } from "react";
import { ClientUpdate, api } from "../api";

const CATS: Record<string, string> = { update: "Update", note: "Notiz", milestone: "Meilenstein" };

export default function Updates({ clientId, isAgency }:
  { clientId: string; isAgency: boolean }) {
  const [items, setItems] = useState<ClientUpdate[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState("update");

  const load = () => api.updates(clientId).then(setItems).catch(() => {});
  useEffect(() => { load(); }, [clientId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    await api.createUpdate(clientId, { title, body, category: cat });
    setTitle(""); setBody(""); load();
  };
  const del = async (id: string) => { await api.deleteUpdate(clientId, id); load(); };
  const fmt = (s: string) => new Date(s).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="section">
      <h2>Verlauf</h2>
      {isAgency && (
        <form className="form-light" style={{ marginBottom: 18 }} onSubmit={add}>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Titel (optional)</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="field"><label>Typ</label>
              <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
                {Object.entries(CATS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
          </div>
          <div className="field"><label>Update</label>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Was gibt es Neues für den Kunden?" /></div>
          <button className="btn btn-primary">In den Verlauf laden</button>
        </form>
      )}
      {items.length === 0 ? <div className="empty">Noch keine Einträge.</div> : (
        <div className="timeline">
          {items.map((u) => (
            <div key={u.id} className="tl-item">
              <div className="tl-cat">{CATS[u.category] || u.category}</div>
              {u.title && <div className="tl-title">{u.title}</div>}
              <div style={{ whiteSpace: "pre-line", fontSize: 14 }}>{u.body}</div>
              <div className="tl-meta">
                {u.author_name} · {fmt(u.created_at)}
                {isAgency && <> · <span className="del" style={{ display: "inline" }} onClick={() => del(u.id)}>löschen</span></>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
