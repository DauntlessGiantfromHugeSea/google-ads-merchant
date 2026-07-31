import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../App";

export default function Login() {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [regOpen, setRegOpen] = useState(false);
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needOtp, setNeedOtp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tagline, setTagline] = useState("Reporting-Plattform für deine Kunden.");

  // Selbst-Registrierung nur anzeigen, solange noch keine Agentur existiert.
  useEffect(() => {
    api.registrationOpen()
      .then((r) => { setRegOpen(r.open); if (r.open) setMode("register"); })
      .catch(() => setRegOpen(false));
    api.loginInfo().then((r) => r.tagline && setTagline(r.tagline)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register({ organization_name: org, email, password, full_name: name });
      }
      await api.login(email, password, needOtp ? otp : undefined);
      setUser(await api.me());
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "2FA_REQUIRED") {
        setNeedOtp(true); setError("");
      } else if (msg === "2FA_INVALID") {
        setNeedOtp(true); setError("Code ungültig – bitte erneut eingeben.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <img className="login-logo" src="/api/branding/logo" alt="North Flow"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />
        <h1>{mode === "login" ? "Anmelden" : "Agentur einrichten"}</h1>
        <div className="sub">
          {mode === "login" ? tagline : "Lege deine Agentur und den Admin-Zugang an."}
        </div>

        {mode === "register" && (
          <>
            <div className="field">
              <label>Agenturname</label>
              <input className="input" value={org} onChange={(e) => setOrg(e.target.value)} required />
            </div>
            <div className="field">
              <label>Dein Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </>
        )}
        <div className="field">
          <label>E-Mail</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Passwort</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        {needOtp && (
          <div className="field">
            <label>2FA-Code (Authenticator-App)</label>
            <input className="input" inputMode="numeric" autoComplete="one-time-code" autoFocus
              placeholder="6-stelliger Code" value={otp} onChange={(e) => setOtp(e.target.value)} required />
          </div>
        )}

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={busy}>
          {busy ? "..." : needOtp ? "Bestätigen" : mode === "login" ? "Anmelden" : "Agentur erstellen"}
        </button>
        {error && <div className="error">{error}</div>}

        {regOpen && (
          <div className="sub" style={{ marginTop: 18, marginBottom: 0 }}>
            {mode === "login" ? (
              <>Noch keine Agentur? <span className="switch-link" onClick={() => setMode("register")}>Jetzt einrichten</span></>
            ) : (
              <>Schon registriert? <span className="switch-link" onClick={() => setMode("login")}>Anmelden</span></>
            )}
          </div>
        )}
        {!regOpen && (
          <div className="sub" style={{ marginTop: 18, marginBottom: 0 }}>
            Zugang nur per Einladung. Wende dich an deine Agentur.
          </div>
        )}
      </form>
    </div>
  );
}
