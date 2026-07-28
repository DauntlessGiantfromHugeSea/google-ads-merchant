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

  const load = () => {
    api.clientMonitors(clientId).then(setMine).catch(() => {});
    api.clientMonitorEvents(clientId).then(setEvents).catch(() => {});
    if (isAgency) api.monitors().then(setAll).catch(() => {});
  };
  useEffect(() => { load(); }, [clientId]);

  const toggle = async (m: Monitor, checked: boolean) => {
    await api.assignMonitor(m.id, checked ? clientId : null);
    load();
    toast(checked ? "Zugeordnet." : "Zuordnung gelöst.");
  };
  const del = async (m: Monitor) => { if (!confirm(`Monitor „${m.name}" löschen?`)) return; await api.deleteMonitor(m.id); load(); toast("Monitor gelöscht."); };
  const fmt = (s: string) => new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <div className="section">
        <h2>Website-Monitoring</h2>

        {/* Agentur: Mehrfachauswahl – beliebig viele Monitore diesem Kunden zuordnen */}
        {isAgency ? (
          all.length === 0 ? <div className="empty">Noch keine Monitore. Webhook in den Einstellungen einrichten.</div> : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Hake alle Monitore an, die zu diesem Kunden gehören (mehrere möglich).</p>
              {all.map((m) => (
                <div key={m.id} className="todo" style={{ alignItems: "center" }}>
                  <input className="todo-check" type="checkbox" checked={m.client_id === clientId}
                    onChange={(e) => toggle(m, e.target.checked)} />
                  <div className="todo-body" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`due-dot ${dot(m.status)}`} />
                    <div>
                      <div className="todo-title">{m.name} <span className="muted" style={{ fontSize: 12 }}>· {label(m.status)}</span></div>
                      <div className="todo-sub">{m.url}
                        {m.client_id && m.client_id !== clientId ? ` · aktuell: ${m.client_name}` : ""}</div>
                    </div>
                  </div>
                  <button className="del" onClick={() => del(m)}>löschen</button>
                </div>
              ))}
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Monitore kommen aus Uptime Kuma (Webhook in den Einstellungen). Meldung erfolgt bei Status-Wechsel – Test-Einträge kannst du löschen.
              </div>
            </>
          )
        ) : (
          mine.length === 0 ? <div className="empty">Kein Monitoring aktiv.</div> : mine.map((m) => (
            <div key={m.id} className="list-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`due-dot ${dot(m.status)}`} />
                <div><strong>{m.name}</strong><div className="muted" style={{ fontSize: 12 }}>{m.url}</div></div>
              </div>
              <span className={`status-badge ${m.status === "down" ? "st-pausiert" : m.status === "up" ? "st-aktiv" : "st-beendet"}`}>{label(m.status)}</span>
            </div>
          ))
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
