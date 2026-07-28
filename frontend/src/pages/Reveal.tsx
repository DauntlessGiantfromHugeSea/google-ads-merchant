import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SecretInfo, api } from "../api";
import { decryptSecret } from "../crypto";

export default function Reveal() {
  const { id = "" } = useParams();
  const key = window.location.hash.slice(1);
  const [info, setInfo] = useState<SecretInfo | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.secretInfo(id)
      .then(setInfo)
      .catch(() => setError("Dieser Link ist abgelaufen, aufgebraucht oder existiert nicht."));
  }, [id]);

  const reveal = async () => {
    setBusy(true); setError("");
    try {
      const r = await api.revealSecret(id);
      setPlain(await decryptSecret(r.ciphertext, r.iv, key));
      setInfo((p) => (p ? { ...p, views_left: r.views_left } : p));
    } catch {
      setError("Konnte nicht entschlüsselt werden – ist der Link vollständig (inkl. Teil nach #)?");
    } finally { setBusy(false); }
  };
  const copy = () => { if (plain) { navigator.clipboard.writeText(plain); setCopied(true); } };

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <img className="login-logo" src="/api/branding/logo" alt="North Flow"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />
        <h1 style={{ fontSize: 22 }}>Sicheres Geheimnis</h1>

        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

        {!error && info && plain === null && (
          <>
            <div className="sub" style={{ marginTop: 8 }}>
              {info.note && <><strong>{info.note}</strong><br /></>}
              Von {info.created_by}. Noch <strong>{info.views_left}</strong> Aufruf(e) übrig.
            </div>
            <div className="sub" style={{ color: "#ffce9e" }}>⚠️ Das Anzeigen verbraucht einen Aufruf.</div>
            {!key && <div className="error">Im Link fehlt der Schlüssel (Teil nach #) – bitte vollständigen Link öffnen.</div>}
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
              onClick={reveal} disabled={busy || !key}>{busy ? "Entschlüssele…" : "Geheimnis anzeigen"}</button>
          </>
        )}

        {plain !== null && (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Geheimnis (entschlüsselt)</label>
              <textarea className="input" readOnly value={plain} rows={4} onFocus={(e) => e.currentTarget.select()} />
            </div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={copy}>
              {copied ? "Kopiert ✓" : "Kopieren"}
            </button>
            <div className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
              Noch {info?.views_left ?? 0} Aufruf(e) übrig. Danach wird das Geheimnis unwiderruflich gelöscht.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
