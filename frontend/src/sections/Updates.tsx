import { useEffect, useState } from "react";
import { ClientUpdate, api } from "../api";
import { useToast } from "../toast";

const CATS: Record<string, string> = { update: "Update", note: "Notiz", milestone: "Meilenstein", message: "Nachricht" };

export default function Updates({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<ClientUpdate[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState(isAgency ? "update" : "message");

  const load = () => api.updates(clientId).then(setItems).catch(() => {});
  useEffect(() => { load(); }, [clientId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await api.createUpdate(clientId, { title, body, category: cat });
      setTitle(""); setBody(""); load();
      toast(isAgency ? "Im Verlauf gespeichert." : "Nachricht gesendet.");
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const del = async (id: string) => {
    if (!confirm("Diesen Eintrag löschen?")) return;
    await api.deleteUpdate(clientId, id); load(); toast("Eintrag gelöscht.");
  };
  const fmt = (s: string) => new Date(s).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="section">
      <h2>{isAgency ? "Verlauf & Nachrichten" : "Verlauf & Kontakt"}</h2>

      <form className="form-light" style={{ marginBottom: 18 }} onSubmit={add}>
        <div className="row-inline">
          {isAgency && (
            <>
              <div className="field" style={{ flex: 2 }}><label>Titel (optional)</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="field"><label>Typ</label>
                <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
                  {["update", "note", "milestone"].map((v) => <option key={v} value={v}>{CATS[v]}</option>)}
                </select></div>
            </>
          )}
        </div>
        <div className="field"><label>{isAgency ? "Eintrag" : "Deine Nachricht an die Agentur"}</label>
          <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={isAgency ? "Was gibt es Neues für den Kunden?" : "Frage, Wunsch oder Feedback…"} /></div>
        <button className="btn btn-primary">{isAgency ? "In den Verlauf laden" : "Nachricht senden"}</button>
      </form>

      {items.length === 0 ? <div className="empty">Noch keine Einträge.</div> : (
        <div className="timeline">
          {items.map((u) => (
            <div key={u.id} className={`tl-item ${u.category === "message" ? "message" : ""}`}>
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
