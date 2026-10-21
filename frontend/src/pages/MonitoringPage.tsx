import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../toast";
import { Client, Monitor, api } from "../api";

const label = (s: string) => s === "down" ? "offline" : s === "up" ? "online" : "wartet";

export default function MonitoringPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState("");

  const load = () => { api.monitors().then(setMonitors).catch(() => {}); api.clients().then(setClients).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const down = monitors.filter((m) => m.status === "down").length;
  const unassigned = monitors.filter((m) => !m.client_id).length;
  const list = useMemo(() => monitors.filter((m) =>
    !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.url.toLowerCase().includes(q.toLowerCase())
      || (m.client_name || "").toLowerCase().includes(q.toLowerCase())), [monitors, q]);

  const assign = async (m: Monitor, cid: string) => {
    const upd = await api.assignMonitor(m.id, cid || null);
    setMonitors((ms) => ms.map((x) => (x.id === m.id ? upd : x)));
  };
  const del = async (m: Monitor) => { if (!confirm(`Monitor „${m.name}“ löschen?`)) return; await api.deleteMonitor(m.id); load(); };
  const importHistory = async (m: Monitor, file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const events = Array.isArray(data) ? data : (data.events || data.heartbeats || []);
      if (!Array.isArray(events) || events.length === 0) { toast("Keine Ereignisse in der Datei gefunden.", "err"); return; }
      const r = await api.importMonitorHistory(m.id, events);
      toast(`Importiert: ${r.imported} Statuswechsel (${r.events_seen} Punkte) · ${r.from.slice(0, 10)} bis ${r.to.slice(0, 10)}.`);
      load();
    } catch (e) { toast(`Import fehlgeschlagen: ${(e as Error).message}`, "err"); }
  };

  return (
    <>
      <div className="hero">
        <h1>Monitoring</h1>
        <div className="sub">Alle Website-Monitore (Uptime Kuma) über alle Kunden.</div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="v">{monitors.length}</div><div className="l">Monitore</div></div>
          <div className="hero-stat"><div className="v">{down}</div><div className="l">Offline</div></div>
          <div className="hero-stat"><div className="v">{unassigned}</div><div className="l">Ohne Kunde</div></div>
        </div>
      </div>

      <div className="row-inline" style={{ marginBottom: 16 }}>
        <input className="input form-light search" placeholder="Monitor, URL oder Kunde suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="section">
        {monitors.length === 0 ? (
          <div className="empty">Noch keine Monitore. Webhook in den Einstellungen einrichten.</div>
        ) : list.map((m) => (
          <div key={m.id} className="list-row">
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className={`due-dot ${m.status === "down" ? "due-red" : m.status === "up" ? "due-green" : "due-none"}`} />
              <div style={{ minWidth: 0 }}>
                <strong>{m.name}</strong>
                {m.client_name && <span className="muted" style={{ cursor: "pointer" }} onClick={() => m.client_id && navigate(`/clients/${m.client_id}`)}> · {m.client_name}</span>}
                <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.url}{m.message ? ` · ${m.message}` : ""}</div>
              </div>
            </div>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <select className="select form-light" style={{ maxWidth: 170, padding: "6px 8px" }} value={m.client_id || ""} onChange={(e) => assign(m, e.target.value)}>
                <option value="">— Kunde zuordnen —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className={`status-badge ${m.status === "down" ? "st-pausiert" : m.status === "up" ? "st-aktiv" : "st-beendet"}`}>{label(m.status)}</span>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }} title="Historische Uptime-Daten (JSON) importieren">Historie
                <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importHistory(m, f); e.currentTarget.value = ""; }} /></label>
              <button className="del" onClick={() => del(m)}>löschen</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
