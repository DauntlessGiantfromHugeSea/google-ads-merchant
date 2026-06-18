import { useEffect, useState } from "react";
import { SecretRequest, Submission, api } from "../api";
import { encryptSecret } from "../crypto";
import { useToast } from "../toast";
import { useAuth } from "../App";

function RequestsManager() {
  const toast = useToast();
  const [reqs, setReqs] = useState<SecretRequest[]>([]);
  const [label, setLabel] = useState("");
  const [ttl, setTtl] = useState(336);
  const [open, setOpen] = useState<string | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);

  const load = () => api.listRequests().then(setReqs).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.createRequest({ label, ttl_hours: ttl }); setLabel(""); load(); toast("Anforderungs-Link erstellt."); }
    catch (err) { toast((err as Error).message, "err"); }
  };
  const link = (id: string) => `${location.origin}/req/${id}`;
  const copy = (id: string) => { navigator.clipboard.writeText(link(id)); toast("Link kopiert."); };
  const view = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setSubs(await api.listSubmissions(id));
  };
  const delReq = async (id: string) => {
    if (!confirm("Anforderung inkl. aller Eingänge löschen?")) return;
    await api.deleteRequest(id); if (open === id) setOpen(null); load(); toast("Anforderung gelöscht.");
  };
  const delSub = async (id: string, sid: string) => {
    await api.deleteSubmission(id, sid); setSubs((s) => s.filter((x) => x.id !== sid)); load(); toast("Eingang gelöscht.");
  };
  const copySecret = (s: string) => { navigator.clipboard.writeText(s); toast("Passwort kopiert."); };

  return (
    <div className="section">
      <h2>Passwörter anfordern</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Erstelle einen öffentlichen Link, über den dir jemand <strong>ohne Login</strong> ein Passwort schicken kann.
        Nur du siehst die Eingänge.
      </p>
      <form className="row-inline form-light" onSubmit={create}>
        <div className="field" style={{ flex: 2 }}><label>Beschreibung (was wird angefordert?)</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. WLAN-Passwort von Kunde Müller" required /></div>
        <div className="field"><label>Gültig für</label>
          <select className="select" value={ttl} onChange={(e) => setTtl(+e.target.value)}>
            <option value={24}>1 Tag</option><option value={168}>7 Tage</option>
            <option value={336}>14 Tage</option><option value={2160}>90 Tage</option>
          </select></div>
        <button className="btn btn-primary">Link erstellen</button>
      </form>

      <div style={{ marginTop: 16 }}>
        {reqs.length === 0 ? <div className="empty">Noch keine Anforderungen.</div> : reqs.map((r) => (
          <div key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "12px 0" }}>
            <div className="list-row" style={{ border: "none", padding: 0 }}>
              <div>
                <strong>{r.label || "Anforderung"}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{r.submission_count} Eingang/Eingänge · von {r.created_by}</div>
              </div>
              <div className="row-inline" style={{ alignItems: "center" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(r.id)}>Link kopieren</button>
                <button className="btn btn-ghost btn-sm" onClick={() => view(r.id)}>{open === r.id ? "Schließen" : `Eingänge (${r.submission_count})`}</button>
                <button className="del" onClick={() => delReq(r.id)}>löschen</button>
              </div>
            </div>
            {open === r.id && (
              <div style={{ marginTop: 8 }}>
                {subs.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Noch keine Eingänge.</div> : subs.map((s) => (
                  <div key={s.id} className="list-row">
                    <div style={{ minWidth: 0 }}>
                      <code style={{ fontSize: 13, wordBreak: "break-all" }}>{s.secret}</code>
                      <div className="muted" style={{ fontSize: 12 }}>{s.note} · {new Date(s.created_at).toLocaleString("de-DE")}</div>
                    </div>
                    <div className="row-inline" style={{ alignItems: "center" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => copySecret(s.secret)}>Kopieren</button>
                      <button className="del" onClick={() => delSub(r.id, s.id)}>löschen</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Vault() {
  const { user } = useAuth();
  const isAgency = user?.role !== "client_user";
  const toast = useToast();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [views, setViews] = useState(5);
  const [ttl, setTtl] = useState(168);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { ciphertext, iv, key } = await encryptSecret(text);
      const r = await api.createSecret({ ciphertext, iv, views_left: views, note, ttl_hours: ttl });
      setLink(`${location.origin}/s/${r.id}#${key}`);
      setText(""); setNote("");
      toast("Verschlüsselter Link erstellt.");
    } catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); }
  };
  const copy = () => { navigator.clipboard.writeText(link); toast("Link kopiert."); };

  return (
    <>
      <span className="eyebrow">Passwort-Safe</span>
      <div className="page-head"><h1>Sicher übermitteln</h1></div>

      <div className="section">
        <p className="muted" style={{ marginTop: 0 }}>
          Ende-zu-Ende verschlüsselt: Der Schlüssel steckt nur im Link – <strong>der Server sieht das Passwort nie</strong>.
          Der Link funktioniert nur eine begrenzte Anzahl an Aufrufen und läuft danach ab. Funktioniert in beide Richtungen.
        </p>

        {!link ? (
          <form className="form-light" onSubmit={create}>
            <div className="field"><label>Passwort / Geheimnis</label>
              <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} required
                placeholder="z.B. Zugangsdaten, API-Key, Passwort…" /></div>
            <div className="field"><label>Notiz (sichtbar, optional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z.B. WLAN-Passwort" /></div>
            <div className="row-inline">
              <div className="field"><label>Max. Aufrufe</label>
                <select className="select" value={views} onChange={(e) => setViews(+e.target.value)}>
                  {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}×</option>)}
                </select></div>
              <div className="field"><label>Gültig für</label>
                <select className="select" value={ttl} onChange={(e) => setTtl(+e.target.value)}>
                  <option value={1}>1 Stunde</option><option value={24}>1 Tag</option>
                  <option value={168}>7 Tage</option><option value={720}>30 Tage</option>
                </select></div>
              <button className="btn btn-primary" disabled={busy}>{busy ? "Verschlüssele…" : "Link erzeugen"}</button>
            </div>
          </form>
        ) : (
          <div>
            <div className="field"><label>Dein sicherer Link (jetzt teilen – wird nicht erneut angezeigt)</label>
              <input className="input form-light" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></div>
            <div className="row-inline">
              <button className="btn btn-primary" onClick={copy}>Link kopieren</button>
              <button className="btn btn-ghost" onClick={() => setLink("")}>Weiteres Geheimnis</button>
            </div>
          </div>
        )}
      </div>

      {isAgency && <RequestsManager />}
    </>
  );
}
