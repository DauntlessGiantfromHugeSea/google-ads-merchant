import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../App";

export default function Login() {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        <div className="logo" style={{ marginBottom: 18 }}>North<b>·</b>Lab</div>
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

        <div className="sub" style={{ marginTop: 18, marginBottom: 0 }}>
          {mode === "login" ? (
            <>Noch keine Agentur? <span className="switch-link" onClick={() => setMode("register")}>Jetzt einrichten</span></>
          ) : (
            <>Schon registriert? <span className="switch-link" onClick={() => setMode("login")}>Anmelden</span></>
          )}
        </div>
      </form>
    </div>
  );
}
