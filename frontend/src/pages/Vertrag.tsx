import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import SignaturePad from "../components/SignaturePad";

export default function Vertrag() {
  const { token = "" } = useParams();
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sig, setSig] = useState("");
  const [agree, setAgree] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = () => api.publicContract(token).then(setC).catch(() => setError("Vertrag nicht gefunden."));
  useEffect(() => { load(); }, [token]);

  const requestCode = async () => {
    setBusy(true); setMsg(""); setError("");
    try { const r = await api.requestContractCode(token); setCodeSent(true); setMsg(`Bestätigungscode an ${r.email_hint || "deine hinterlegte Adresse"} gesendet.`); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const sign = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api.signContract(token, { name, email, code, signature_image: sig }); setDone(true); load(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  if (error && !c) return <div className="auth-wrap"><div className="auth-card">{error}</div></div>;
  if (!c) return <div className="auth-wrap"><div className="auth-card">Lädt…</div></div>;
  const signed = c.status === "signed" || done;

  return (
    <div className="auth-wrap" style={{ alignItems: "flex-start", padding: "40px 16px" }}>
      <div className="auth-card" style={{ maxWidth: 680, color: "#fff" }}>
        <img className="login-logo" src="/api/branding/logo" alt=""
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />
        <h1 style={{ fontSize: 20 }}>{c.title || "Vertrag"}</h1>
        <div className="sub" style={{ marginTop: 4 }}>Nr. {c.number}{c.date ? ` · ${c.date}` : ""}</div>

        {(c.provider_block || c.client_block) && (
          <div style={{ margin: "16px 0 4px", textAlign: "center", fontSize: 14 }}>
            <div className="sub">zwischen</div>
            <div style={{ whiteSpace: "pre-line" }}>{c.provider_block}</div>
            <div className="sub" style={{ fontStyle: "italic" }}>– nachfolgend Dienstleister genannt –</div>
            <div className="sub" style={{ margin: "6px 0" }}>und</div>
            <div style={{ whiteSpace: "pre-line" }}>{c.client_block}</div>
            <div className="sub" style={{ fontStyle: "italic" }}>– nachfolgend Kunde genannt –</div>
          </div>
        )}

        <div style={{ margin: "16px 0", borderTop: "1px solid rgba(255,255,255,0.14)", paddingTop: 14, fontSize: 14 }}>
          {(c.body || "").split("\n").map((line: string, i: number) => {
            const t = line.trim();
            if (!t) return <div key={i} style={{ height: 10 }} />;
            const base: React.CSSProperties = { marginBottom: 3, lineHeight: 1.55 };
            if (t.startsWith("§")) return <div key={i} style={{ ...base, fontWeight: 700, marginTop: 16 }}>{line}</div>;
            if (/^\(\d+\)/.test(t)) return <div key={i} style={{ ...base, marginLeft: 14, paddingLeft: 24, textIndent: -24 }}>{line}</div>;
            if ("-*•".includes(t[0])) return <div key={i} style={{ ...base, marginLeft: 34, paddingLeft: 16, textIndent: -16 }}>{line}</div>;
            return <div key={i} style={base}>{line}</div>;
          })}
        </div>

        <div className="sub" style={{ marginBottom: 6 }}>
          Dienstleister: {c.agency_signed ? `✓ ${c.agency_signer_name || "unterschrieben"}` : "Unterschrift ausstehend"}
          {" · "}Kunde: {c.client_signed ? `✓ ${c.signer_name || "unterschrieben"}` : "Unterschrift ausstehend"}
        </div>

        {signed ? (
          <div style={{ marginTop: 6, padding: "12px 14px", background: "rgba(52,211,153,0.18)", color: "#6ee7b7", borderRadius: 10 }}>
            ✓ Von dir rechtsverbindlich unterschrieben{c.signed_at ? ` am ${c.signed_at}` : ""}. Vielen Dank!
            <div style={{ marginTop: 10 }}>
              <a className="btn btn-ghost btn-sm" href={api.publicContractPdfUrl(token)} target="_blank" rel="noreferrer">Vertrag als PDF herunterladen</a>
            </div>
          </div>
        ) : (
          <form onSubmit={sign} style={{ marginTop: 8 }}>
            <h3 style={{ fontSize: 15, margin: "6px 0" }}>Digital unterschreiben</h3>
            <div className="field"><label>Dein vollständiger Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>

            <div className="field"><label>Unterschrift</label>
              <SignaturePad onChange={setSig} /></div>

            {c.verify?.mail ? (
              !codeSent ? (
                <>
                  <p className="sub" style={{ marginTop: 0 }}>Zur Verifizierung senden wir einen Code an <strong>{c.verify.email_hint}</strong>.</p>
                  <button type="button" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={requestCode} disabled={busy}>{busy ? "…" : "Bestätigungscode senden"}</button>
                </>
              ) : (
                <div className="field"><label>Bestätigungscode aus der E-Mail</label>
                  <input className="input" inputMode="numeric" autoComplete="one-time-code" placeholder="6-stellig" value={code} onChange={(e) => setCode(e.target.value)} required /></div>
              )
            ) : (
              <div className="field"><label>Deine E-Mail-Adresse zur Bestätigung</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  placeholder={c.verify?.has_email ? c.verify.email_hint : "name@firma.de"} /></div>
            )}

            <label className="sub" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10 }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Ich unterschreibe diesen Vertrag rechtsverbindlich (einfache elektronische Signatur).</span>
            </label>

            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
              disabled={busy || !agree || (c.verify?.mail && !codeSent)}>
              {busy ? "…" : "Verbindlich unterschreiben"}
            </button>
            {msg && <div className="sub" style={{ marginTop: 10, color: "#6ee7b7" }}>{msg}</div>}
            {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          </form>
        )}
        {c.agency?.email && <div className="sub" style={{ marginTop: 16, marginBottom: 0 }}>Fragen? {c.agency.name} · {c.agency.email}</div>}
      </div>
    </div>
  );
}
