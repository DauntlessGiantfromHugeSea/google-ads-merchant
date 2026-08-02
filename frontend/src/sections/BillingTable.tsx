import { Fragment, useEffect, useMemo, useState } from "react";
import { Client, Project, TimeEntry, api } from "../api";
import { buildRollup, decH, downloadCsv, eur, human, monthLabel, monthOf, toCsv } from "../lib/timeBilling";

// Abrechnungs-Tabelle: Zeiten je Kunde/Projekt, Stundensätze inline editierbar,
// Beträge im 15-Minuten-Takt, CSV-Export. In der Zeit-Seite und im Kundenprofil.
export default function BillingTable({ entries, clients, projects, filenameBase }: {
  entries: TimeEntry[]; clients: Client[]; projects: Project[]; filenameBase: string;
}) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [cRates, setCRates] = useState<Record<string, number>>({});
  const [pRates, setPRates] = useState<Record<string, number>>({});

  useEffect(() => { setCRates(Object.fromEntries(clients.map((c) => [c.id, c.hourly_rate || 0]))); }, [clients]);
  useEffect(() => { setPRates(Object.fromEntries(projects.map((p) => [p.id, p.hourly_rate || 0]))); }, [projects]);

  const rateOf = (clientId: string | null, projectId: string | null) => {
    const pr = projectId ? pRates[projectId] || 0 : 0;
    return pr > 0 ? pr : (clientId ? cRates[clientId] || 0 : 0);
  };

  const months = useMemo(() =>
    Array.from(new Set(entries.map((e) => monthOf(e.started_at)))).sort().reverse(), [entries]);
  const roll = useMemo(() => buildRollup(entries, month, rateOf), [entries, month, cRates, pRates]);

  const saveClientRate = (clientId: string, v: number) => {
    setCRates((r) => ({ ...r, [clientId]: v }));
  };
  const commitClientRate = (clientId: string) =>
    api.updateClient(clientId, { hourly_rate: cRates[clientId] || 0 }).catch(() => {});
  const commitProjectRate = (clientId: string, projectId: string) =>
    api.updateProject(clientId, projectId, { hourly_rate: pRates[projectId] || 0 }).catch(() => {});

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div className="row-inline" style={{ alignItems: "center", gap: 8 }}>
          <select className="select form-light" style={{ maxWidth: 200 }} value={month} onChange={(e) => setMonth(e.target.value)}>
            {(months.includes(month) ? months : [month, ...months]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm"
            onClick={() => downloadCsv(`${filenameBase}-${month}.csv`, toCsv(entries, month, rateOf))}>⬇ CSV</button>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 12 }}>Abrechenbar · Betrag</div>
          <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 700 }}>
            {decH(roll.grandSec)} h · {eur(roll.grandAmount)}
          </div>
        </div>
      </div>

      {roll.rows.length === 0 ? <div className="empty sm">Keine Zeiten in diesem Monat.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="inv-table">
            <thead><tr>
              <th>Kunde / Projekt</th><th style={{ textAlign: "right" }}>Stunden</th>
              <th style={{ textAlign: "right" }}>€/h</th><th style={{ textAlign: "right" }}>Betrag</th>
            </tr></thead>
            <tbody>
              {roll.rows.map((c) => (
                <Fragment key={c.clientId || "_"}>
                  <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                    <td><strong>{c.name}</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{decH(c.sec)} h</strong><div className="muted" style={{ fontSize: 11 }}>{human(c.sec)}</div></td>
                    <td style={{ textAlign: "right" }}>
                      {c.clientId ? (
                        <input className="rate-input" type="number" min="0" step="5" value={cRates[c.clientId] ?? 0}
                          onChange={(e) => saveClientRate(c.clientId, Number(e.target.value))}
                          onBlur={() => commitClientRate(c.clientId)} title="Kundensatz" />
                      ) : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}><strong>{eur(c.amount)}</strong></td>
                  </tr>
                  {c.projects.map((p) => (
                    <tr key={c.clientId + (p.projectId || "_")}>
                      <td style={{ paddingLeft: 22 }} className="muted">↳ {p.title}</td>
                      <td style={{ textAlign: "right" }} className="muted">{decH(p.sec)} h</td>
                      <td style={{ textAlign: "right" }}>
                        {p.projectId ? (
                          <input className="rate-input" type="number" min="0" step="5"
                            value={pRates[p.projectId] || 0}
                            onChange={(e) => setPRates((r) => ({ ...r, [p.projectId]: Number(e.target.value) }))}
                            onBlur={() => commitProjectRate(c.clientId, p.projectId)}
                            placeholder="Kundensatz" title="Projektsatz (0 = Kundensatz)" />
                        ) : "—"}
                      </td>
                      <td style={{ textAlign: "right" }} className="muted">{eur(p.amount)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Jeder Eintrag wird auf volle 15 Minuten aufgerundet. Projektsatz überschreibt den Kundensatz (0 = Kundensatz).
      </div>
    </div>
  );
}
