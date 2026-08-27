import { useEffect, useState } from "react";
import { WpUpdate, api } from "../api";
import { useToast } from "../toast";

const TYPE_LABEL: Record<string, string> = { core: "WordPress-Core", plugin: "Plugin", theme: "Theme" };
const typeCls = (t: string) => (t === "core" ? "st-pausiert" : t === "theme" ? "st-lead" : "st-aktiv");

export default function WpUpdates({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [updates, setUpdates] = useState<WpUpdate[]>([]);
  const [hasSite, setHasSite] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hook, setHook] = useState<{ url: string; has_secret: boolean } | null>(null);
  const [setup, setSetup] = useState(false);
  const [secret, setSecret] = useState("");

  useEffect(() => {
    api.wpClient(clientId).then((d) => { setUpdates(d.updates); setHasSite(d.has_site); setLoaded(true); }).catch(() => setLoaded(true));
    if (isAgency) api.wpWebhookUrl().then(setHook).catch(() => {});
  }, [clientId]);

  // Kunde ohne fällige Updates: nicht anzeigen (kein leerer Block).
  if (!isAgency && (!loaded || updates.length === 0)) return null;

  const saveSecret = async () => { try { const r = await api.wpSetSecret(secret); setHook((h) => h && { ...h, has_secret: r.has_secret }); toast("Signatur-Secret gespeichert."); } catch (e) { toast((e as Error).message, "err"); } };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><h2 style={{ marginBottom: 2 }}>WordPress-Updates</h2>
          <div className="muted" style={{ fontSize: 13 }}>Fällige Updates dieser Website{updates.length ? ` · ${updates.length} offen` : ""}.</div></div>
        {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => setSetup((s) => !s)}>{setup ? "Einrichtung ausblenden" : "Webhook einrichten"}</button>}
      </div>

      {isAgency && setup && (
        <div className="card form-light" style={{ marginTop: 12, boxShadow: "none" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Trage diese URL in WPMonitor als Webhook-Ziel ein (POST, JSON). Sie gilt fürs ganze Konto –
            North Flow ordnet jede Seite über die Domain dem passenden Kunden zu (dafür beim Kunden die <strong>Website</strong> hinterlegen).
          </div>
          <div className="field"><label>Webhook-URL</label>
            <input className="input" readOnly value={hook?.url || "…"} onFocus={(e) => e.currentTarget.select()} /></div>
          <div className="field"><label>Signatur-Secret (optional)</label>
            <div className="row-inline" style={{ gap: 8 }}>
              <input className="input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hook?.has_secret ? "gesetzt – zum Ändern neu eingeben" : "zufällige Zeichenkette"} />
              <button className="btn btn-ghost btn-sm" onClick={saveSecret}>Speichern</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Wenn in WPMonitor dasselbe Secret gesetzt ist, prüfen wir die Signatur (X-WPUD-Signature).</div>
          </div>
        </div>
      )}

      {!hasSite && isAgency && (
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Hinweis: Für die Zuordnung bitte beim Kunden die Website-Adresse hinterlegen (Kontakt).</div>
      )}

      {loaded && updates.length === 0 ? (
        <div className="empty sm" style={{ marginTop: 10 }}>Keine fälligen Updates. ✅</div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {updates.map((u) => (
            <div key={u.id} className="list-row">
              <div style={{ minWidth: 0 }}>
                <span className={`status-badge ${typeCls(u.type)}`} style={{ marginRight: 8 }}>{TYPE_LABEL[u.type] || u.type}</span>
                <strong>{u.name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {u.installed && u.latest ? `${u.installed} → ${u.latest}` : u.latest || "Update verfügbar"}
                  {u.first_seen ? ` · seit ${u.first_seen.slice(0, 10)}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
