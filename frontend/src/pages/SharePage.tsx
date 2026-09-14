import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShareFile, api } from "../api";

const fmtSize = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

export default function SharePage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<{ title: string; closed: boolean } | null>(null);
  const [step, setStep] = useState<"email" | "code" | "files">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [access, setAccess] = useState("");
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.shareInfo(token).then(setInfo).catch(() => setInfo({ title: "", closed: true })); }, [token]);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      await api.shareRequestCode(token, email.trim());
      setStep("code");
      setMsg("Falls die Adresse berechtigt ist, wurde ein 6-stelliger Code an sie gesendet.");
    } catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const r = await api.shareVerify(token, email.trim(), code.trim());
      setAccess(r.access); setFiles(r.files); setStep("files");
    } catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); }
  };
  const download = async (f: ShareFile) => {
    try { await api.shareDownload(token, f.idx, access, f.name); }
    catch { setMsg("Download fehlgeschlagen – ggf. ist die Freigabe abgelaufen."); }
  };

  const card: React.CSSProperties = { maxWidth: 440, margin: "8vh auto", background: "#fff", borderRadius: 16, border: "1px solid #e8e8ee", padding: 28, fontFamily: "system-ui, sans-serif", color: "#15161a" };

  if (!info) return <div style={card}>Lädt…</div>;
  if (info.closed) return (
    <div style={card}>
      <h2 style={{ marginTop: 0 }}>Nicht mehr verfügbar</h2>
      <p style={{ color: "#6b6b72" }}>Diese Dateifreigabe ist abgelaufen oder wurde bereits (maximal oft) geöffnet.</p>
    </div>
  );

  return (
    <div style={card}>
      <h2 style={{ marginTop: 0 }}>{info.title || "Sichere Dateifreigabe"}</h2>

      {step === "email" && (
        <form onSubmit={requestCode}>
          <p style={{ color: "#6b6b72", marginTop: 0 }}>Zum Öffnen bitte deine E-Mail-Adresse bestätigen. Du erhältst einen Code an diese Adresse.</p>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="deine@mail.de" style={{ width: "100%", padding: 10, marginBottom: 10 }} />
          <button className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>{busy ? "…" : "Code anfordern"}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify}>
          <p style={{ color: "#6b6b72", marginTop: 0 }}>Gib den 6-stelligen Code ein, den wir an <strong>{email}</strong> gesendet haben.</p>
          <input className="input" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" style={{ width: "100%", padding: 10, marginBottom: 10, letterSpacing: 4, textAlign: "center", fontSize: 18 }} />
          <button className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>{busy ? "…" : "Öffnen"}</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setStep("email")}>zurück</button>
        </form>
      )}

      {step === "files" && (
        <div>
          <p style={{ color: "#6b6b72", marginTop: 0 }}>Verifiziert. Deine Dateien:</p>
          {files.map((f) => (
            <div key={f.idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name} <span style={{ color: "#9aa0a6", fontSize: 12 }}>({fmtSize(f.size)})</span></span>
              <button className="btn btn-primary btn-sm" onClick={() => download(f)}>laden</button>
            </div>
          ))}
        </div>
      )}

      {msg && <p style={{ color: "#6b6b72", fontSize: 13, marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
