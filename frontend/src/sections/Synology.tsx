import { useEffect, useState } from "react";
import { SynologyStatus, api } from "../api";
import { useToast } from "../toast";

export default function Synology({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [st, setSt] = useState<SynologyStatus | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => { if (isAgency) api.synologyStatus(clientId).then(setSt).catch(() => {}); }, [clientId, isAgency]);

  if (!isAgency) return null;               // Meldungen sieht der Kunde im Protokoll
  if (!st) return null;

  const enable = async (on: boolean) => { setSt(await api.synologyEnable(clientId, on)); toast(on ? "Synology-Webhook aktiv." : "Deaktiviert."); };
  const setVisible = async (v: boolean) => { setSt(await api.synologySettings(clientId, v)); toast("Gespeichert."); };
  const rotate = async () => { if (!confirm("Neue Webhook-URL erzeugen? Die alte wird ungültig.")) return; setSt(await api.synologyRotate(clientId)); toast("Neue URL erzeugt."); };
  const copy = () => { if (st.webhook_url) { navigator.clipboard.writeText(st.webhook_url); toast("URL kopiert."); } };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>Synology-NAS</h2>
        <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={st.enabled} onChange={(e) => enable(e.target.checked)} /> aktiv
        </label>
      </div>

      {!st.enabled ? (
        <p className="muted" style={{ marginTop: 0 }}>Aktivieren, um Status-Updates dieses Kunden-NAS als Protokoll-Eintrag zu empfangen.</p>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Diese URL im DSM des NAS als Webhook-Benachrichtigung eintragen. Jede Meldung landet im Protokoll und du wirst benachrichtigt.</p>
          <div className="field"><label>Webhook-URL</label>
            <input className="input form-light" readOnly value={st.webhook_url} onFocus={(e) => e.currentTarget.select()} /></div>
          <div className="row-inline" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={copy}>URL kopieren</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowGuide((s) => !s)}>{showGuide ? "Anleitung ausblenden" : "Einrichtung in DSM"}</button>
            <button className="btn btn-ghost btn-sm" onClick={rotate}>Neue URL</button>
          </div>

          <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 12 }}>
            <input type="checkbox" checked={st.client_visible} onChange={(e) => setVisible(e.target.checked)} />
            Meldungen für den Kunden im Protokoll sichtbar
          </label>

          {showGuide && (
            <div className="card" style={{ marginTop: 12, boxShadow: "none", fontSize: 13 }}>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Im DSM: <strong>Systemsteuerung → Benachrichtigung → Webhook</strong> (bzw. „Push-Dienst").</li>
                <li><strong>Hinzufügen</strong>, Anbieter <strong>Benutzerdefiniert</strong>. URL oben einfügen, Methode <strong>POST</strong>.</li>
                <li>Content-Type <strong>application/json</strong>, im Text/Body z. B.: <code>{`{"title":"@@TITLE@@","text":"@@TEXT@@"}`}</code> (Platzhalter je nach DSM-Version; reiner Text geht auch).</li>
                <li>Bei <strong>Regeln</strong> festlegen, welche Ereignisse gesendet werden (z. B. Speicher, Backup, S.M.A.R.T.).</li>
                <li>Testnachricht senden – sie erscheint im Protokoll dieses Kunden.</li>
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}
