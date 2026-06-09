import { useState } from "react";
import { api } from "../api";
import { encryptSecret } from "../crypto";
import { useToast } from "../toast";

export default function Vault() {
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
    </>
  );
}
