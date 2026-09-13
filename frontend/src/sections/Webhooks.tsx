import { useEffect, useState } from "react";
import { ClientWebhookRow, api } from "../api";
import { useToast } from "../toast";

export default function Webhooks({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<ClientWebhookRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const load = () => api.webhooks(clientId).then(setRows).catch(() => setRows([]));
  useEffect(() => { if (isAgency) load(); }, [clientId, isAgency]);

  if (!isAgency) return null;          // Meldungen sieht der Kunde im Protokoll
  if (!rows) return null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = label.trim() || "Webhook";
    try { const w = await api.createWebhook(clientId, name, true); setRows((r) => [...(r || []), w]); setLabel(""); toast(`„${w.label}“ angelegt.`); }
    catch (err) { toast((err as Error).message, "err"); }
  };
  const copy = (url: string) => { navigator.clipboard.writeText(url); toast("URL kopiert."); };
  const rename = async (w: ClientWebhookRow) => {
    const name = prompt("Name des Webhooks", w.label); if (name == null) return;
    const u = await api.patchWebhook(clientId, w.id, { label: name }); setRows((r) => (r || []).map((x) => x.id === w.id ? u : x));
  };
  const toggleVis = async (w: ClientWebhookRow) => {
    const u = await api.patchWebhook(clientId, w.id, { client_visible: !w.client_visible });
    setRows((r) => (r || []).map((x) => x.id === w.id ? u : x));
  };
  const rotate = async (w: ClientWebhookRow) => {
    if (!confirm("Neue URL erzeugen? Die alte wird ungültig.")) return;
    const u = await api.rotateWebhook(clientId, w.id); setRows((r) => (r || []).map((x) => x.id === w.id ? u : x)); toast("Neue URL erzeugt.");
  };
  const del = async (w: ClientWebhookRow) => {
    if (!confirm(`Webhook „${w.label}“ löschen?`)) return;
    await api.deleteWebhook(clientId, w.id); setRows((r) => (r || []).filter((x) => x.id !== w.id)); toast("Gelöscht.");
  };
  const fmt = (s: string) => s ? new Date(s).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>Schnittstellen (Webhooks)</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowGuide((s) => !s)}>{showGuide ? "Hilfe ausblenden" : "Wie funktioniert das?"}</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Lege pro Dienst einen Webhook an (z. B. Synology-NAS, Uptime-Monitor, Backup-Skript). Jeder bekommt eine eigene
        URL – dort eingehende Meldungen landen im Protokoll dieses Kunden und du wirst benachrichtigt.
      </p>

      {showGuide && (
        <div className="card" style={{ marginBottom: 12, boxShadow: "none", fontSize: 13 }}>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Unten einen Namen eingeben (z. B. „Synology-NAS") und <strong>Anlegen</strong>.</li>
            <li>Die erzeugte <strong>URL kopieren</strong> und im jeweiligen Dienst als Webhook/Benachrichtigung eintragen (Methode <strong>POST</strong>).</li>
            <li>Der Dienst darf JSON (<code>{`{"text":"..."}`}</code>), Formulardaten oder reinen Text senden – alles wird erkannt.</li>
            <li>Eingehende Meldungen erscheinen im <strong>Protokoll</strong>; mit dem Auge-Schalter steuerst du, ob der Kunde sie sieht.</li>
          </ol>
        </div>
      )}

      {rows.length === 0 ? <div className="empty">Noch keine Webhooks.</div> : (
        <div>
          {rows.map((w) => (
            <div key={w.id} className="list-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
                  <strong>{w.label}</strong>
                  <button className="btn btn-ghost btn-xs" onClick={() => rename(w)}>umbenennen</button>
                </div>
                <input className="input form-light" readOnly value={w.url} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 4, fontSize: 12 }} />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {w.last_event_at ? `Letzte Meldung: ${fmt(w.last_event_at)} – ${w.last_text}` : "Noch keine Meldung empfangen."}
                </div>
              </div>
              <div className="row-inline" style={{ alignItems: "center", gap: 6 }}>
                <label className="muted" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }} title="Für Kunde im Protokoll sichtbar">
                  <input type="checkbox" checked={w.client_visible} onChange={() => toggleVis(w)} /> sichtbar
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(w.url)}>Kopieren</button>
                <button className="btn btn-ghost btn-sm" onClick={() => rotate(w)}>Neue URL</button>
                <button className="del" onClick={() => del(w)}>löschen</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form className="row-inline" style={{ marginTop: 12 }} onSubmit={add}>
        <input className="input form-light" placeholder="Name (z. B. Synology-NAS)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ maxWidth: 260 }} />
        <button className="btn btn-primary btn-sm">Anlegen</button>
      </form>
    </div>
  );
}
