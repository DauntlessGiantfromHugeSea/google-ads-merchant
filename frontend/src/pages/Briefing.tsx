import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BriefingPublic, api } from "../api";

export default function Briefing() {
  const { id = "" } = useParams();
  const [meta, setMeta] = useState<BriefingPublic | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.briefingPublic(id).then(setMeta)
      .catch(() => setError("Dieses Formular ist abgelaufen oder existiert nicht."));
  }, [id]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api.submitBriefing(id, form); setDone(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap" style={{ alignItems: "flex-start", padding: "40px 16px" }}>
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <img className="login-logo" src="/api/branding/logo" alt="North Flow"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />

        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

        {!error && done && (
          <>
            <h1 style={{ fontSize: 22 }}>Danke! ✓</h1>
            <div className="sub" style={{ marginTop: 8 }}>Deine Anfrage ist bei uns eingegangen. Wir melden uns.</div>
          </>
        )}

        {!error && !done && meta && (
          <>
            <div className="sub" style={{ marginTop: 4 }}>Briefing · {meta.type_label}</div>
            <h1 style={{ fontSize: 22 }}>{meta.label || "Deine Anfrage"}</h1>
            {meta.intro && <div className="sub" style={{ whiteSpace: "pre-line", marginTop: 8 }}>{meta.intro}</div>}
            <form onSubmit={submit} style={{ marginTop: 10 }}>
              <div className="row-inline">
                <div className="field" style={{ flex: 1 }}><label>Dein Name *</label>
                  <input className="input" value={form.contact_name || ""} onChange={set("contact_name")} required /></div>
                <div className="field" style={{ flex: 1 }}><label>E-Mail *</label>
                  <input className="input" type="email" value={form.contact_email || ""} onChange={set("contact_email")} required /></div>
              </div>
              <div className="field"><label>Firma</label>
                <input className="input" value={form.company || ""} onChange={set("company")} /></div>
              <div className="field"><label>Zielgruppe *</label>
                <input className="input" value={form.audience || ""} onChange={set("audience")} required placeholder="Wen wollen wir erreichen?" /></div>
              <div className="field"><label>Ziel *</label>
                <input className="input" value={form.goal || ""} onChange={set("goal")} required placeholder="Was soll erreicht werden?" /></div>
              <div className="row-inline">
                <div className="field" style={{ flex: 1 }}><label>Format *</label>
                  <input className="input" value={form.format || ""} onChange={set("format")} required placeholder={meta.format_hint} /></div>
                <div className="field" style={{ flex: 1 }}><label>Kanal *</label>
                  <input className="input" value={form.channel || ""} onChange={set("channel")} required placeholder={meta.channel_hint} /></div>
              </div>
              <div className="field"><label>Deadline *</label>
                <input className="input" type="date" value={form.deadline || ""} onChange={set("deadline")} required /></div>
              <div className="field"><label>Details / weitere Infos</label>
                <textarea className="input" rows={4} value={form.details || ""} onChange={set("details")} /></div>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
                {busy ? "Senden…" : "Anfrage absenden"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
