import { useEffect, useMemo, useState } from "react";
import { Client, Invoice, api } from "../api";
import { useToast } from "../toast";

const eur = (n: number, cur = "EUR") =>
  n.toLocaleString("de-DE", { style: "currency", currency: cur || "EUR", maximumFractionDigits: 2 });

function badge(inv: Invoice) {
  if (inv.status === "bezahlt") return { cls: "inv-paid", label: "bezahlt" };
  if (inv.status === "storniert") return { cls: "inv-void", label: "storniert" };
  if (inv.overdue) return { cls: "inv-overdue", label: "überfällig" };
  return { cls: "inv-open", label: "offen" };
}

export default function Invoices() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [filter, setFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Upload-Form
  const [file, setFile] = useState<File | null>(null);
  const [fClient, setFClient] = useState("");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [issue, setIssue] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.invoices(clientFilter || undefined, filter || undefined).then(setInvoices).catch((e) => toast((e as Error).message, "err"));
  };
  useEffect(() => { api.clients().then(setClients).catch(() => {}); }, []);
  useEffect(() => { load(); }, [filter, clientFilter]);

  const totals = useMemo(() => {
    const open = invoices.filter((i) => i.status === "offen");
    return {
      open: open.reduce((a, i) => a + i.amount, 0),
      overdue: open.filter((i) => i.overdue).reduce((a, i) => a + i.amount, 0),
      overdueCount: open.filter((i) => i.overdue).length,
    };
  }, [invoices]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.uploadInvoice({ file, client_id: fClient, number, amount, issue_date: issue, due_date: due, note });
      setFile(null); setFClient(""); setNumber(""); setAmount(""); setIssue(""); setDue(""); setNote("");
      setShowForm(false); load();
      toast("Rechnung gespeichert.");
    } catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); }
  };

  const setStatus = async (inv: Invoice, status: string) => {
    try { await api.updateInvoice(inv.id, { status }); load(); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const remind = async (inv: Invoice) => {
    try { const r = await api.remindInvoice(inv.id); toast(`Erinnerung an ${r.to} gesendet.`); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const del = async (inv: Invoice) => {
    if (!confirm(`Rechnung ${inv.number || ""} löschen?`)) return;
    await api.deleteInvoice(inv.id); load();
  };

  return (
    <>
      <div className="page-head">
        <h1>Rechnungen</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Abbrechen" : "+ Rechnung"}
        </button>
      </div>

      <div className="hero-stats" style={{ marginBottom: 18 }}>
        <div className="hero-stat"><div className="v">{eur(totals.open)}</div><div className="l">Offen gesamt</div></div>
        <div className="hero-stat"><div className="v" style={{ color: totals.overdue ? "#f87171" : undefined }}>{eur(totals.overdue)}</div><div className="l">Überfällig ({totals.overdueCount})</div></div>
        <div className="hero-stat"><div className="v">{invoices.length}</div><div className="l">Rechnungen</div></div>
      </div>

      {showForm && (
        <form className="section form-light" onSubmit={submit}>
          <h2>Rechnung reinladen</h2>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            Bei E-Rechnungen (XRechnung / ZUGFeRD) werden Nummer, Betrag und Fälligkeit automatisch ausgelesen.
          </p>
          <div className="field"><label>Datei (PDF oder XML, optional)</label>
            <input className="input" type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml"
              onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Kunde</label>
              <select className="select" value={fClient} onChange={(e) => setFClient(e.target.value)}>
                <option value="">— keiner —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="field" style={{ flex: 1 }}><label>Nummer</label>
              <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="auto aus Datei" /></div>
            <div className="field" style={{ flex: 1 }}><label>Betrag (€)</label>
              <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <div className="row-inline">
            <div className="field" style={{ flex: 1 }}><label>Rechnungsdatum</label>
              <input className="input" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Fällig am</label>
              <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div className="field" style={{ flex: 2 }}><label>Notiz</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
        </form>
      )}

      <div className="row-inline" style={{ marginBottom: 14 }}>
        <select className="select form-light" style={{ maxWidth: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Alle Status</option>
          <option value="offen">Offen</option>
          <option value="ueberfaellig">Überfällig</option>
          <option value="bezahlt">Bezahlt</option>
        </select>
        <select className="select form-light" style={{ maxWidth: 220 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">Alle Kunden</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {invoices.length === 0 ? (
        <div className="empty">Keine Rechnungen.</div>
      ) : (
        <div className="section" style={{ padding: 0, overflowX: "auto" }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Nummer</th><th>Kunde</th><th>Datum</th><th>Fällig</th>
                <th style={{ textAlign: "right" }}>Betrag</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const b = badge(inv);
                return (
                  <tr key={inv.id}>
                    <td>
                      <strong>{inv.number || "—"}</strong>
                      {inv.source === "xrechnung" && <span className="tag" style={{ marginLeft: 6, fontSize: 10 }}>E-Rechnung</span>}
                    </td>
                    <td className="muted">{inv.client_name || "—"}</td>
                    <td className="muted">{inv.issue_date || "—"}</td>
                    <td className="muted">{inv.due_date || "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(inv.amount, inv.currency)}</td>
                    <td><span className={`inv-badge ${b.cls}`}>{b.label}</span></td>
                    <td>
                      <div className="inv-actions">
                        {inv.status !== "bezahlt"
                          ? <button className="btn btn-ghost btn-sm" onClick={() => setStatus(inv, "bezahlt")}>bezahlt</button>
                          : <button className="btn btn-ghost btn-sm" onClick={() => setStatus(inv, "offen")}>offen</button>}
                        {inv.overdue && <button className="btn btn-ghost btn-sm" onClick={() => remind(inv)}>erinnern</button>}
                        {inv.has_file && <button className="btn btn-ghost btn-sm" onClick={() => api.downloadInvoiceFile(inv.id, inv.filename)}>Datei</button>}
                        <button className="del" onClick={() => del(inv)}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
