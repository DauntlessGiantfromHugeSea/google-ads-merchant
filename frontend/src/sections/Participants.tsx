import { useEffect, useMemo, useState } from "react";
import { Participant, ParticipantsStatus, api } from "../api";
import { useToast } from "../toast";

const ST: Record<string, string> = { new: "neu", confirmed: "bestätigt", cancelled: "storniert" };
const stCls = (s: string) => s === "confirmed" ? "st-aktiv" : s === "cancelled" ? "st-pausiert" : "st-lead";

export default function Participants({ clientId, clientName, isAgency }:
  { clientId: string; clientName: string; isAgency: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState<ParticipantsStatus | null>(null);
  const [list, setList] = useState<Participant[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState("");
  const [showGuide, setShowGuide] = useState(false);

  const load = () => {
    api.participantsStatus(clientId).then(setStatus).catch(() => {});
    api.participants(clientId).then(setList).catch(() => {});
  };
  useEffect(() => { load(); }, [clientId]);

  const enable = async (on: boolean) => { setStatus(await api.enableParticipants(clientId, on)); toast(on ? "Teilnehmermanagement aktiv." : "Deaktiviert."); };
  const rotate = async () => { if (!confirm("Neue Webhook-URL erzeugen? Die alte wird ungültig.")) return; setStatus(await api.rotateParticipantToken(clientId)); toast("Neue URL erzeugt."); };
  const setStat = async (p: Participant, s: string) => { await api.updateParticipant(clientId, p.id, { status: s }); setList((x) => x.map((y) => (y.id === p.id ? { ...y, status: s } : y))); };
  const del = async (p: Participant) => { if (!confirm("Teilnehmer löschen?")) return; await api.deleteParticipant(clientId, p.id); setList((x) => x.filter((y) => y.id !== p.id)); };
  const copy = () => { if (status?.webhook_url) { navigator.clipboard.writeText(status.webhook_url); toast("Webhook-URL kopiert."); } };

  const forms = useMemo(() => Array.from(new Set(list.map((p) => p.form_name).filter(Boolean))), [list]);
  const filtered = useMemo(() => list
    .filter((p) => (form ? p.form_name === form : true))
    .filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase())), [list, q, form]);
  const extraFields = (p: Participant) => Object.entries(p.data || {})
    .filter(([k]) => !k.startsWith("_") && !["your-name", "your-email", "form_name"].includes(k))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);

  if (!status) return <div className="section"><div className="empty">Lädt…</div></div>;

  // Kunde ohne Freischaltung: nichts zeigen
  if (!isAgency && !status.enabled) return <div className="section"><div className="empty">Teilnehmermanagement ist nicht aktiv.</div></div>;

  return (
    <>
      {isAgency && (
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2>Teilnehmermanagement</h2>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={status.enabled} onChange={(e) => enable(e.target.checked)} /> aktiv
            </label>
          </div>
          {status.enabled ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Eigene Webhook-URL dieses Kunden – auf der WordPress-Seite in Contact Form 7 als Webhook eintragen.</p>
              <div className="field"><label>Webhook-URL</label>
                <input className="input form-light" readOnly value={status.webhook_url} onFocus={(e) => e.currentTarget.select()} /></div>
              <div className="row-inline" style={{ marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={copy}>URL kopieren</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowGuide((s) => !s)}>{showGuide ? "Anleitung ausblenden" : "Einrichtung in WordPress"}</button>
                <button className="btn btn-ghost btn-sm" onClick={rotate}>Neue URL</button>
              </div>
              {showGuide && (
                <div className="card" style={{ marginTop: 12, boxShadow: "none", fontSize: 13 }}>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>In WordPress ein CF7-Webhook-Plugin installieren (z.B. <strong>„CF7 to Webhook"</strong> oder <strong>„Contact Form 7 to Any API"</strong>).</li>
                    <li>Beim betreffenden Formular als Webhook-Ziel die obige URL eintragen, Methode <strong>POST</strong>, Format <strong>JSON</strong> (form-encoded geht auch).</li>
                    <li>Optional ein verstecktes Feld <code>form_name</code> mit dem Event-/Formularnamen ergänzen – erscheint dann als Spalte.</li>
                    <li>Testeinsendung abschicken – sie taucht sofort unten in der Liste auf.</li>
                  </ol>
                  <div className="muted" style={{ marginTop: 8 }}>Erkannt werden E-Mail- und Namensfelder automatisch (z.B. <code>your-name</code>, <code>your-email</code>). Alle weiteren Felder werden mitgespeichert und exportiert.</div>
                </div>
              )}
            </>
          ) : (
            <p className="muted">Aktiviere die Funktion, um für diesen Kunden Anmeldungen aus Contact Form 7 zu sammeln.</p>
          )}
        </div>
      )}

      {status.enabled && (
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Teilnehmer <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>· {list.length}</span></h2>
            <div className="row-inline" style={{ alignItems: "center" }}>
              {forms.length > 1 && (
                <select className="select form-light" style={{ maxWidth: 180 }} value={form} onChange={(e) => setForm(e.target.value)}>
                  <option value="">Alle Formulare</option>
                  {forms.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
              <input className="input form-light search" placeholder="Name oder E-Mail…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={async () => { try { await api.downloadParticipantsCsv(clientId, clientName); } catch (err) { toast((err as Error).message, "err"); } }} disabled={list.length === 0}>CSV</button>
            </div>
          </div>

          {filtered.length === 0 ? <div className="empty">Noch keine Anmeldungen.</div> : filtered.map((p) => (
            <div key={p.id} className="list-row" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <strong>{p.name || "—"}</strong>
                {p.email && <span className="muted"> · {p.email}</span>}
                {p.form_name && <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>{p.form_name}</span>}
                <div className="muted" style={{ fontSize: 12 }}>
                  {new Date(p.created_at).toLocaleString("de-DE")}
                  {extraFields(p).length > 0 && ` · ${extraFields(p).join(" · ")}`}
                </div>
              </div>
              <div className="row-inline" style={{ alignItems: "center" }}>
                {isAgency ? (
                  <select className="select form-light" style={{ maxWidth: 140, padding: "6px 8px" }} value={p.status} onChange={(e) => setStat(p, e.target.value)}>
                    <option value="new">neu</option><option value="confirmed">bestätigt</option><option value="cancelled">storniert</option>
                  </select>
                ) : <span className={`status-badge ${stCls(p.status)}`}>{ST[p.status] || p.status}</span>}
                {isAgency && <button className="del" onClick={() => del(p)}>löschen</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
