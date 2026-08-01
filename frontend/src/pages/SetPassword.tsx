import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function SetPassword() {
  const { token = "" } = useParams();
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.inviteInfo(token).then((r) => setEmail(r.email))
      .catch(() => setError("Diese Einladung ist ungültig oder abgelaufen."));
  }, [token]);

  const strong = pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!strong) { setError("Passwort: mindestens 8 Zeichen, mit Buchstaben und Zahlen."); return; }
    if (pw !== pw2) { setError("Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    try { await api.setInvitePassword(token, pw); window.location.href = "/"; }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <img className="login-logo" src="/api/branding/logo" alt="North Flow"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />
        <h1 style={{ fontSize: 22 }}>Passwort festlegen</h1>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
        {!error && email && (
          <>
            <div className="sub" style={{ marginTop: 8 }}>Für <strong>{email}</strong></div>
            <div className="field"><label>Passwort</label>
              <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
              <div className="sub" style={{ fontSize: 12, marginTop: 4, color: pw ? (strong ? "#6ee7b7" : "#fca5a5") : undefined }}>
                Mindestens 8 Zeichen, mit Buchstaben und Zahlen.
              </div></div>
            <div className="field"><label>Passwort wiederholen</label>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={busy}>
              {busy ? "…" : "Passwort speichern & anmelden"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
