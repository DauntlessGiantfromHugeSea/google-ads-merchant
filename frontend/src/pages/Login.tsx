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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Selbst-Registrierung nur anzeigen, solange noch keine Agentur existiert.
  useEffect(() => {
    api.registrationOpen()
      .then((r) => { setRegOpen(r.open); if (r.open) setMode("register"); })
      .catch(() => setRegOpen(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register({ organization_name: org, email, password, full_name: name });
      }
      await api.login(email, password);
      setUser(await api.me());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <svg className="login-logo" width="172" height="60" viewBox="0 0 172 60" role="img" aria-label="North Flow">
          <text x="86" y="32" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif"
                fontSize="26" fontWeight="700" fill="#ffffff">North Flow</text>
          <path d="M28 46 C 58 58, 114 58, 144 45" stroke="#f8836b" strokeWidth="4"
                fill="none" strokeLinecap="round" />
        </svg>
        <h1>{mode === "login" ? "Anmelden" : "Agentur einrichten"}</h1>
        <div className="sub">
          {mode === "login" ? "Reporting-Plattform für deine Kunden." : "Lege deine Agentur und den Admin-Zugang an."}
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

        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={busy}>
          {busy ? "..." : mode === "login" ? "Anmelden" : "Agentur erstellen"}
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
