import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

const FIELDS: { key: string; label: string; area?: boolean; type?: string }[] = [
  { key: "company", label: "Firma" },
  { key: "contact_person", label: "Ansprechpartner" },
  { key: "email", label: "E-Mail", type: "email" },
  { key: "phone", label: "Telefon" },
  { key: "website", label: "Website" },
  { key: "billing_address", label: "Rechnungsadresse", area: true },
  { key: "vat_id", label: "USt-IdNr" },
  { key: "billing_email", label: "Rechnungs-E-Mail", type: "email" },
  { key: "notes", label: "Anmerkungen", area: true },
];

export default function Intake() {
  const { id = "" } = useParams();
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.intakePublic(id).then((r) => setLabel(r.label || "Kundendaten"))
      .catch(() => setError("Dieses Formular ist abgelaufen oder existiert nicht."));
  }, [id]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api.submitIntake(id, form); setDone(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <img className="login-logo" src="/api/branding/logo" alt="North Flow"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/logo.svg"; }} />

        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

        {!error && done && (
          <>
            <h1 style={{ fontSize: 22 }}>Danke! ✓</h1>
            <div className="sub" style={{ marginTop: 8 }}>Deine Daten wurden übermittelt. Du kannst dieses Fenster schließen.</div>
          </>
        )}

        {!error && !done && label !== null && (
          <>
            <h1 style={{ fontSize: 22 }}>{label}</h1>
            <div className="sub" style={{ marginTop: 8 }}>Bitte trage deine Firmen- und Rechnungsdaten ein.</div>
            <form onSubmit={submit}>
              {FIELDS.map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  {f.area
                    ? <textarea className="input" value={form[f.key] || ""} onChange={set(f.key)} />
                    : <input className="input" type={f.type || "text"} value={form[f.key] || ""} onChange={set(f.key)} />}
                </div>
              ))}
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
                {busy ? "Senden…" : "Daten übermitteln"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
