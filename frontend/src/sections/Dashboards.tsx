import { useEffect, useState } from "react";
import { Dashboard, api } from "../api";
import { useToast } from "../toast";

export default function Dashboards({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<Dashboard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const load = () => api.clientDashboards(clientId).then((d) => { setItems(d); setLoaded(true); }).catch(() => setLoaded(true));
  useEffect(() => { load(); }, [clientId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createDashboard(clientId, { label, url });
      setLabel(""); setUrl(""); setAdding(false); load();
      toast("Dashboard hinzugefügt.");
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const del = async (d: Dashboard) => {
    if (!confirm(`„${d.label}" entfernen?`)) return;
    await api.deleteDashboard(clientId, d.id); load();
  };

  // Kunden ohne Dashboards: Abschnitt gar nicht zeigen.
  if (loaded && items.length === 0 && !isAgency) return null;

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Live-Auswertung</h2>
          <div className="muted" style={{ fontSize: 13 }}>Eingebettete Analytics – immer aktuell.</div>
        </div>
        {isAgency && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding((s) => !s)}>
            {adding ? "Abbrechen" : "+ Dashboard"}
          </button>
        )}
      </div>

      {adding && (
        <form className="form-light" onSubmit={add} style={{ marginTop: 12 }}>
          <div className="row-inline">
            <div className="field" style={{ flex: 1 }}><label>Bezeichnung</label>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Google Analytics" /></div>
            <div className="field" style={{ flex: 2 }}><label>Embed-Link (z. B. Looker Studio)</label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://lookerstudio.google.com/…" required /></div>
            <button className="btn btn-primary">Hinzufügen</button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Tipp: In Looker Studio den Report freigeben → „Bericht einbetten". Freigabelinks werden automatisch umgewandelt.
          </p>
        </form>
      )}

      {loaded && items.length === 0 ? (
        <div className="empty sm">Noch kein Dashboard hinterlegt.</div>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 18 }}>
          {items.map((d) => (
            <div key={d.id}>
              <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong>{d.label}</strong>
                <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
                  <a className="btn btn-ghost btn-sm" href={d.url} target="_blank" rel="noreferrer">↗ öffnen</a>
                  {isAgency && <button className="del" onClick={() => del(d)}>entfernen</button>}
                </div>
              </div>
              <div className="embed-frame">
                <iframe src={d.url} title={d.label} loading="lazy"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  referrerPolicy="no-referrer-when-downgrade" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
