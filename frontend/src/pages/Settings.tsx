import { useState } from "react";
import { api } from "../api";

export default function Settings() {
  const [bust, setBust] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setMsg(""); setBusy(true);
    try {
      await api.uploadLogo(file);
      setBust(Date.now());
      setMsg("Logo gespeichert. Im Login (dunkler Hintergrund) sichtbar.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const remove = async () => {
    setError(""); setMsg("");
    try { await api.deleteLogo(); setBust(Date.now()); setMsg("Logo entfernt."); }
    catch (err) { setError((err as Error).message); }
  };

  return (
    <>
      <span className="eyebrow">Einstellungen</span>
      <div className="page-head"><h1>Einstellungen</h1></div>

      <div className="section">
        <h2>Logo</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Wird in der Login-Maske angezeigt (auf dunklem Hintergrund). PNG mit
          transparentem Hintergrund oder SVG empfohlen, max. 2 MB.
        </p>

        {/* Vorschau auf dunklem Hintergrund */}
        <div style={{ background: "#0e0e10", borderRadius: 12, padding: 24, display: "flex",
                      justifyContent: "center", marginBottom: 16 }}>
          <img src={`/api/branding/logo?t=${bust}`} alt="Aktuelles Logo" style={{ maxHeight: 70, maxWidth: 260 }}
            onError={(e) => { e.currentTarget.style.opacity = "0.35"; e.currentTarget.src = "/logo.svg"; }} />
        </div>

        <div className="row-inline" style={{ alignItems: "center" }}>
          <label className="btn btn-primary" style={{ cursor: "pointer" }}>
            {busy ? "Lädt…" : "Logo hochladen"}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
              style={{ display: "none" }} onChange={onFile} disabled={busy} />
          </label>
          <button className="btn btn-ghost" onClick={remove} disabled={busy}>Entfernen</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}
