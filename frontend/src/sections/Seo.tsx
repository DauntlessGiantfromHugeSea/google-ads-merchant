import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";

const SEV_ORDER = ["Critical", "High", "Medium", "Low", "Info"];
const SEV_DE: Record<string, string> = { Critical: "kritisch", High: "hoch", Medium: "mittel", Low: "niedrig", Info: "info" };
const gradeColor = (s: number) => (s >= 75 ? "#34d399" : s >= 60 ? "#fbbf24" : "#f87171");
const catLabel = (c?: string) =>
  c === "FAST" ? "gut" : c === "AVERAGE" ? "mittel" : c === "SLOW" ? "langsam" : "–";
const catColor = (c?: string) =>
  c === "FAST" ? "#34d399" : c === "AVERAGE" ? "#fbbf24" : c === "SLOW" ? "#f87171" : "var(--muted)";
const fmtMs = (v: number | null | undefined) =>
  v == null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;

// Ein Core-Web-Vital als Kachel.
function Vital({ label, value, cat }: { label: string; value: string; cat?: string }) {
  return (
    <div className="cwv-tile">
      <div className="cwv-label">{label}</div>
      <div className="cwv-value">{value}</div>
      <span className="cwv-cat" style={{ color: catColor(cat) }}>{catLabel(cat)}</span>
    </div>
  );
}

