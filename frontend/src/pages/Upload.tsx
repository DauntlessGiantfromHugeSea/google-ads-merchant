import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicUploadInfo, api } from "../api";

const gb = (b: number) => (b / (1024 ** 3)).toFixed(0);
const fileSize = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export default function Upload() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<PublicUploadInfo | null>(null);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploader, setUploader] = useState("");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.publicUploadInfo(token).then(setInfo).catch(() => setError("Link nicht gefunden.")); }, [token]);

  const pick = (list: FileList | null) => { if (list) setFiles((f) => [...f, ...Array.from(list)]); };
  const total = files.reduce((a, f) => a + f.size, 0);

  const submit = async () => {
    if (!files.length) return;
    setBusy(true); setError(""); setPct(0);
    try {
      const r = await api.publicUpload(token, files, uploader, setPct);
      setDone(r.count); setFiles([]);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (error && !info) return <div className="auth-wrap"><div className="auth-card">{error}</div></div>;
  if (!info) return <div className="auth-wrap"><div className="auth-card">Lädt…</div></div>;

  return (
    <div className="auth-wrap" style={{ alignItems: "flex-start", padding: "40px 16px" }}>
      <div className="auth-card" style={{ maxWidth: 560, color: "#fff" }}>
        <img className="login-logo" src="/api/branding/logo" alt=""
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />
        <h1 style={{ fontSize: 22 }}>📤 {info.title}</h1>
        {info.message && <p className="sub" style={{ whiteSpace: "pre-wrap" }}>{info.message}</p>}
        <p className="sub" style={{ fontSize: 12 }}>
          Bis {gb(info.max_bytes)} GB. Dateien werden nach {info.retention_days} Tagen automatisch gelöscht.
        </p>

        {!info.active ? (
          <div className="error">Dieser Upload-Link ist deaktiviert.</div>
        ) : done > 0 ? (
          <div style={{ padding: "16px", background: "rgba(52,211,153,0.18)", color: "#6ee7b7", borderRadius: 10, textAlign: "center" }}>
            ✓ {done} Datei(en) hochgeladen. Vielen Dank!
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDone(0)}>Weitere hochladen</button>
            </div>
          </div>
        ) : (
          <>
            <div className="upload-drop" onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
              <input ref={inputRef} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
              <div style={{ fontSize: 28 }}>⬆️</div>
              <div>Dateien hierher ziehen oder <strong>auswählen</strong></div>
            </div>

            {files.length > 0 && (
              <div style={{ margin: "12px 0" }}>
                {files.map((f, i) => (
                  <div key={i} className="row-inline" style={{ justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span className="sub" style={{ whiteSpace: "nowrap" }}>{fileSize(f.size)}
                      <button className="del" style={{ marginLeft: 8 }} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>×</button>
                    </span>
                  </div>
                ))}
                <div className="sub" style={{ fontSize: 12, marginTop: 4 }}>Gesamt: {fileSize(total)}</div>
              </div>
            )}

            <div className="field"><label>Dein Name (optional)</label>
              <input className="input" value={uploader} onChange={(e) => setUploader(e.target.value)} placeholder="z. B. Praxis Meier" /></div>

            {busy && (
              <div style={{ margin: "10px 0" }}>
                <div className="ob-progress"><div className="ob-progress-fill" style={{ width: `${pct}%` }} /></div>
                <div className="sub" style={{ fontSize: 12, marginTop: 4 }}>{pct}% – bitte Fenster offen lassen…</div>
              </div>
            )}

            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
              disabled={busy || files.length === 0} onClick={submit}>
              {busy ? "Lädt hoch…" : `${files.length || ""} Datei(en) hochladen`}
            </button>
            {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          </>
        )}
        {info.agency_name && <div className="sub" style={{ marginTop: 16, marginBottom: 0 }}>Für {info.agency_name}</div>}
      </div>
    </div>
  );
}
