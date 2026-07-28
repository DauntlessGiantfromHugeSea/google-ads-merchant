import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function RequestSubmit() {
  const { id = "" } = useParams();
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.requestPublic(id)
      .then((r) => setLabel(r.label || "Passwort übermitteln"))
      .catch(() => setError("Dieser Link ist abgelaufen oder existiert nicht."));
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) return;
    setBusy(true); setError("");
    try { await api.submitSecret(id, { secret, note }); setDone(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <img className="login-logo" src="/api/branding/logo" alt="North Flow"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />

        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

        {!error && done && (
          <>
            <h1 style={{ fontSize: 22 }}>Danke! ✓</h1>
            <div className="sub" style={{ marginTop: 8 }}>Dein Passwort wurde sicher übermittelt. Du kannst dieses Fenster schließen.</div>
          </>
        )}

        {!error && !done && label !== null && (
          <>
            <h1 style={{ fontSize: 22 }}>{label}</h1>
            <div className="sub" style={{ marginTop: 8 }}>
              Übermittle dein Passwort sicher. Die Eingabe wird verschlüsselt gespeichert und ist nur für die Agentur sichtbar.
            </div>
            <form onSubmit={submit}>
              <div className="field"><label>Passwort / Geheimnis</label>
                <textarea className="input" value={secret} onChange={(e) => setSecret(e.target.value)} required rows={3} /></div>
              <div className="field"><label>Hinweis (optional, z.B. wofür)</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
                {busy ? "Senden…" : "Sicher übermitteln"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
