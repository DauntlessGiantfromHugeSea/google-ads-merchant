import { useEffect, useState } from "react";
import { Monitor, MonitorEvent, api } from "../api";
import { useToast } from "../toast";

const dot = (s: string) => s === "down" ? "due-red" : s === "up" ? "due-green" : "due-none";
const label = (s: string) => s === "down" ? "offline" : s === "up" ? "online" : "wartet";

export default function Monitoring({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [mine, setMine] = useState<Monitor[]>([]);
  const [all, setAll] = useState<Monitor[]>([]);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [pick, setPick] = useState("");

  const load = () => {
    api.clientMonitors(clientId).then(setMine).catch(() => {});
    api.clientMonitorEvents(clientId).then(setEvents).catch(() => {});
    if (isAgency) api.monitors().then(setAll).catch(() => {});
  };
  useEffect(() => { load(); }, [clientId]);

  const assign = async (id: string) => { await api.assignMonitor(id, clientId); setPick(""); load(); toast("Monitor zugeordnet."); };
  const unassign = async (m: Monitor) => { await api.assignMonitor(m.id, null); load(); toast("Zuordnung gelöst."); };
  const del = async (m: Monitor) => { if (!confirm(`Monitor „${m.name}" löschen?`)) return; await api.deleteMonitor(m.id); load(); toast("Monitor gelöscht."); };
  const fmt = (s: string) => new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  const unassigned = all.filter((m) => m.client_id !== clientId);

  return (
    <>
      <div className="section">
        <h2>Website-Monitoring</h2>
        {mine.length === 0 ? <div className="empty">Diesem Kunden ist noch kein Monitor zugeordnet.</div> : mine.map((m) => (
          <div key={m.id} className="list-row">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`due-dot ${dot(m.status)}`} />
              <div><strong>{m.name}</strong><div className="muted" style={{ fontSize: 12 }}>{m.url}{m.message ? ` · ${m.message}` : ""}</div></div>
            </div>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <span className={`status-badge ${m.status === "down" ? "st-pausiert" : m.status === "up" ? "st-aktiv" : "st-beendet"}`}>{label(m.status)}</span>
              {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => unassign(m)}>lösen</button>}
              {isAgency && <button className="del" onClick={() => del(m)}>löschen</button>}
            </div>
          </div>
        ))}
        {isAgency && unassigned.length > 0 && (
          <div className="row-inline form-light" style={{ marginTop: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1 }}><label>Monitor zuordnen</label>
              <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">— auswählen —</option>
                {unassigned.map((m) => <option key={m.id} value={m.id}>{m.name} ({label(m.status)}){m.client_name ? ` · aktuell: ${m.client_name}` : ""}</option>)}
              </select></div>
            <button className="btn btn-primary" disabled={!pick} onClick={() => assign(pick)}>Zuordnen</button>
          </div>
        )}
        {isAgency && (
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Monitore kommen aus Uptime Kuma (Webhook in den Einstellungen). Uptime meldet bei Status-Wechsel – der Test-Eintrag lässt sich hier löschen.
          </div>
        )}
      </div>

      <div className="section">
        <h2>Verlauf</h2>
        {events.length === 0 ? <div className="empty">Noch keine Ereignisse.</div> : (
          <div className="timeline">
            {events.map((e) => (
              <div key={e.id} className="tl-item">
                <span style={{ position: "absolute", left: -20, top: 4, width: 11, height: 11, borderRadius: "50%",
                  background: e.status === "down" ? "#f87171" : e.status === "up" ? "#34d399" : "#565b6b", border: "2px solid #0a0a0e" }} />
                <div className="tl-title">{e.name} · {label(e.status)}</div>
                <div className="tl-meta">{fmt(e.created_at)}{e.message ? ` · ${e.message}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
