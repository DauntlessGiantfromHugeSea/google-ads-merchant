import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ContractRow, api } from "../api";
import { useToast } from "../toast";

const ST: Record<string, string> = { draft: "Entwurf", sent: "gesendet", signed: "unterschrieben", declined: "abgelehnt" };
const stCls = (s: string) => s === "signed" ? "st-aktiv" : s === "declined" ? "st-pausiert" : "st-lead";
const fmt = (s: string) => s ? new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";

export default function ContractsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { api.allContracts().then(setRows).catch(() => {}).finally(() => setLoaded(true)); }, []);

  const filtered = useMemo(() => rows
    .filter((c) => !status || c.status === status)
    .filter((c) => !q || `${c.number} ${c.title} ${c.client_name} ${c.signer_name}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q, status]);

  const pdf = async (c: ContractRow) => {
    try { await api.downloadContractOverviewPdf(c.id, c.number); }
    catch (e) { toast((e as Error).message, "err"); }
  };

  const counts = useMemo(() => {
    const n: Record<string, number> = {};
    rows.forEach((c) => { n[c.status] = (n[c.status] || 0) + 1; });
    return n;
  }, [rows]);

  return (
    <>
      <div className="page-head"><h1>Verträge</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          Alle Verträge über alle Kunden · {rows.length} gesamt
          {rows.length > 0 && ` · ${counts.signed || 0} unterschrieben · ${counts.sent || 0} offen`}
        </div></div>

      <div className="section">
        <div className="row-inline" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input className="input form-light" placeholder="Suchen (Nummer, Titel, Kunde …)" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">alle Status</option>
            {["draft", "sent", "signed", "declined"].map((s) => <option key={s} value={s}>{ST[s]}</option>)}
          </select>
        </div>

        {!loaded ? <div className="muted">Lädt…</div> : filtered.length === 0 ? (
          <div className="empty">Keine Verträge gefunden.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inv-table" style={{ width: "100%", fontSize: 13 }}>
              <thead><tr>
                <th>Vertrag</th><th>Kunde</th><th>Status</th><th>Unterschrieben</th><th>Erstellt</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.number || "—"}</strong>{c.title && <div className="muted" style={{ fontSize: 11 }}>{c.title}</div>}</td>
                    <td>{c.client_name || <span className="muted">—</span>}</td>
                    <td><span className={`status-badge ${stCls(c.status)}`}>{ST[c.status] || c.status}</span></td>
                    <td>{c.status === "signed" ? `${fmt(c.signed_at)}${c.signer_name ? ` · ${c.signer_name}` : ""}` : "–"}</td>
                    <td className="muted">{fmt(c.created_at)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => api.openContractOverviewPdf(c.id).catch((e) => toast((e as Error).message, "err"))}>öffnen</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => pdf(c)}>PDF</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/clients/${c.client_id}?tab=vertrieb`)}>Kunde</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
