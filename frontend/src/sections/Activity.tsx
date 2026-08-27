import { useEffect, useState } from "react";
import { ActivityEntry, api } from "../api";
import { useToast } from "../toast";

const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
// Wert für <input type="datetime-local"> = lokale Zeit ohne Sekunden/Zone.
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function Activity({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [at, setAt] = useState(nowLocal());
  const [visible, setVisible] = useState(true);

  const load = () => api.activity(clientId).then(setRows).catch(() => {}).finally(() => setLoaded(true));
  useEffect(() => { load(); }, [clientId]);

  // Kunde ohne Einträge: Block ausblenden.
  if (!isAgency && loaded && rows.length === 0) return null;

  const add = async () => {
    if (!text.trim()) return;
    try {
      await api.addActivity(clientId, { text, occurred_at: new Date(at).toISOString(), client_visible: visible });
      setText(""); setAt(nowLocal()); load(); toast("Eintrag gespeichert.");
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const del = async (id: string) => { if (!confirm("Eintrag löschen?")) return; await api.deleteActivity(clientId, id); load(); };
  const toggleVis = async (e: ActivityEntry) => { await api.editActivity(clientId, e.id, { client_visible: !e.client_visible }); load(); };

  return (
    <div className="section">
      <div><h2 style={{ marginBottom: 2 }}>Protokoll</h2>
        <div className="muted" style={{ fontSize: 13 }}>
          {isAgency ? "Was wurde wann gemacht – manuell + automatische Systemeinträge (z. B. WordPress-Updates)." : "Was an deiner Website gemacht wurde."}
        </div></div>

      {isAgency && (
        <div className="card form-light" style={{ marginTop: 12, boxShadow: "none" }}>
          <div className="field"><label>Was hast du gemacht?</label>
            <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Startseite überarbeitet, Plugin XY konfiguriert …" /></div>
          <div className="row-inline" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0 }}><label>Datum & Uhrzeit</label>
              <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></div>
            <label className="ki-check" style={{ marginTop: 18 }}>
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
              <span>für Kunde sichtbar</span>
            </label>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 18 }} onClick={add}>Eintragen</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {loaded && rows.length === 0 ? <div className="empty sm">Noch keine Einträge.</div> : (
          <div className="timeline">
            {rows.map((e) => (
              <div key={e.id} className={`tl-item ${e.source === "system" ? "message" : ""}`}>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                  {e.source === "system" ? "⚙️ " : ""}{e.text}
                </div>
                <div className="tl-meta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{when(e.occurred_at)} · {e.author}</span>
                  {isAgency && !e.client_visible && <span className="tag" style={{ fontSize: 10 }}>nur intern</span>}
                  {isAgency && (
                    <>
                      <button className="chk-toggle" onClick={() => toggleVis(e)}>{e.client_visible ? "intern setzen" : "für Kunde freigeben"}</button>
                      <button className="chat-del" title="löschen" onClick={() => del(e.id)}>×</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
