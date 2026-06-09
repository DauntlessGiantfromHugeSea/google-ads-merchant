import { useEffect, useState } from "react";
import { Account, Report, api } from "../api";
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
const iso = (off = 0) => { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); };

export default function Reportings({ clientId, clientName, isAgency }:
  { clientId: string; clientName: string; isAgency: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");
  const [accType, setAccType] = useState("website");
  const [accExt, setAccExt] = useState("");
  const [repType, setRepType] = useState("combined");
  const [start, setStart] = useState(iso(-30));
  const [end, setEnd] = useState(iso());
  const [generating, setGenerating] = useState(false);

  const loadAccounts = () => api.accounts(clientId).then(setAccounts).catch(() => {});
  const loadReports = () => api.reports(clientId).then(setReports).catch(() => {});
  useEffect(() => { loadAccounts(); loadReports(); }, [clientId]);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await api.addAccount(clientId, { type: accType, external_id: accExt }); setAccExt(""); loadAccounts(); }
    catch (err) { setError((err as Error).message); }
  };
  const generate = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setGenerating(true);
    try {
      const r = await api.createReport(clientId, { type: repType, period_start: start, period_end: end });
      loadReports();
      if (r.status === "completed") await api.downloadPdf(clientId, r.id, `report-${clientName}-${end}.pdf`);
    } catch (err) { setError((err as Error).message); }
    finally { setGenerating(false); }
  };

  return (
    <>
      <div className="section form-light">
        <h2>Report erzeugen</h2>
        <form className="row-inline" onSubmit={generate}>
          <div className="field"><label>Art</label>
            <select className="select" value={repType} onChange={(e) => setRepType(e.target.value)}>
              {Object.entries(REPORT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="field"><label>Von</label>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="field"><label>Bis</label>
            <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={generating || accounts.length === 0}>
            {generating ? "Erzeuge…" : "Erzeugen & PDF laden"}
          </button>
        </form>
        {accounts.length === 0 && <div className="muted" style={{ marginTop: 10 }}>Erst ein Konto verknüpfen.</div>}
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Das PDF wird beim Klick flüchtig erzeugt und direkt geladen – nur die Auswertungsdaten bleiben gespeichert.
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      <div className="section">
        <h2>Reports</h2>
        {reports.length === 0 ? <div className="empty">Noch keine Reports.</div> : reports.map((r) => (
          <div key={r.id} className="list-row">
            <div><strong>{REPORT_TYPES[r.type] || r.type}</strong>{" "}
              <span className="muted">· {r.period_start} – {r.period_end} · {r.data_source}</span></div>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <span className={`report-status status-${r.status}`}>{r.status}</span>
              {r.status === "completed" && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => api.downloadPdf(clientId, r.id, `report-${clientName}-${r.period_end}.pdf`)}>PDF</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="section form-light">
        <h2>Verknüpfte Konten & Integrationen</h2>
        {accounts.map((a) => (
          <div key={a.id} className="list-row" style={{ display: "block" }}>
            <div><strong>{ACCOUNT_LABELS[a.type] || a.type}</strong> <span className="muted">· {a.external_id}</span></div>
            {isAgency && <GoogleConnect clientId={clientId} account={a} onChange={loadAccounts} />}
          </div>
        ))}
        {accounts.length === 0 && <div className="muted">Noch keine Konten.</div>}
        {isAgency && (
          <form className="row-inline" style={{ marginTop: 14 }} onSubmit={addAccount}>
            <div className="field"><label>Typ</label>
              <select className="select" value={accType} onChange={(e) => setAccType(e.target.value)}>
                {Object.entries(ACCOUNT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div className="field" style={{ flex: 2 }}><label>ID / URL</label>
              <input className="input" value={accExt} onChange={(e) => setAccExt(e.target.value)} required
                placeholder={accType === "website" ? "z.B. kunde-shop.de" : ""} /></div>
            <button className="btn btn-primary">Verknüpfen</button>
          </form>
        )}
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Tipp: Mehrere Websites möglich – jede wird im SEO-Report einzeln analysiert.
        </div>
      </div>
    </>
  );
}
