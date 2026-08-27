import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Client, WpSiteRow, api } from "../api";
import { useToast } from "../toast";

export default function WpMonitor() {
  const toast = useToast();
  const navigate = useNavigate();
  const [sites, setSites] = useState<WpSiteRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [hook, setHook] = useState<{ url: string; has_secret: boolean } | null>(null);
  const [secret, setSecret] = useState("");
  const [setup, setSetup] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => api.wpSites().then(setSites).catch(() => {}).finally(() => setLoaded(true));
  useEffect(() => {
    load();
    api.clients().then(setClients).catch(() => {});
    api.wpWebhookUrl().then(setHook).catch(() => {});
  }, []);

  const assign = async (host: string, clientId: string) => {
    setSites((s) => s.map((x) => (x.host === host ? { ...x, client_id: clientId || null } : x)));
    try { await api.wpAssignSite(host, clientId || null); toast("Zuordnung gespeichert."); }
    catch (e) { toast((e as Error).message, "err"); load(); }
  };
  const saveSecret = async () => { try { const r = await api.wpSetSecret(secret); setHook((h) => h && { ...h, has_secret: r.has_secret }); setSecret(""); toast("Secret gespeichert."); } catch (e) { toast((e as Error).message, "err"); } };

  const totalPending = useMemo(() => sites.reduce((n, s) => n + s.pending, 0), [sites]);
  const clientOpts = [...clients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><h1 style={{ marginBottom: 2 }}>WordPress-Monitor</h1>
          <div className="muted" style={{ fontSize: 13 }}>Alle gemeldeten Seiten · {sites.length} Seiten · {totalPending} offene Updates</div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => setSetup((s) => !s)}>{setup ? "Einrichtung ausblenden" : "Webhook einrichten"}</button>
      </div>

      {setup && (
        <div className="section form-light" style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Diese <strong>eine</strong> URL in WPMonitor als Webhook-Ziel eintragen (POST, JSON). Alle Seiten laufen darüber;
            unten ordnest du jede Seite einem Kunden zu (Domains mit hinterlegter Kunden-Website werden automatisch vorbelegt).
          </div>
          <div className="field"><label>Webhook-URL (fürs ganze Konto)</label>
            <input className="input" readOnly value={hook?.url || "…"} onFocus={(e) => e.currentTarget.select()} /></div>
          <div className="field"><label>Signatur-Secret (optional)</label>
            <div className="row-inline" style={{ gap: 8 }}>
              <input className="input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hook?.has_secret ? "gesetzt – zum Ändern neu eingeben" : "zufällige Zeichenkette"} />
              <button className="btn btn-ghost btn-sm" onClick={saveSecret}>Speichern</button>
            </div>
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop: 12 }}>
        {loaded && sites.length === 0 ? (
          <div className="empty">Noch keine Seiten gemeldet. Sobald WPMonitor an die Webhook-URL sendet, erscheinen sie hier.</div>
        ) : (
          sites.map((s) => (
            <div key={s.host} className="list-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{s.site || s.host}</strong>
                {s.pending > 0
                  ? <span className="badge-count" style={{ marginLeft: 8 }}>{s.pending}</span>
                  : <span className="status-badge st-aktiv" style={{ marginLeft: 8 }}>aktuell</span>}
                <div className="muted" style={{ fontSize: 12 }}>{s.host}</div>
              </div>
              <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
                <select className="select form-light" style={{ maxWidth: 220, padding: "6px 8px" }}
                  value={s.client_id || ""} onChange={(e) => assign(s.host, e.target.value)}>
                  <option value="">— keinem Kunden —</option>
                  {clientOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {s.client_id && <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/clients/${s.client_id}`)}>öffnen</button>}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
