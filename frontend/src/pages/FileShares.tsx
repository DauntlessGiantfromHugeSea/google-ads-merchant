import { useEffect, useRef, useState } from "react";
import { ShareRow, api } from "../api";
import { useToast } from "../toast";

const OPENS = [{ v: 1, l: "1× öffnen" }, { v: 3, l: "3× öffnen" }, { v: 10, l: "10× öffnen" }, { v: 0, l: "unbegrenzt" }];
const DURATION = [{ v: 24, l: "24 Stunden" }, { v: 72, l: "3 Tage" }, { v: 168, l: "7 Tage" }, { v: 720, l: "30 Tage" }];

export default function FileShares() {
  const toast = useToast();
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [maxOpens, setMaxOpens] = useState(1);
  const [hours, setHours] = useState(168);
  const [notify, setNotify] = useState(true);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.shares().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasFiles = files && files.length > 0;
    if (!hasFiles && !linkUrl.trim()) { toast("Bitte Dateien wählen oder einen Link angeben.", "err"); return; }
    if (!email.trim()) { toast("Bitte Empfänger-E-Mail angeben.", "err"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("allowed_email", email.trim());
      fd.append("max_opens", String(maxOpens));
      fd.append("expires_hours", String(hours));
      fd.append("title", title.trim());
      fd.append("notify", String(notify));
      fd.append("link_url", linkUrl.trim());
      fd.append("link_password", linkPassword.trim());
      if (hasFiles) Array.from(files).forEach((f) => fd.append("files", f));
      const r = await api.createShare(fd);
      setRows((x) => [r, ...x]);
      setTitle(""); setEmail(""); setLinkUrl(""); setLinkPassword(""); setFiles(null); if (fileRef.current) fileRef.current.value = "";
      navigator.clipboard?.writeText(r.url).catch(() => {});
      toast("Freigabe erstellt – Link kopiert." + (notify ? " Empfänger benachrichtigt." : ""));
    } catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); }
  };

  const del = async (s: ShareRow) => {
    if (!confirm("Freigabe löschen? Die Dateien werden sofort vom Server entfernt.")) return;
    await api.deleteShare(s.id); setRows((x) => x.filter((y) => y.id !== s.id)); toast("Gelöscht.");
  };
  const copy = (url: string) => { navigator.clipboard.writeText(url); toast("Link kopiert."); };
  const fmt = (s: string) => s ? new Date(s).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <>
      <div className="page-head"><h1>Dateifreigabe</h1>
        <div className="muted" style={{ fontSize: 13 }}>Dateien sicher teilen – nur für eine bestimmte Mail, per Code, limitiert auf Öffnungen & Dauer. Für sehr große Dateien einen Nextcloud-Link hinterlegen (statt Upload).</div></div>

      <div className="section">
        <h2>Neue Freigabe</h2>
        <form className="form-light" onSubmit={create}>
          <div className="field"><label>Dateien</label>
            <input ref={fileRef} className="input" type="file" multiple onChange={(e) => setFiles(e.target.files)} /></div>
          <div className="field"><label>… oder Link für große Dateien (z. B. Nextcloud) – optional</label>
            <input className="input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://cloud.deine-domain.de/s/abc123" /></div>
          {linkUrl.trim() && (
            <div className="field"><label>Passwort der Nextcloud-Freigabe (falls gesetzt)</label>
              <input className="input" value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} placeholder="nur serverseitig – der Empfänger sieht Link & Passwort nie" /></div>
          )}
          <div className="field"><label>Titel (optional)</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Vertragsunterlagen" /></div>
          <div className="field"><label>Empfänger-E-Mail (nur diese darf öffnen)</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@firma.de" /></div>
          <div className="row-inline">
            <div className="field"><label>Öffnungen</label>
              <select className="select" value={maxOpens} onChange={(e) => setMaxOpens(Number(e.target.value))}>
                {OPENS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select></div>
            <div className="field"><label>Gültig für</label>
              <select className="select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {DURATION.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select></div>
          </div>
          <label className="ki-check" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Empfänger per E-Mail über den Link informieren
          </label>
          <button className="btn btn-primary" disabled={busy} style={{ marginTop: 10 }}>{busy ? "erstellt…" : "Freigabe erstellen"}</button>
        </form>
      </div>

      <div className="section">
        <h2>Aktive Freigaben</h2>
        {rows.length === 0 ? <div className="empty">Noch keine Freigaben.</div> : (
          <div>
            {rows.map((s) => (
              <div key={s.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{s.title || "Dateifreigabe"}</strong>
                  <span className={`status-badge ${s.closed ? "st-pausiert" : "st-aktiv"}`} style={{ marginLeft: 8 }}>{s.closed ? "abgelaufen" : "aktiv"}</span>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {s.has_link ? "Link-Freigabe" : `${s.file_count} Datei(en)`} · nur {s.allowed_email} · {s.opens}/{s.max_opens === 0 ? "∞" : s.max_opens} geöffnet · bis {fmt(s.expires_at)}
                  </div>
                  {!s.closed && <input className="input form-light" readOnly value={s.url} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 4, fontSize: 12 }} />}
                </div>
                <div className="row-inline" style={{ alignItems: "center" }}>
                  {!s.closed && <button className="btn btn-ghost btn-sm" onClick={() => copy(s.url)}>Link</button>}
                  <button className="del" onClick={() => del(s)}>löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
