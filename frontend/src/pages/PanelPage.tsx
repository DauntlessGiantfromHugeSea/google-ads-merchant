import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Client, PanelClientRow, PanelSiteAdmin, api } from "../api";
import { useToast } from "../toast";

const dot = (up: string) => up === "up" ? "#34d399" : up === "down" ? "#ef4444" : "#9aa0a6";

export default function PanelPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [sites, setSites] = useState<PanelSiteAdmin[]>([]);
  const [pClients, setPClients] = useState<PanelClientRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    api.panelSites().then(setSites).catch(() => {}).finally(() => setLoaded(true));
    api.panelClients().then(setPClients).catch(() => {});
  };
  useEffect(() => { load(); api.clients().then(setClients).catch(() => {}); }, []);

  const assign = async (pcid: number, nf: string) => {
    setPClients((p) => p.map((x) => x.panel_client_id === pcid ? { ...x, nf_client_id: nf || null } : x));
    try { await api.panelAssign(pcid, nf); toast("Zuordnung gespeichert."); }
    catch (e) { toast((e as Error).message, "err"); load(); }
  };
  const assignSite = async (sid: number, nf: string) => {
    setSites((arr) => arr.map((x) => x.id === sid ? { ...x, nf_client_id: nf || null } : x));
    try { await api.panelAssignSite(sid, nf); toast("Seite zugeordnet."); }
    catch (e) { toast((e as Error).message, "err"); load(); }
  };

  const totalPending = useMemo(() => sites.reduce((n, s) => n + (s.pending_updates || 0), 0), [sites]);
  const clientOpts = [...clients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="page-head"><h1 style={{ marginBottom: 2 }}>Website-Verwaltung</h1>
        <div className="muted" style={{ fontSize: 13 }}>NorthLab Control Panel · {sites.length} Seiten · {totalPending} offene Updates</div></div>

      {pClients.length > 0 && (
      <div className="section">
        <h2>Kunden-Zuordnung</h2>
        <p className="muted" style={{ marginTop: 0 }}>Ordne jeden Panel-Kunden einem Kunden im Tool zu – nur dann sieht dessen Login die eigenen Seiten.</p>
        {pClients.length === 0 ? <div className="empty">Noch keine Panel-Kunden empfangen.</div> : (
          <div>
            {pClients.map((pc) => (
              <div key={pc.panel_client_id} className="list-row" style={{ alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <strong>{pc.name || `Kunde #${pc.panel_client_id}`}</strong>
                  {pc.contact && <span className="muted"> · {pc.contact}</span>}
                  {pc.email && <span className="muted"> · {pc.email}</span>}
                </div>
                <select className="select" value={pc.nf_client_id || ""} onChange={(e) => assign(pc.panel_client_id, e.target.value)}>
                  <option value="">— nicht zugeordnet —</option>
                  {clientOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="section">
        <h2>Alle Seiten</h2>
        <p className="muted" style={{ marginTop: 0 }}>Ordne jede Seite direkt einem Kunden zu – dann sieht dessen Login die Seite unter „Website-Status".</p>
        {!loaded ? <div className="muted">Lädt…</div> : sites.length === 0 ? (
          <div className="empty">Noch keine Seiten empfangen. Sobald das Panel den ersten Snapshot sendet, erscheinen sie hier.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: 13 }}>
              <thead><tr>
                <th>Seite</th><th>Kunde</th><th>Status</th><th>Uptime</th><th>Offen</th><th>Security</th><th>WP / PHP</th>
              </tr></thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong><div className="muted" style={{ fontSize: 11 }}>{s.url}</div></td>
                    <td>
                      <select className="select" value={s.nf_client_id || ""} onChange={(e) => assignSite(s.id, e.target.value)}>
                        <option value="">— nicht zugeordnet —</option>
                        {clientOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: dot(s.uptime_status), display: "inline-block" }} />
                      {s.status || s.uptime_status}</span></td>
                    <td>{s.uptime_percent == null ? "–" : `${s.uptime_percent.toFixed(2)} %`}</td>
                    <td>{s.pending_updates}</td>
                    <td>{s.security_score == null ? "–" : `${s.security_score}`}</td>
                    <td>{s.wp_version || "–"} / {s.php_version || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>← Zum Dashboard</button>
    </>
  );
}
