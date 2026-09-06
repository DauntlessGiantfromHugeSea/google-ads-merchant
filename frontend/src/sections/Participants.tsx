import { useEffect, useMemo, useState } from "react";
import { Participant, ParticipantsStatus, api } from "../api";
import { useToast } from "../toast";

const ST: Record<string, string> = { new: "neu", confirmed: "bestätigt", cancelled: "storniert" };
const stCls = (s: string) => s === "confirmed" ? "st-aktiv" : s === "cancelled" ? "st-pausiert" : "st-lead";
const prettyKey = (k: string) => k.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
const showVal = (v: unknown) => Array.isArray(v) ? v.join(", ") : v === "1" ? "ja" : v === "0" || v === "" ? "–" : String(v);
// Alle vom Formular gesendeten Felder (ohne interne _-Felder), in Reihenfolge.
const allFields = (p: { data: Record<string, unknown> }): [string, unknown][] =>
  Object.entries(p.data || {}).filter(([k]) => !k.startsWith("_") && k !== "form_name");

export default function Participants({ clientId, clientName, isAgency }:
  { clientId: string; clientName: string; isAgency: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState<ParticipantsStatus | null>(null);
  const [list, setList] = useState<Participant[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [nEnabled, setNEnabled] = useState(true);
  const [nAgency, setNAgency] = useState(true);
  const [nClient, setNClient] = useState(false);
  const [nEmail, setNEmail] = useState("");
  const [incFields, setIncFields] = useState(false);
  const [incLink, setIncLink] = useState(true);
  const [cEnabled, setCEnabled] = useState(false);
  const [cSubject, setCSubject] = useState("");
  const [cText, setCText] = useState("");
  const [cFrom, setCFrom] = useState("");
  const [logoV, setLogoV] = useState(0);

  const load = () => {
    api.participantsStatus(clientId).then(setStatus).catch(() => {});
    api.participants(clientId).then(setList).catch(() => {});
  };
  useEffect(() => { load(); }, [clientId]);
  useEffect(() => { if (status) { setNEnabled(status.notify_enabled); setNAgency(status.notify_agency); setNClient(status.notify_client); setNEmail(status.notify_email); setIncFields(status.include_fields); setIncLink(status.include_link); } }, [status?.notify_enabled, status?.notify_agency, status?.notify_client, status?.notify_email, status?.include_fields, status?.include_link]);
  useEffect(() => { if (status) { setCEnabled(status.confirm_enabled); setCSubject(status.confirm_subject); setCText(status.confirm_text); setCFrom(status.from_addr); } }, [status?.confirm_enabled, status?.confirm_subject, status?.confirm_text, status?.from_addr]);

  const enable = async (on: boolean) => { setStatus(await api.enableParticipants(clientId, on)); toast(on ? "Webhook aktiv." : "Deaktiviert."); };
  const saveNotify = async () => { setStatus(await api.setWebhookNotify(clientId, { notify_enabled: nEnabled, notify_agency: nAgency, notify_client: nClient, notify_email: nEmail.trim(), include_fields: incFields, include_link: incLink })); toast("Benachrichtigung gespeichert."); };
  const saveConfirm = async () => { setStatus(await api.setWebhookConfirm(clientId, { confirm_enabled: cEnabled, confirm_subject: cSubject.trim(), confirm_text: cText, from_addr: cFrom.trim() })); toast("Bestätigung gespeichert."); };
  const uploadLogo = async (file: File) => { try { setStatus(await api.uploadConfirmLogo(clientId, file)); setLogoV((v) => v + 1); toast("Logo hochgeladen."); } catch (e) { toast((e as Error).message, "err"); } };
  const removeLogo = async () => { setStatus(await api.deleteConfirmLogo(clientId)); toast("Logo entfernt."); };
  const emailMe = async () => { try { const r = await api.emailMeParticipants(clientId); toast(`Übersicht an ${r.to} gesendet (${r.count}).`); } catch (e) { toast((e as Error).message, "err"); } };
  const rotate = async () => { if (!confirm("Neue Webhook-URL erzeugen? Die alte wird ungültig.")) return; setStatus(await api.rotateParticipantToken(clientId)); toast("Neue URL erzeugt."); };
  const setStat = async (p: Participant, s: string) => { await api.updateParticipant(clientId, p.id, { status: s }); setList((x) => x.map((y) => (y.id === p.id ? { ...y, status: s } : y))); };
  const del = async (p: Participant) => { if (!confirm("Anmeldung löschen?")) return; await api.deleteParticipant(clientId, p.id); setList((x) => x.filter((y) => y.id !== p.id)); };
  const copy = () => { if (status?.webhook_url) { navigator.clipboard.writeText(status.webhook_url); toast("Webhook-URL kopiert."); } };

  const forms = useMemo(() => Array.from(new Set(list.map((p) => p.form_name).filter(Boolean))), [list]);
  const filtered = useMemo(() => list
    .filter((p) => (form ? p.form_name === form : true))
    .filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase())), [list, q, form]);
  if (!status) return <div className="section"><div className="empty">Lädt…</div></div>;

  // Kunde ohne Freischaltung: nichts zeigen
  if (!isAgency && !status.enabled) return <div className="section"><div className="empty">Webhook ist nicht aktiv.</div></div>;

  return (
    <>
      {isAgency && (
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2>Webhook</h2>
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

              <div className="card" style={{ marginTop: 14, boxShadow: "none" }}>
                <strong style={{ fontSize: 14 }}>E-Mail bei neuem Eintrag</strong>
                <label className="ki-check" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={nEnabled} onChange={(e) => setNEnabled(e.target.checked)} />
                  <span>Bei jedem neuen Eintrag eine E-Mail senden <span className="muted" style={{ fontWeight: 400 }}>· aus = keine Mails (der Eintrag erscheint trotzdem im Tool)</span></span>
                </label>
                {nEnabled && (
                  <div style={{ marginLeft: 26, marginTop: 4 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Empfänger:</div>
                    <label className="ki-check">
                      <input type="checkbox" checked={nAgency} onChange={(e) => setNAgency(e.target.checked)} />
                      <span>An mich / mein Team</span>
                    </label>
                    <label className="ki-check">
                      <input type="checkbox" checked={nClient} onChange={(e) => setNClient(e.target.checked)} />
                      <span>An den Kunden <span className="muted" style={{ fontWeight: 400 }}>· dessen Kontakt-E-Mail</span></span>
                    </label>
                    <div className="field" style={{ marginTop: 6 }}><label>Zusätzliche E-Mail (optional)</label>
                      <input className="input form-light" type="email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="z. B. eingang@…" /></div>
                    <div className="muted" style={{ fontSize: 12, margin: "8px 0 4px" }}>Inhalt der Mail:</div>
                    <label className="ki-check">
                      <input type="checkbox" checked={incFields} onChange={(e) => setIncFields(e.target.checked)} />
                      <span>Alle Formularfelder mit reinschreiben</span>
                    </label>
                    <label className="ki-check">
                      <input type="checkbox" checked={incLink} onChange={(e) => setIncLink(e.target.checked)} />
                      <span>Link zum Eintrag mitschicken</span>
                    </label>
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={saveNotify}>Speichern</button>
              </div>

              <div className="card" style={{ marginTop: 14, boxShadow: "none" }}>
                <strong style={{ fontSize: 14 }}>Buchungsbestätigung an den Anmelder</strong>
                <label className="ki-check" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={cEnabled} onChange={(e) => setCEnabled(e.target.checked)} />
                  <span>Automatisch bestätigen <span className="muted" style={{ fontWeight: 400 }}>· sobald eine Anmeldung mit E-Mail eingeht</span></span>
                </label>
                {cEnabled && (
                  <div style={{ marginLeft: 26, marginTop: 6 }}>
                    <div className="field"><label>Betreff</label>
                      <input className="input form-light" value={cSubject} onChange={(e) => setCSubject(e.target.value)} placeholder="Bestätigung deiner Anmeldung" /></div>
                    <div className="field"><label>Nachricht</label>
                      <textarea className="input form-light" rows={4} value={cText} onChange={(e) => setCText(e.target.value)} placeholder="Hallo, vielen Dank für deine Anmeldung …" /></div>
                    <div className="field"><label>Absender-Adresse (From)</label>
                      <input className="input form-light" type="email" value={cFrom} onChange={(e) => setCFrom(e.target.value)} placeholder="z. B. noreply@north-lab.de" />
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Funktioniert nur, wenn diese Adresse in Microsoft 365 als Alias/Postfach mit „Senden als"-Recht eingerichtet ist – sonst wird ersatzweise über das verbundene Postfach gesendet (Antwort geht trotzdem an diese Adresse).
                      </div>
                    </div>
                    <div className="field">
                      <label>Logo für die Bestätigung</label>
                      <div className="row-inline" style={{ alignItems: "center", gap: 10 }}>
                        {status.has_logo && <img src={`${api.confirmLogoUrl(clientId)}?v=${logoV}`} alt="Logo" style={{ maxHeight: 40, maxWidth: 160, background: "linear-gradient(120deg,#1c2140,#c4553f 42%,#f8836b)", borderRadius: 8, padding: "6px 10px" }} />}
                        <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>{status.has_logo ? "Ersetzen" : "+ Logo"}
                          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.currentTarget.value = ""; }} /></label>
                        {status.has_logo && <button className="del" onClick={removeLogo}>entfernen</button>}
                      </div>
                    </div>
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={saveConfirm}>Bestätigung speichern</button>
              </div>
            </>
          ) : (
            <p className="muted">Aktiviere die Funktion, um für diesen Kunden Anmeldungen aus Contact Form 7 zu sammeln.</p>
          )}
        </div>
      )}

      {status.enabled && (
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Anmeldungen <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>· {list.length}</span></h2>
            <div className="row-inline" style={{ alignItems: "center" }}>
              {forms.length > 1 && (
                <select className="select form-light" style={{ maxWidth: 180 }} value={form} onChange={(e) => setForm(e.target.value)}>
                  <option value="">Alle Formulare</option>
                  {forms.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
              <input className="input form-light search" placeholder="Name oder E-Mail…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={emailMe} disabled={list.length === 0}>📧 An mich mailen</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => { try { await api.downloadParticipantsCsv(clientId, clientName); } catch (err) { toast((err as Error).message, "err"); } }} disabled={list.length === 0}>CSV</button>
            </div>
          </div>

          {filtered.length === 0 ? <div className="empty">Noch keine Anmeldungen.</div> : filtered.map((p) => {
            const fields = allFields(p);
            const open = openId === p.id;
            return (
              <div key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="list-row" style={{ alignItems: "flex-start", border: "none" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.name || "—"}</strong>
                    {p.email && <span className="muted"> · {p.email}</span>}
                    {p.form_name && <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>{p.form_name}</span>}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {new Date(p.created_at).toLocaleString("de-DE")}
                      {fields.length > 0 && (
                        <button className="chk-toggle" style={{ marginLeft: 8 }} onClick={() => setOpenId(open ? null : p.id)}>
                          {open ? "Details ausblenden" : `Alle Felder (${fields.length})`}
                        </button>
                      )}
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
                {open && (
                  <div className="pdetail">
                    {fields.map(([k, v]) => (
                      <div className="pdetail-row" key={k}>
                        <div className="pdetail-k">{prettyKey(k)}</div>
                        <div className="pdetail-v">{showVal(v)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