// Websites vergleichbar machen (Schema/Slash/www egal).
const normUrl = (u: string) =>
  (u || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");

export default function Seo({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [audits, setAudits] = useState<any[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [site, setSite] = useState("");
  const [current, setCurrent] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    api.clientSeoAudits(clientId).then((list) => {
      setAudits(list);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  useEffect(() => {
    api.clientSeoSites(clientId).then((s) => { setSites(s); setSite((cur) => cur || s[0] || ""); }).catch(() => {});
    load();
  }, [clientId]);

  // Audits der aktuell gewählten Website (oder alle, falls keine Website hinterlegt).
  const siteAudits = useMemo(() =>
    site ? audits.filter((a) => normUrl(a.url) === normUrl(site)) : audits,
  [audits, site]);
  // Angezeigtes Audit = manuell gewählt, sonst das neueste der Website.
  useEffect(() => {
    setCurrent((cur: any) =>
      cur && siteAudits.some((a) => a.id === cur.id) ? cur : (siteAudits[0] || null));
  }, [siteAudits]);

  const remeasure = async () => {
    setBusy(true);
    try {
      const r = await api.runClientSeoAudit(clientId, site || undefined);
      setCurrent(r);
      toast(`Neu gemessen · Score ${r.data.health_score}/100`);
      load();
    } catch (e) { toast((e as Error).message, "err"); }
    finally { setBusy(false); }
  };

  const data = current?.data;
  const cwv = data?.cwv;
  const drift = current?.drift;
  const sorted = useMemo(() =>
    (data?.categories || []).filter((c: any) => c.findings.length), [data]);

  // Kunden sehen SEO nur, wenn es eingerichtet ist: eine Messung liegt vor
  // oder mindestens eine Website ist hinterlegt (dann können sie selbst messen).
  if (!isAgency && loaded && audits.length === 0 && sites.length === 0) return null;

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>SEO-Check</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Deine Sichtbarkeit &amp; Ladewerte – jederzeit neu messbar.
          </div>
        </div>
        <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
          {sites.length > 1 && (
            <select className="select form-light" style={{ maxWidth: 240 }}
              value={site} onChange={(e) => { setSite(e.target.value); setCurrent(null); }}>
              {sites.map((s) => <option key={s} value={s}>{s.replace(/^https?:\/\//, "")}</option>)}
            </select>
          )}
          <button className="btn btn-primary btn-sm" onClick={remeasure} disabled={busy}>
            {busy ? "Messe…" : "↻ Neu messen"}
          </button>
        </div>
      </div>

      {sites.length > 1 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {sites.length} Websites hinterlegt – „Neu messen" prüft die oben gewählte.
        </div>
      )}

      {!loaded ? null : !current ? (
        <div className="empty">
          {site ? <>Noch keine Messung für <strong>{site.replace(/^https?:\/\//, "")}</strong>. Klick auf „Neu messen".</>
                : "Noch keine Messung. Klick auf „Neu messen\", um zu starten."}
        </div>
      ) : (
        <>
          <div className="seo-head">
            <div className="seo-score" style={{ color: gradeColor(data.health_score) }}>
              {data.health_score}<span>/100 · {data.grade}</span>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {data.domain} · {data.pages_analyzed} Seiten geprüft<br />
              {data.summary.critical} kritisch · {data.summary.high} hoch · {data.summary.medium} mittel
              {drift && (
                <span> · Δ seit letzter Messung:{" "}
                  <strong style={{ color: drift.delta >= 0 ? "#34d399" : "#f87171" }}>
                    {drift.delta >= 0 ? "+" : ""}{drift.delta}
                  </strong>
                </span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => api.downloadSeoPdf(current.id, data.domain)}>
              PDF-Report
            </button>
          </div>

          {/* PageSpeed / Core Web Vitals */}
          <div className="cwv-block">
            <div className="cwv-title">
              PageSpeed
              {cwv && <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                {cwv.has_field ? "Felddaten (echte Nutzer, mobil)" : "Labor-Messung (mobil)"}
              </span>}
            </div>
            {cwv ? (
              <div className="cwv-grid">
                <Vital label="Performance-Score"
                  value={cwv.perf_score != null ? `${cwv.perf_score}/100` : "–"} />
                <Vital label="LCP (Ladezeit)"
                  value={cwv.has_field ? fmtMs(cwv.lcp?.percentile) : "–"} cat={cwv.lcp?.category} />
                <Vital label="INP (Reaktion)"
                  value={cwv.has_field ? fmtMs(cwv.inp?.percentile) : "–"} cat={cwv.inp?.category} />
                <Vital label="CLS (Layout)"
                  value={cwv.has_field && cwv.cls?.percentile != null ? (cwv.cls.percentile / 100).toFixed(2) : "–"}
                  cat={cwv.cls?.category} />
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                Keine PageSpeed-Werte verfügbar.
                {isAgency && " Für echte Core Web Vitals einen Google-PageSpeed-API-Key in den Einstellungen hinterlegen."}
              </div>
            )}
          </div>

          {/* Kategorien */}
          <div style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Kategorien</h3>
            {data.categories.map((cat: any) => (
              <div key={cat.name} className="list-row" style={{ alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <strong>{cat.name}</strong>
                  <div style={{ height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, marginTop: 5, maxWidth: 260 }}>
                    <div style={{ height: 8, width: `${cat.score}%`, background: gradeColor(cat.score), borderRadius: 4 }} />
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                  <strong style={{ color: "var(--ink)" }}>{cat.score}</strong> · {cat.findings.length} Punkte
                </div>
              </div>
            ))}
          </div>

          {/* Action-Plan */}
          {data.action_plan.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Empfohlene Schritte</h3>
              {data.action_plan.map((p: any) => (
                <div key={p.name} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>{p.name} <span className="muted" style={{ fontWeight: 400 }}>· {p.timeframe}</span></div>
                  <ol style={{ margin: "4px 0 0 18px" }}>
                    {p.items.map((it: any, i: number) => <li key={i} style={{ marginBottom: 3 }}><strong>{it.title}</strong> — {it.recommendation}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* Findings je Kategorie */}
          {sorted.map((cat: any) => (
            <div key={cat.name} style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>{cat.name} · {cat.score}/100</h3>
              {[...cat.findings].sort((a: any, b: any) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)).map((f: any, i: number) => (
                <div key={i} className="finding-row">
                  <div><span className={`sev sev-${f.severity}`}>{SEV_DE[f.severity] || f.severity}</span><strong>{f.title}</strong></div>
                  <div className="muted" style={{ fontSize: 13 }}>{f.description}</div>
                  <div style={{ fontSize: 13 }}>→ {f.recommendation}</div>
                </div>
              ))}
              {cat.what_works.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>✓ In Ordnung: {cat.what_works.join(", ")}</div>}
            </div>
          ))}

          {/* Verlauf (der gewählten Website) */}
          {siteAudits.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Verlauf</h3>
              {siteAudits.map((a) => (
                <div key={a.id} className="list-row clickable" onClick={() => setCurrent(a)}
                  style={{ opacity: a.id === current.id ? 1 : 0.7 }}>
                  <div>
                    <strong style={{ color: gradeColor(a.score) }}>{a.score}</strong>
                    <span className="muted"> · {new Date(a.created_at).toLocaleString("de-DE")}</span>
                  </div>
                  {a.id === current.id && <span className="muted" style={{ fontSize: 12 }}>angezeigt</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
