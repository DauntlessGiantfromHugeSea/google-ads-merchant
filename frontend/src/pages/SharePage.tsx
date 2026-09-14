import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShareFile, api } from "../api";

const fmtSize = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;

const C = {
  navy: "#1c2140", coral: "#c4553f", pink: "#f8836b",
  ink: "#15161a", muted: "#6b6b72", border: "#ececf1",
};
const S = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "#0f1017", fontFamily: "system-ui, -apple-system, Segoe UI, Arial, sans-serif" } as React.CSSProperties,
  card: { width: "100%", maxWidth: 460, background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.45)" } as React.CSSProperties,
  banner: { background: `linear-gradient(120deg, ${C.navy}, ${C.coral} 70%, ${C.pink})`, padding: "26px 24px", textAlign: "center" } as React.CSSProperties,
  body: { padding: "26px 28px", color: C.ink } as React.CSSProperties,
  h: { margin: "0 0 8px", color: C.navy, fontSize: 21, fontWeight: 700 } as React.CSSProperties,
  p: { color: C.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" } as React.CSSProperties,
  input: { width: "100%", padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, boxSizing: "border-box", background: "#fbfbfd", color: C.ink } as React.CSSProperties,
  btn: { width: "100%", padding: "12px 16px", border: 0, borderRadius: 10, background: C.coral, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 12 } as React.CSSProperties,
  link: { background: "transparent", border: 0, color: C.muted, fontSize: 13, cursor: "pointer", marginTop: 10, display: "block", width: "100%" } as React.CSSProperties,
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${C.border}` } as React.CSSProperties,
  small: { padding: "8px 12px", border: 0, borderRadius: 8, background: C.navy, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" } as React.CSSProperties,
};

export default function SharePage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<{ title: string; closed: boolean } | null>(null);
  const [step, setStep] = useState<"email" | "code" | "files">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [access, setAccess] = useState("");
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [hasLink, setHasLink] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.shareInfo(token).then(setInfo).catch(() => setInfo({ title: "", closed: true })); }, [token]);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try { await api.shareRequestCode(token, email.trim()); setStep("code"); setMsg("Falls die Adresse berechtigt ist, wurde ein Code an sie gesendet."); }
    catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const r = await api.shareVerify(token, email.trim(), code.trim());
      setAccess(r.access); setFiles(r.files); setHasLink(r.has_link); setStep("files");
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };
  const download = async (f: ShareFile) => {
    try { await api.shareDownload(token, f.idx, access, f.name); }
    catch { setMsg("Download fehlgeschlagen – ggf. ist die Freigabe abgelaufen."); }
  };
  const [dl, setDl] = useState(false);
  const downloadLink = async () => {
    setDl(true); setMsg("");
    try { await api.shareLinkDownload(token, access); }
    catch (err) { setMsg((err as Error).message); } finally { setDl(false); }
  };

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div style={S.page}><div style={S.card}>
      <div style={S.banner}>
        {logoOk
          ? <img src="/api/branding/logo" alt="" onError={() => setLogoOk(false)} style={{ maxHeight: 44, maxWidth: "70%", display: "inline-block" }} />
          : <div style={{ color: "#fff", fontWeight: 700, letterSpacing: 1, fontSize: 18 }}>Dateifreigabe</div>}
      </div>
      <div style={S.body}>{children}</div>
    </div></div>
  );

  if (!info) return <Frame><p style={S.p}>Lädt…</p></Frame>;
  if (info.closed) return (
    <Frame>
      <h1 style={S.h}>Nicht mehr verfügbar</h1>
      <p style={S.p}>Diese Dateifreigabe ist abgelaufen oder wurde bereits (maximal oft) geöffnet.</p>
    </Frame>
  );

  return (
    <Frame>
      <h1 style={S.h}>{info.title || "Sichere Dateifreigabe"}</h1>

      {step === "email" && (
        <form onSubmit={requestCode}>
          <p style={S.p}>Zum Öffnen bitte deine E-Mail-Adresse bestätigen. Du bekommst einen Code an genau diese Adresse.</p>
          <input style={S.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="deine@mail.de" />
          <button style={{ ...S.btn, opacity: busy ? .6 : 1 }} disabled={busy}>{busy ? "…" : "Code anfordern"}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify}>
          <p style={S.p}>Gib den 6-stelligen Code ein, den wir an <strong style={{ color: C.ink }}>{email}</strong> gesendet haben.</p>
          <input style={{ ...S.input, letterSpacing: 6, textAlign: "center", fontSize: 20 }} inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          <button style={{ ...S.btn, opacity: busy ? .6 : 1 }} disabled={busy}>{busy ? "…" : "Öffnen"}</button>
          <button type="button" style={S.link} onClick={() => { setStep("email"); setMsg(""); }}>← andere E-Mail</button>
        </form>
      )}

      {step === "files" && (
        <div>
          <p style={S.p}>Verifiziert ✓ — deine Dateien:</p>
          {hasLink && (
            <button onClick={downloadLink} disabled={dl} style={{ ...S.btn, marginTop: 0, marginBottom: files.length ? 16 : 0, opacity: dl ? .6 : 1 }}>
              {dl ? "lädt…" : "Dateien herunterladen"}
            </button>
          )}
          {files.map((f) => (
            <div key={f.idx} style={S.row}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>
                {f.name} <span style={{ color: "#9aa0a6", fontSize: 12 }}>({fmtSize(f.size)})</span>
              </span>
              <button style={S.small} onClick={() => download(f)}>laden</button>
            </div>
          ))}
        </div>
      )}

      {msg && <p style={{ ...S.p, margin: "14px 0 0", fontSize: 13 }}>{msg}</p>}
    </Frame>
  );
}
