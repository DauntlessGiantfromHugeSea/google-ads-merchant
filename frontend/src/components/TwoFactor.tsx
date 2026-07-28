import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../App";
import { useToast } from "../toast";

export default function TwoFactor() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr_svg: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setError(""); setBusy(true);
    try { const s = await api.twoFASetup(); setSetup({ secret: s.secret, qr_svg: s.qr_svg }); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const enable = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { setUser(await api.twoFAEnable(code)); setSetup(null); setCode(""); toast("2FA aktiviert."); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const disable = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { setUser(await api.twoFADisable(code)); setCode(""); toast("2FA deaktiviert."); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="section">
      <h2>Zwei-Faktor-Authentifizierung</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Zusätzlicher Schutz per Authenticator-App (z.B. Google Authenticator, Microsoft Authenticator, 1Password).
        Bei der Anmeldung wird dann zusätzlich ein 6-stelliger Code abgefragt.
      </p>

      {user?.totp_enabled ? (
        <>
          <div className="row-inline" style={{ alignItems: "center", marginBottom: 10 }}>
            <span className="status-badge st-aktiv">aktiv</span>
            <span className="muted" style={{ fontSize: 13 }}>2FA ist für dein Konto eingeschaltet.</span>
          </div>
          <form className="row-inline form-light" onSubmit={disable} style={{ alignItems: "flex-end" }}>
            <div className="field"><label>Code aus der App zum Abschalten</label>
              <input className="input" inputMode="numeric" autoComplete="one-time-code" placeholder="6-stellig"
                value={code} onChange={(e) => setCode(e.target.value)} required /></div>
            <button className="btn btn-ghost" disabled={busy}>2FA deaktivieren</button>
          </form>
        </>
      ) : setup ? (
        <form onSubmit={enable} className="form-light">
          <p style={{ marginTop: 0 }}>1. QR-Code in deiner Authenticator-App scannen:</p>
          <img src={setup.qr_svg} alt="2FA QR-Code" width={180} height={180}
            style={{ background: "#fff", borderRadius: 12, padding: 8, display: "block" }} />
          <p className="muted" style={{ fontSize: 12 }}>
            Kein Scannen möglich? Schlüssel manuell eingeben: <code style={{ userSelect: "all" }}>{setup.secret}</code>
          </p>
          <div className="row-inline" style={{ alignItems: "flex-end" }}>
            <div className="field"><label>2. Code aus der App eingeben</label>
              <input className="input" inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="6-stellig"
                value={code} onChange={(e) => setCode(e.target.value)} required /></div>
            <button className="btn btn-primary" disabled={busy}>Aktivieren</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setSetup(null); setCode(""); }}>Abbrechen</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary" onClick={start} disabled={busy}>{busy ? "…" : "2FA einrichten"}</button>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
