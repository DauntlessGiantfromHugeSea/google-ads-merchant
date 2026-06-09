import { useState } from "react";
import { Account, CredentialInput, api } from "../api";

const GUIDE: Record<string, { title: string; steps: string[]; link: string }> = {
  google_ads: {
    title: "Google Ads verbinden",
    steps: [
      "Google-Ads-Konto öffnen → Tools → API-Center → Developer-Token beantragen (Basic Access genügt für eigene Konten).",
      "In der Google Cloud Console ein Projekt anlegen, OAuth-Zustimmungsbildschirm konfigurieren und OAuth-Client (Desktop) erstellen → Client-ID und Client-Secret notieren.",
      "Mit diesem OAuth-Client einen Refresh-Token erzeugen (Scope https://www.googleapis.com/auth/adwords), z.B. über den OAuth Playground oder das google-ads-Hilfsskript.",
      "Customer-ID des Kunden ist die 10-stellige Ads-Konto-Nummer (oben rechts). Bei MCC zusätzlich die Login-Customer-ID (MCC-Nummer) eintragen.",
    ],
    link: "https://developers.google.com/google-ads/api/docs/get-started/introduction",
  },
  merchant_center: {
    title: "Merchant Center verbinden",
    steps: [
      "Händler-ID im Merchant Center oben rechts ablesen (das ist die external_id dieses Kontos).",
      "In der Google Cloud Console die Content API for Shopping aktivieren und einen OAuth-Client erstellen → Client-ID/Secret.",
      "Refresh-Token mit Scope https://www.googleapis.com/auth/content erzeugen.",
      "Der verbundene Google-Account muss Zugriff auf das Merchant Center haben.",
    ],
    link: "https://developers.google.com/shopping-content/guides/quickstart",
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
  const set = (k: keyof CredentialInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
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
          {isAds && (
            <>
              <div className="field"><label>Developer-Token</label>
                <input className="input" value={form.developer_token || ""} onChange={set("developer_token")} required /></div>
              <div className="field"><label>Login-Customer-ID (MCC, optional)</label>
                <input className="input" value={form.login_customer_id || ""} onChange={set("login_customer_id")} /></div>
            </>
          )}
          <div className="field"><label>OAuth Client-ID</label>
            <input className="input" value={form.client_id || ""} onChange={set("client_id")} required /></div>
          <div className="field"><label>OAuth Client-Secret</label>
            <input className="input" value={form.client_secret || ""} onChange={set("client_secret")} required /></div>
          <div className="field"><label>Refresh-Token</label>
            <input className="input" value={form.refresh_token || ""} onChange={set("refresh_token")} required /></div>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
