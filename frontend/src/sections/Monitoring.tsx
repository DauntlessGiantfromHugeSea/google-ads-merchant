import { useEffect, useState } from "react";
import { Monitor, MonitorEvent, api } from "../api";
import { useToast } from "../toast";

const dot = (s: string) => s === "down" ? "due-red" : s === "up" ? "due-green" : "due-none";
const label = (s: string) => s === "down" ? "offline" : s === "up" ? "online" : "wartet";

export default function Monitoring({ clientId, clientName, isAgency }:
  { clientId: string; clientName: string; isAgency: boolean }) {
  const toast = useToast();
  const [mine, setMine] = useState<Monitor[]>([]);
  const [all, setAll] = useState<Monitor[]>([]);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.clientMonitors(clientId).then(setMine).catch(() => {});
    api.clientMonitorEvents(clientId).then(setEvents).catch(() => {});
    if (isAgency) api.monitors().then(setAll).catch(() => {});
  };
  useEffect(() => { load(); }, [clientId]);

  const toggle = async (m: Monitor, checked: boolean) => {
    await api.assignMonitor(m.id, checked ? clientId : null);
    load(); toast(checked ? "Zugeordnet." : "Zuordnung gelöst.");
  };
  const del = async (m: Monitor) => { if (!confirm(`Monitor „${m.name}“ löschen?`)) return; await api.deleteMonitor(m.id); load(); toast("Monitor gelöscht."); };
  const fmt = (s: string) => new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  const report = async () => {
    setBusy(true);
    try { await api.downloadMonitoringReport(clientId, days, clientName); }
    catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); }
  };

  const anyDown = mine.some((m) => m.status === "down");
  const hasMonitors = mine.length > 0;

  return (
    <>
      {/* Status-Überblick */}
      {hasMonitors && (
        <div className="section" style={{ borderLeft: `3px solid ${anyDown ? "#f87171" : "#34d399"}` }}>
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{anyDown ? "⚠️ Es gibt eine Störung" : "✓ Alle Systeme online"}</h2>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <select className="select form-light" style={{ maxWidth: 160 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>Letzte 7 Tage</option>
                <option value={30}>Letzte 30 Tage</option>
                <option value={90}>Letzte 90 Tage</option>
                <option value={365}>Letzte 12 Monate</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={report} disabled={busy}>{busy ? "…" : "Report als PDF"}</button>
            </div>
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            {mine.map((m) => (
              <div key={m.id} className="card" style={{ boxShadow: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`due-dot ${dot(m.status)}`} />
                  <strong>{m.name}</strong>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{m.url}</div>
                <span className={`status-badge ${m.status === "down" ? "st-pausiert" : m.status === "up" ? "st-aktiv" : "st-beendet"}`} style={{ marginTop: 8 }}>{label(m.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agentur: Monitore zuordnen */}
      {isAgency && (
        <div className="section">
          <h2>Monitore zuordnen</h2>
          {all.length === 0 ? <div className="empty">Noch keine Monitore. Webhook in den Einstellungen einrichten.</div> : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Hake alle Monitore an, die zu diesem Kunden gehören (mehrere möglich).</p>
              {all.map((m) => (
                <div key={m.id} className="todo" style={{ alignItems: "center" }}>
                  <input className="todo-check" type="checkbox" checked={m.client_id === clientId} onChange={(e) => toggle(m, e.target.checked)} />
                  <div className="todo-body" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`due-dot ${dot(m.status)}`} />
                    <div>
                      <div className="todo-title">{m.name} <span className="muted" style={{ fontSize: 12 }}>· {label(m.status)}</span></div>
                      <div className="todo-sub">{m.url}{m.client_id && m.client_id !== clientId ? ` · aktuell: ${m.client_name}` : ""}</div>
                    </div>
                  </div>
                  <button className="del" onClick={() => del(m)}>löschen</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {!isAgency && !hasMonitors && <div className="section"><div className="empty">Kein Monitoring aktiv.</div></div>}

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
