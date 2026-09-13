import { useEffect, useState } from "react";
import { PanelSitePublic, api } from "../api";
import { useToast } from "../toast";

const fmtDur = (s: number) => {
  if (!s) return "0 Min.";
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} Std. ${m} Min.` : `${m} Min.`;
};
const fmtDate = (s: string) => s ? new Date(s).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "";
const fmtDay = (s: string) => s ? new Date(s + "T00:00:00Z").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "";

function Bars({ site }: { site: PanelSitePublic }) {
  if (!site.uptime_daily?.length) return null;
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 46, marginTop: 6 }}>
      {site.uptime_daily.map((d) => {
        const p = d.percent == null ? 100 : d.percent;
        const col = p >= 99.5 ? "#34d399" : p >= 97 ? "#f8836b" : "#ef4444";
        return <div key={d.day} title={`${fmtDay(d.day)}: ${p.toFixed(2)} %`}
          style={{ flex: 1, minWidth: 3, height: `${Math.max(8, p)}%`, background: col, borderRadius: 2 }} />;
      })}
    </div>
  );
}

function SiteCard({ s }: { s: PanelSitePublic }) {
  const ampel = s.online ? "#34d399" : "#ef4444";
  const ampelLabel = s.online ? "erreichbar" : "nicht erreichbar";
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 15 }}>{s.name}</strong>
          <div className="muted" style={{ fontSize: 12 }}>{s.url}</div>
        </div>
        <span className="row-inline" style={{ alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: ampel, display: "inline-block" }} />
          {ampelLabel}
        </span>
      </div>

      <div className="row-inline" style={{ gap: 18, marginTop: 12, flexWrap: "wrap" }}>
        <div><div className="muted" style={{ fontSize: 11 }}>Verfügbarkeit (30 T.)</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{s.uptime_percent == null ? "–" : `${s.uptime_percent.toFixed(2)} %`}</div></div>
        <div><div className="muted" style={{ fontSize: 11 }}>Offene Updates</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{s.pending_updates}</div></div>
        <div><div className="muted" style={{ fontSize: 11 }}>Sicherheit</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{s.security_score == null ? "–" : `${s.security_score}/100`}</div></div>
        {s.avg_response_ms != null && <div><div className="muted" style={{ fontSize: 11 }}>Ø Antwort</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{s.avg_response_ms} ms</div></div>}
      </div>

      <Bars site={s} />

      {s.incidents?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".3px" }}>Störungen</div>
          {s.incidents.slice(0, 5).map((i, k) => (
            <div key={k} style={{ fontSize: 13, marginTop: 2 }}>
              {fmtDate(i.started_at)} · Dauer {fmtDur(i.seconds)}{i.ongoing && " · läuft noch"}
            </div>
          ))}
        </div>
      )}

      {s.updates_applied?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".3px" }}>Eingespielte Updates</div>
          {s.updates_applied.slice(0, 8).map((u, k) => (
            <div key={k} style={{ fontSize: 13, marginTop: 2 }}>
              {fmtDate(u.at)} · {u.name}{u.from_version && u.to_version ? ` (${u.from_version} → ${u.to_version})` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PanelStatus({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<{ linked: boolean; sites: PanelSitePublic[] } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => { api.clientPanel(clientId).then(setData).catch(() => setData({ linked: false, sites: [] })); }, [clientId]);

  const sendReport = async () => {
    setSending(true);
    try { const r = await api.panelReportMail(clientId); toast(`Statusbericht an ${r.to} gesendet.`); }
    catch (e) { toast((e as Error).message, "err"); }
    finally { setSending(false); }
  };

  if (!data) return null;
  if (!data.linked) {
    // Für Kunden nichts anzeigen; für die Agentur ein dezenter Hinweis zur Zuordnung.
    return isAgency ? (
      <div className="section"><h2>Website-Status</h2>
        <p className="muted" style={{ marginTop: 0 }}>Diesem Kunden sind noch keine Panel-Seiten zugeordnet. Zuordnung unter „Schnittstellen → Website-Verwaltung".</p>
      </div>
    ) : null;
  }
  if (data.sites.length === 0) return null;

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>Website-Status</h2>
        {isAgency && <button className="btn btn-ghost btn-sm" onClick={sendReport} disabled={sending}>{sending ? "sendet…" : "Statusbericht per Mail"}</button>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Live-Stand deiner Website(s): Verfügbarkeit, Updates und Sicherheit.</p>
      {data.sites.map((s) => <SiteCard key={s.id} s={s} />)}
    </div>
  );
}
