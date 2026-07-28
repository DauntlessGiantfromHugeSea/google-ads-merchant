import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function Angebot() {
  const { token = "" } = useParams();
  const [o, setO] = useState<any>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = () => api.publicOffer(token).then(setO).catch(() => setError("Angebot nicht gefunden."));
  useEffect(() => { load(); }, [token]);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.acceptOffer(token, name); setDone(true); load(); }
    catch { setError("Annahme fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  if (error) return <div className="auth-wrap"><div className="auth-card">{error}</div></div>;
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
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
              {busy ? "…" : "Angebot verbindlich annehmen"}
            </button>
          </form>
        )}
        {o.agency?.email && <div className="sub" style={{ marginTop: 16, marginBottom: 0 }}>Fragen? {o.agency.name} · {o.agency.email}</div>}
      </div>
    </div>
  );
}
