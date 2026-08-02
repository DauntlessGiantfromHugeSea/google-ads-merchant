import { useEffect, useMemo, useState } from "react";
import { Kpi, KpiSource, api } from "../api";
import { useToast } from "../toast";

// Kennzahl-Definition: key, Label, Formatierung, Gruppe.
type Def = { key: string; label: string; fmt: (n: number) => string; group: "reach" | "conv" | "shop" };
const int = (n: number) => Math.round(n).toLocaleString("de-DE");
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
const HEADLINE: Def[] = [
  { key: "users", label: "Nutzer", fmt: int, group: "reach" },
  { key: "sessions", label: "Sitzungen", fmt: int, group: "reach" },
  { key: "pageviews", label: "Seitenaufrufe", fmt: int, group: "reach" },
  { key: "conversions", label: "Conversions", fmt: int, group: "conv" },
  { key: "leads", label: "Leads", fmt: int, group: "conv" },
  { key: "revenue", label: "Umsatz", fmt: eur, group: "shop" },
  { key: "orders", label: "Bestellungen", fmt: int, group: "shop" },
  { key: "conv_rate", label: "Conversion-Rate", fmt: pct, group: "shop" },
];
const SOURCES: { key: string; label: string; color: string }[] = [
  { key: "src_organic", label: "Organisch", color: "#34d399" },
  { key: "src_paid", label: "Bezahlt", color: "#f8836b" },
  { key: "src_direct", label: "Direkt", color: "#a78bfa" },
  { key: "src_social", label: "Social", color: "#38bdf8" },
  { key: "src_referral", label: "Verweis", color: "#fbbf24" },
];
const fmtPeriod = (p: string) => {
  const [y, m] = p.split("-");
  const names = ["", "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return m ? `${names[Number(m)] || m} ${y}` : p;
};

function Spark({ values, color = "var(--teal)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const w = 120, h = 34, max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Kpis({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [source, setSource] = useState<KpiSource | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const loadKpis = () => api.clientKpis(clientId).then((k) => { setKpis(k); setLoaded(true); }).catch(() => setLoaded(true));
  useEffect(() => {
    loadKpis();
    if (isAgency) api.getKpiSource(clientId).then((s) => { setSource(s); setUrl(s.url); if (s.synced_at) loadKpis(); }).catch(() => {});
  }, [clientId]);

  const save = async () => {
    setBusy(true);
    try {
      const s = await api.setKpiSource(clientId, url);
      setSource(s); setEditing(false);
      if (s.error) toast(s.error, "err"); else toast("Quelle gespeichert & Daten geladen.");
      loadKpis();
    } catch (e) { toast((e as Error).message, "err"); }
    finally { setBusy(false); }
  };
  const sync = async () => {
    setBusy(true);
    try { const s = await api.syncKpis(clientId); setSource(s); toast("Aktualisiert."); loadKpis(); }
    catch (e) { toast((e as Error).message, "err"); }
    finally { setBusy(false); }
  };

  const latest = kpis[kpis.length - 1];
  const prev = kpis[kpis.length - 2];
  const cards = useMemo(() =>
    HEADLINE.filter((d) => latest && latest.metrics[d.key] != null), [latest]);
  const sourceRows = useMemo(() => {
    if (!latest) return [];
    const rows = SOURCES.filter((s) => latest.metrics[s.key] != null)
      .map((s) => ({ ...s, value: latest.metrics[s.key] }));
    const total = rows.reduce((a, r) => a + r.value, 0) || 1;
    return rows.map((r) => ({ ...r, share: (r.value / total) * 100 }));
  }, [latest]);

  const delta = (key: string): { txt: string; up: boolean } | null => {
    if (!latest || !prev || prev.metrics[key] == null || latest.metrics[key] == null) return null;
    const a = prev.metrics[key], b = latest.metrics[key];
    if (a === 0) return null;
    const p = ((b - a) / Math.abs(a)) * 100;
    return { txt: `${p >= 0 ? "+" : ""}${p.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`, up: p >= 0 };
  };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Analytics{latest ? ` · ${fmtPeriod(latest.period)}` : ""}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Kennzahlen aus deinem Google-Sheet – automatisch aktualisiert.
          </div>
        </div>
        {isAgency && (
          <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
            {source?.has_url && <button className="btn btn-ghost btn-sm" onClick={sync} disabled={busy}>{busy ? "…" : "↻ Aktualisieren"}</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing((s) => !s)}>{editing ? "Schließen" : source?.has_url ? "Quelle" : "+ Quelle"}</button>
          </div>
        )}
      </div>

      {isAgency && editing && (
        <div className="form-light" style={{ marginTop: 12 }}>
          <div className="field"><label>Google-Sheet-Link (als CSV im Web veröffentlicht)</label>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv" /></div>
          <details style={{ marginBottom: 10 }}>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>So richtest du das Sheet ein</summary>
            <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
              1. Ein Google Sheet mit den GA4-Zahlen (z. B. per GA4-Add-on, das du <em>in Sheets</em> autorisierst – kein Developer-Projekt nötig).<br />
              2. Aufbau: <strong>erste Spalte = Monat</strong> (z. B. „2026-08" oder „Aug 2026"), dann Spalten wie <em>Nutzer, Sitzungen, Conversions, Leads, Umsatz, Organisch, Bezahlt, Direkt, Social</em> – eine Zeile je Monat.<br />
              3. Datei → Freigeben → <strong>Im Web veröffentlichen</strong> → CSV. Link hier einfügen.
            </div>
          </details>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Lade…" : "Speichern & laden"}</button>
          {source?.error && <div className="error" style={{ marginTop: 8 }}>{source.error}</div>}
        </div>
      )}

      {!loaded ? null : kpis.length === 0 ? (
        <div className="empty">
          {isAgency ? "Noch keine Daten. Hinterlege oben ein veröffentlichtes Google-Sheet." : "Noch keine Auswertung verfügbar."}
        </div>
      ) : (
        <>
          <div className="kpi-cards">
            {cards.map((d) => {
              const series = kpis.map((k) => k.metrics[d.key]).filter((v) => v != null) as number[];
              const dl = delta(d.key);
              const goodUp = d.key !== "conv_rate" ? true : true; // mehr ist überall besser
              return (
                <div key={d.key} className="kpi-card">
                  <div className="kpi-card-label">{d.label}</div>
                  <div className="kpi-card-value">{d.fmt(latest.metrics[d.key])}</div>
                  <div className="kpi-card-foot">
                    {dl && <span className={`kpi-delta ${dl.up === goodUp ? "up" : "down"}`}>{dl.up ? "▲" : "▼"} {dl.txt}</span>}
                    <Spark values={series} color={d.group === "shop" ? "#f8836b" : d.group === "conv" ? "#a78bfa" : "#2dd4bf"} />
                  </div>
                </div>
              );
            })}
          </div>

          {sourceRows.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Traffic-Quellen</h3>
              <div className="kpi-bars">
                {sourceRows.map((r) => (
                  <div key={r.key} className="kpi-bar-row">
                    <span className="kpi-bar-label">{r.label}</span>
                    <div className="kpi-bar-track">
                      <div className="kpi-bar-fill" style={{ width: `${r.share}%`, background: r.color }} />
                    </div>
                    <span className="kpi-bar-val">{int(r.value)} <span className="muted">· {r.share.toFixed(0)} %</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {kpis.length > 1 && (
            <details style={{ marginTop: 16 }}>
              <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Verlauf ({kpis.length} Monate)</summary>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table className="inv-table" style={{ fontSize: 13 }}>
                  <thead><tr><th>Monat</th>{cards.map((d) => <th key={d.key} style={{ textAlign: "right" }}>{d.label}</th>)}</tr></thead>
                  <tbody>
                    {[...kpis].reverse().map((k) => (
                      <tr key={k.period}>
                        <td>{fmtPeriod(k.period)}</td>
                        {cards.map((d) => <td key={d.key} style={{ textAlign: "right" }}>{k.metrics[d.key] != null ? d.fmt(k.metrics[d.key]) : "—"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {source?.synced_at && isAgency && (
            <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Zuletzt aktualisiert: {new Date(source.synced_at).toLocaleString("de-DE")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
