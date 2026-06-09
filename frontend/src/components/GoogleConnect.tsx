import { useState } from "react";
import { Account, CredentialInput, api } from "../api";

const GUIDE: Record<string, { title: string; steps: string[]; link: string }> = {
  google_ads: {
    title: "Google Ads verbinden",
    steps: [
      "Developer-Token aus dem API-Center deines Google-Ads-Verwaltungskontos (MCC) holen (+ Basic Access beantragen).",
      "In der Google Cloud Console einen OAuth-Client (Webanwendung) anlegen → Client-ID + Secret. Redirect-URI: https://developers.google.com/oauthplayground",
      "Refresh-Token im OAuth Playground mit Scope https://www.googleapis.com/auth/adwords erzeugen.",
      "Customer-ID = 10-stellige Konto-Nr. des Kunden (oben rechts). Bei MCC zusätzlich die Login-Customer-ID (MCC-Nr.).",
    ],
    link: "https://developers.google.com/google-ads/api/docs/get-started/introduction",
  },
  merchant_center: {
    title: "Merchant Center verbinden (Service-Account – einfach)",
    steps: [
      "Google Cloud Console → IAM & Verwaltung → Dienstkonten → Dienstkonto erstellen (keine Rolle nötig) → fertig.",
      "Beim Dienstkonto → Schlüssel → Schlüssel hinzufügen → JSON → herunterladen.",
      "Die JSON-Datei öffnen und den GESAMTEN Inhalt hier unten einfügen.",
      "Im Merchant Center → Einstellungen → Nutzer/Kontozugriff → die Dienstkonto-E-Mail (Feld 'client_email' aus der JSON) als Nutzer mit Zugriff hinzufügen.",
      "Oben beim Konto die Händler-ID eintragen (steht oben rechts im Merchant Center).",
    ],
    link: "https://developers.google.com/shopping-content/guides/how-tos/service-accounts",
  },
};

export default function GoogleConnect({
  clientId, account, onChange,
}: { clientId: string; account: Account; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [form, setForm] = useState<CredentialInput>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (account.type === "website") {
    return <span className="muted" style={{ fontSize: 13 }}>SEO braucht keine API-Zugangsdaten.</span>;
  }
  const guide = GUIDE[account.type];
  const isAds = account.type === "google_ads";
  const set = (k: keyof CredentialInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSaving(true);
    try {
      await api.setCredentials(clientId, account.id, form);
      setForm({}); setOpen(false); onChange();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    await api.deleteCredentials(clientId, account.id);
    onChange();
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div className="row-inline" style={{ alignItems: "center", gap: 10 }}>
        {account.credentials_configured
          ? <span className="tag done">API verbunden</span>
          : <span className="tag coral">Nicht verbunden (Demo-Daten)</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Schließen" : account.credentials_configured ? "Zugangsdaten ändern" : "Google-API verbinden"}
        </button>
        {account.credentials_configured && (
          <button className="btn btn-ghost btn-sm" onClick={remove}>Trennen</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setGuideOpen((g) => !g)}>
          {guideOpen ? "Anleitung ausblenden" : "Anleitung"}
        </button>
      </div>

      {guideOpen && (
        <div className="card" style={{ marginTop: 10, boxShadow: "none" }}>
          <h3 style={{ fontSize: 15 }}>{guide.title}</h3>
          <ol className="muted" style={{ fontSize: 13, paddingLeft: 18, lineHeight: 1.6 }}>
            {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a className="switch-link" href={guide.link} target="_blank" rel="noreferrer">
            → Offizielle Google-Dokumentation
          </a>
        </div>
      )}

      {open && (
        <form className="card form-light" style={{ marginTop: 10, boxShadow: "none" }} onSubmit={save}>
          {isAds ? (
            <>
              <div className="field"><label>Developer-Token</label>
                <input className="input" value={form.developer_token || ""} onChange={set("developer_token")} required /></div>
              <div className="field"><label>Login-Customer-ID (MCC, optional)</label>
                <input className="input" value={form.login_customer_id || ""} onChange={set("login_customer_id")} /></div>
              <div className="field"><label>OAuth Client-ID</label>
                <input className="input" value={form.client_id || ""} onChange={set("client_id")} required /></div>
              <div className="field"><label>OAuth Client-Secret</label>
                <input className="input" value={form.client_secret || ""} onChange={set("client_secret")} required /></div>
              <div className="field"><label>Refresh-Token</label>
                <input className="input" value={form.refresh_token || ""} onChange={set("refresh_token")} required /></div>
            </>
          ) : (
            <div className="field">
              <label>Service-Account JSON (kompletten Inhalt der Schlüsseldatei einfügen)</label>
              <textarea className="input" rows={7} value={form.service_account_json || ""}
                onChange={set("service_account_json")} required
                placeholder='{ "type": "service_account", "project_id": "...", "client_email": "...", "private_key": "..." }' />
            </div>
          )}
          <button className="btn btn-primary" disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
