import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function Angebot() {
  const { token = "" } = useParams();
  const [o, setO] = useState<any>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = () => api.publicOffer(token).then(setO).catch(() => setError("Angebot nicht gefunden."));
  useEffect(() => { load(); }, [token]);

  const requestCode = async () => {
    setBusy(true); setMsg(""); setError("");
    try {
      const r = await api.requestOfferCode(token);
      setCodeSent(true);
      setMsg(`Wir haben einen Bestätigungscode an ${r.email_hint || "deine hinterlegte Adresse"} gesendet.`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  const accept = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api.acceptOffer(token, { name, email, code });
      setDone(true); load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  if (error && !o) return <div className="auth-wrap"><div className="auth-card">{error}</div></div>;
  if (!o) return <div className="auth-wrap"><div className="auth-card">Lädt…</div></div>;
  const accepted = o.status === "accepted" || done;

  return (
    <div className="auth-wrap" style={{ alignItems: "flex-start", padding: "40px 16px" }}>
      <div className="auth-card" style={{ maxWidth: 640, color: "#fff" }}>
        <img className="login-logo" src="/api/branding/logo" alt=""
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />
        <h1 style={{ fontSize: 24, letterSpacing: 2 }}>ANGEBOT</h1>
        <div className="sub" style={{ marginTop: 4 }}>Nr. {o.number} · {o.date}{o.title ? ` · ${o.title}` : ""}</div>

        {o.intro && <div style={{ whiteSpace: "pre-line", margin: "12px 0", fontSize: 14 }}>{o.intro}</div>}

        <div style={{ margin: "16px 0", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
          {o.items.map((it: any) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{it.description.split("\n")[0]}</div>
                {it.description.includes("\n") && <div className="muted" style={{ fontSize: 12 }}>{it.description.split("\n").slice(1).join(" ")}</div>}
                <div className="muted" style={{ fontSize: 12 }}>{it.quantity_str} {it.unit}</div>
              </div>
              <div style={{ whiteSpace: "nowrap" }}>{it.line_total_str}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "right", fontSize: 18, fontWeight: 800 }}>Gesamt: {o.gross_str}</div>

        {accepted ? (
          <div style={{ marginTop: 18, padding: "12px 14px", background: "rgba(52,211,153,0.18)", color: "#6ee7b7", borderRadius: 10 }}>
            ✓ Angebot angenommen{o.accepted_by ? ` von ${o.accepted_by}` : ""}. Vielen Dank!
          </div>
        ) : (
          <form onSubmit={accept} style={{ marginTop: 18 }}>
            <div className="field"><label>Dein Name (für die Bestätigung)</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>

            {o.verify?.mail ? (
              // Verifizierung per E-Mail-Code an die hinterlegte Adresse
              !codeSent ? (
                <>
                  <p className="sub" style={{ marginTop: 0 }}>
                    Zur verbindlichen Annahme senden wir dir einen Bestätigungscode an
                    {" "}<strong>{o.verify.email_hint}</strong>.
                  </p>
                  <button type="button" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
                    onClick={requestCode} disabled={busy}>{busy ? "…" : "Bestätigungscode senden"}</button>
                </>
              ) : (
                <>
                  <div className="field"><label>Bestätigungscode aus der E-Mail</label>
                    <input className="input" inputMode="numeric" autoComplete="one-time-code" placeholder="6-stellig"
                      value={code} onChange={(e) => setCode(e.target.value)} required /></div>
                  <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
                    {busy ? "…" : "Angebot verbindlich annehmen"}
                  </button>
                  <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={requestCode} disabled={busy}>
                    Code erneut senden
                  </button>
                </>
              )
            ) : (
              // Fallback: Bestätigung durch Eingabe der hinterlegten E-Mail-Adresse
              <>
                <div className="field"><label>Deine E-Mail-Adresse zur Bestätigung</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    placeholder={o.verify?.has_email ? o.verify.email_hint : "name@firma.de"} /></div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
                  {busy ? "…" : "Angebot verbindlich annehmen"}
                </button>
              </>
            )}
            {msg && <div className="sub" style={{ marginTop: 10, color: "#6ee7b7" }}>{msg}</div>}
            {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          </form>
        )}
        {o.agency?.email && <div className="sub" style={{ marginTop: 16, marginBottom: 0 }}>Fragen? {o.agency.name} · {o.agency.email}</div>}
      </div>
    </div>
  );
}
