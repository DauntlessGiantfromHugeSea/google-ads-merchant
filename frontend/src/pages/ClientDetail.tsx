import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Account, Client, Report, api } from "../api";
import { useAuth } from "../App";
import GoogleConnect from "../components/GoogleConnect";

const ACCOUNT_LABELS: Record<string, string> = {
  google_ads: "Google Ads (Customer-ID)",
  merchant_center: "Merchant Center (Händler-ID)",
  website: "Website (URL für SEO)",
};
const REPORT_TYPES: Record<string, string> = {
  combined: "Kompletter Report",
  ads: "Nur Google Ads",
  merchant: "Nur Merchant Center",
  seo: "Nur SEO",
};

function isoToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function ClientDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const isAgency = user?.role !== "client_user";

  const [client, setClient] = useState<Client | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");

  // Konto-Formular
  const [accType, setAccType] = useState("google_ads");
  const [accExt, setAccExt] = useState("");
  // Einladung
  const [invEmail, setInvEmail] = useState("");
  const [invPw, setInvPw] = useState("");
  // Report
  const [repType, setRepType] = useState("combined");
  const [start, setStart] = useState(isoToday(-30));
  const [end, setEnd] = useState(isoToday());
  const [generating, setGenerating] = useState(false);

  const loadAll = () => {
    api.client(id).then(setClient).catch((e) => setError((e as Error).message));
    api.accounts(id).then(setAccounts).catch(() => {});
    api.reports(id).then(setReports).catch(() => {});
  };
  useEffect(() => { loadAll(); }, [id]);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.addAccount(id, { type: accType, external_id: accExt });
      setAccExt("");
      api.accounts(id).then(setAccounts);
    } catch (err) { setError((err as Error).message); }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.invite(id, { email: invEmail, password: invPw });
      setInvEmail(""); setInvPw("");
      alert("Kunden-Zugang angelegt.");
    } catch (err) { setError((err as Error).message); }
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setGenerating(true);
    try {
      const r = await api.createReport(id, { type: repType, period_start: start, period_end: end });
      api.reports(id).then(setReports);
      if (r.status === "completed") {
        await api.downloadPdf(id, r.id, `report-${client?.name}-${end}.pdf`);
      }
    } catch (err) { setError((err as Error).message); }
    finally { setGenerating(false); }
  };

  const completeOnboarding = async () => {
    await api.completeOnboarding(id);
    api.client(id).then(setClient);
  };

  if (!client) return <div className="empty">{error || "Lädt…"}</div>;

  return (
    <>
      <span className="eyebrow">Kunde</span>
      <div className="page-head">
        <h1>{client.name}</h1>
        {isAgency && !client.onboarding_completed && (
          <button className="btn btn-ghost" onClick={completeOnboarding}>Onboarding abschließen</button>
        )}
      </div>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Report erzeugen */}
      <div className="section form-light">
        <h2>Report erzeugen</h2>
        <form className="row-inline" onSubmit={generate}>
          <div className="field">
            <label>Art</label>
            <select className="select" value={repType} onChange={(e) => setRepType(e.target.value)}>
              {Object.entries(REPORT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Von</label>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Bis</label>
            <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={generating || accounts.length === 0}>
            {generating ? "Erzeuge…" : "Erzeugen & PDF laden"}
          </button>
        </form>
        {accounts.length === 0 && <div className="muted" style={{ marginTop: 10 }}>Erst ein Konto verknüpfen.</div>}
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Das PDF wird beim Klick flüchtig erzeugt und direkt geladen – nur die Auswertungsdaten bleiben gespeichert.
        </div>
      </div>

      {/* Bisherige Reports */}
      <div className="section">
        <h2>Reports</h2>
        {reports.length === 0 ? <div className="empty">Noch keine Reports.</div> : reports.map((r) => (
          <div key={r.id} className="list-row">
            <div>
              <strong>{REPORT_TYPES[r.type] || r.type}</strong>{" "}
              <span className="muted">· {r.period_start} – {r.period_end} · {r.data_source}</span>
            </div>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <span className={`report-status status-${r.status}`}>{r.status}</span>
              {r.status === "completed" && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => api.downloadPdf(id, r.id, `report-${client.name}-${r.period_end}.pdf`)}>
                  PDF
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Verknüpfte Konten */}
      <div className="section form-light">
        <h2>Verknüpfte Konten</h2>
        {accounts.map((a) => (
          <div key={a.id} className="list-row" style={{ display: "block" }}>
            <div><strong>{ACCOUNT_LABELS[a.type] || a.type}</strong> <span className="muted">· {a.external_id}</span></div>
            {isAgency && (
              <GoogleConnect clientId={id} account={a} onChange={() => api.accounts(id).then(setAccounts)} />
            )}
          </div>
        ))}
        {isAgency && (
          <form className="row-inline" style={{ marginTop: 14 }} onSubmit={addAccount}>
            <div className="field">
              <label>Typ</label>
              <select className="select" value={accType} onChange={(e) => setAccType(e.target.value)}>
                {Object.entries(ACCOUNT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>ID / URL</label>
              <input className="input" value={accExt} onChange={(e) => setAccExt(e.target.value)} required />
            </div>
            <button className="btn btn-primary">Verknüpfen</button>
          </form>
        )}
      </div>

      {/* Kunden-Zugang einladen */}
      {isAgency && (
        <div className="section form-light">
          <h2>Kunden-Zugang</h2>
          <p className="muted" style={{ marginTop: 0 }}>Legt einen Login an, der nur diesen Kunden sieht.</p>
          <form className="row-inline" onSubmit={invite}>
            <div className="field" style={{ flex: 2 }}>
              <label>E-Mail</label>
              <input className="input" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Start-Passwort</label>
              <input className="input" value={invPw} onChange={(e) => setInvPw(e.target.value)} required />
            </div>
            <button className="btn btn-primary">Einladen</button>
          </form>
        </div>
      )}
    </>
  );
}
