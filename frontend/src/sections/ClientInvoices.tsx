import { useEffect, useState } from "react";
import { Invoice, api } from "../api";
import { useToast } from "../toast";

const eur = (n: number, cur = "EUR") => n.toLocaleString("de-DE", { style: "currency", currency: cur || "EUR" });
function badge(inv: Invoice) {
  if (inv.status === "bezahlt") return { cls: "inv-paid", label: "bezahlt" };
  if (inv.status === "storniert") return { cls: "inv-void", label: "storniert" };
  if (inv.overdue) return { cls: "inv-overdue", label: "überfällig" };
  return { cls: "inv-open", label: "offen" };
}

// Rechnungen des Kunden – im Kundenportal sichtbar.
export default function ClientInvoices({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { api.clientInvoices(clientId).then((r) => { setRows(r); setLoaded(true); }).catch(() => setLoaded(true)); }, [clientId]);

  const send = async () => {
    if (!confirm("Dem Kunden eine E-Mail mit seinen Rechnungen (PDFs im Anhang) schicken?")) return;
    setSending(true);
    try { const r = await api.sendClientInvoices(clientId); toast(`Gesendet an ${r.to} (${r.count} Rechnung(en)).`); }
    catch (e) { toast((e as Error).message, "err"); }
    finally { setSending(false); }
  };

  // Kunden ohne Rechnungen: Abschnitt ausblenden.
  if (loaded && rows.length === 0 && !isAgency) return null;

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ marginBottom: 2 }}>Rechnungen</h2>
        {isAgency && rows.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={send} disabled={sending}>{sending ? "Sende…" : "✉ Rechnungen mailen"}</button>
        )}
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Deine Rechnungen zum Ansehen und Herunterladen.</div>
      {!loaded ? null : rows.length === 0 ? (
        <div className="empty sm">Noch keine Rechnungen hinterlegt.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="inv-table">
            <thead><tr><th>Nummer</th><th>Datum</th><th>Leistung</th><th style={{ textAlign: "right" }}>Betrag</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((inv) => {
                const b = badge(inv);
                return (
                  <tr key={inv.id}>
                    <td><strong>{inv.number || "—"}</strong></td>
                    <td className="muted">{inv.issue_date || "—"}</td>
                    <td className="muted">{inv.service_period || "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(inv.amount, inv.currency)}</td>
                    <td><span className={`inv-badge ${b.cls}`}>{b.label}</span></td>
                    <td style={{ textAlign: "right" }}>
                      {inv.has_file
                        ? <button className="btn btn-ghost btn-sm" onClick={() => api.downloadClientInvoiceFile(clientId, inv.id, inv.filename)}>PDF</button>
                        : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
