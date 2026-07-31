import { useEffect, useState } from "react";
import { Client, SeoAuditBrief, api } from "../api";
import { useToast } from "../toast";

const SEV_ORDER = ["Critical", "High", "Medium", "Low", "Info"];
const SEV_DE: Record<string, string> = { Critical: "kritisch", High: "hoch", Medium: "mittel", Low: "niedrig", Info: "info" };
const gradeColor = (s: number) => s >= 75 ? "#34d399" : s >= 60 ? "#fbbf24" : "#f87171";

export default function SeoPage() {
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<any>(null);
  const [drift, setDrift] = useState<any>(null);
  const [history, setHistory] = useState<SeoAuditBrief[]>([]);

  const loadHistory = () => api.seoAudits().then(setHistory).catch(() => {});
  useEffect(() => { api.clients().then(setClients).catch(() => {}); loadHistory(); }, []);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true); setAudit(null); setDrift(null);
    try {
      const c = clients.find((x) => x.id === clientId);
      const u = url.trim() || (c?.website || "");
      const r = await api.runSeoAudit(u, clientId || null);
      setAudit(r.data); setDrift(r.drift); loadHistory();
      toast(`Audit fertig · Score ${r.data.health_score}/100`);
    } catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); }
  };
  const openAudit = async (id: string) => {
    setBusy(true);
    try { const a = await api.seoAudit(id); setAudit(a.data); setDrift(null); }
    catch { /* ignore */ } finally { setBusy(false); }
  };
  const del = async (a: SeoAuditBrief) => { if (!confirm("Audit löschen?")) return; await api.deleteSeoAudit(a.id); loadHistory(); };
  const currentId = () => history.find((h) => h.url === audit?.url)?.id;

  return (
    <>
      <div className="hero">
        <h1>SEO-Check</h1>
        <div className="sub">Deterministische Analyse (ohne KI) mit Findings, Action-Plan und Score.</div>
      </div>

      <div className="section">
        <form className="row-inline" onSubmit={run}>
          <div className="field" style={{ flex: 2 }}><label>URL</label>
            <input className="input form-light" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://kunde.de" /></div>
          <div className="field"><label>Kunde (optional)</label>
            <select className="select form-light" value={clientId} onChange={(e) => { setClientId(e.target.value); const c = clients.find((x) => x.id === e.target.value); if (c?.website && !url) setUrl(c.website); }}>
              <option value="">— keiner —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Analysiere…" : "Analyse starten"}</button>
        </form>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Crawlt die Seite live. Für echte Core Web Vitals einen Google-PageSpeed-API-Key in den Einstellungen hinterlegen.</p>
      </div>

      {audit && (
        <>
          <div className="section">
            <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="row-inline" style={{ alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: gradeColor(audit.health_score) }}>
                  {audit.health_score}<span style={{ fontSize: 16, color: "var(--muted)" }}>/100 · {audit.grade}</span>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {audit.domain} · {audit.pages_analyzed} Seiten geprüft<br />
                  {audit.summary.critical} kritisch · {audit.summary.high} hoch · {audit.summary.medium} mittel
                  {drift && <span> · Δ zum letzten Mal: <strong style={{ color: drift.delta >= 0 ? "#34d399" : "#f87171" }}>{drift.delta >= 0 ? "+" : ""}{drift.delta}</strong></span>}
                </div>
              </div>
              {currentId() && <button className="btn btn-ghost btn-sm" onClick={() => api.downloadSeoPdf(currentId()!, audit.domain)}>PDF-Report</button>}
            </div>
          </div>

          <div className="section">
            <h2>Kategorien</h2>
            {audit.categories.map((cat: any) => (
              <div key={cat.name} className="list-row" style={{ alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <strong>{cat.name}</strong>
                  <div style={{ height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, marginTop: 5, maxWidth: 260 }}>
                    <div style={{ height: 8, width: `${cat.score}%`, background: gradeColor(cat.score), borderRadius: 4 }} />
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}><strong style={{ color: "var(--ink)" }}>{cat.score}</strong> · {cat.findings.length} Findings</div>
              </div>
            ))}
          </div>

          {audit.action_plan.length > 0 && (
            <div className="section">
              <h2>Action-Plan</h2>
              {audit.action_plan.map((p: any) => (
                <div key={p.name} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>{p.name} <span className="muted" style={{ fontWeight: 400 }}>· {p.timeframe}</span></div>
                  <ol style={{ margin: "4px 0 0 18px" }}>
                    {p.items.map((it: any, i: number) => <li key={i} style={{ marginBottom: 3 }}><strong>{it.title}</strong> — {it.recommendation}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {audit.categories.filter((c: any) => c.findings.length).map((cat: any) => (
            <div key={cat.name} className="section">
              <h2>{cat.name} · {cat.score}/100</h2>
              {[...cat.findings].sort((a: any, b: any) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)).map((f: any, i: number) => (
                <div key={i} className="finding-row">
                  <div><span className={`sev sev-${f.severity}`}>{SEV_DE[f.severity] || f.severity}</span><strong>{f.title}</strong></div>
                  <div className="muted" style={{ fontSize: 13 }}>{f.description}</div>
                  <div style={{ fontSize: 13 }}>→ {f.recommendation}</div>
                  {f.verification && <div className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>Prüffrage: {f.verification}</div>}
                </div>
              ))}
              {cat.what_works.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>✓ In Ordnung: {cat.what_works.join(", ")}</div>}
            </div>
          ))}
        </>
      )}

      <div className="section">
        <h2>Verlauf</h2>
        {history.length === 0 ? <div className="empty">Noch keine Audits.</div> : history.map((h) => (
          <div key={h.id} className="list-row">
            <div style={{ cursor: "pointer" }} onClick={() => openAudit(h.id)}>
              <strong style={{ color: gradeColor(h.score) }}>{h.score}</strong> <span className="muted">· {h.url} · {new Date(h.created_at).toLocaleString("de-DE")}</span>
            </div>
            <div className="row-inline" style={{ alignItems: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => openAudit(h.id)}>ansehen</button>
              <button className="del" onClick={() => del(h)}>löschen</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
