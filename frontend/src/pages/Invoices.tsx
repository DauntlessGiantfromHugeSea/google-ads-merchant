import { useEffect, useMemo, useState } from "react";
import { Client, Invoice, Payment, api } from "../api";
import { useToast } from "../toast";

const eur = (n: number, cur = "EUR") =>
  n.toLocaleString("de-DE", { style: "currency", currency: cur || "EUR", maximumFractionDigits: 2 });
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const two = (n: number) => String(n).padStart(2, "0");

function badge(inv: Invoice) {
  if (inv.status === "bezahlt") return { cls: "inv-paid", label: "bezahlt" };
  if (inv.status === "storniert") return { cls: "inv-void", label: "storniert" };
  if (inv.overdue) return { cls: "inv-overdue", label: "überfällig" };
  return { cls: "inv-open", label: "offen" };
}

export default function Invoices() {
  const toast = useToast();
  const [all, setAll] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [view, setView] = useState<"liste" | "kosten" | "zahlungen">("liste");
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
  const [sp, setSp] = useState("");
  const [note, setNote] = useState("");
  const [reMail, setReMail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.invoices().then(setAll).catch((e) => toast((e as Error).message, "err"));
  useEffect(() => { api.clients().then(setClients).catch(() => {}); load(); }, []);

  const invoices = useMemo(() => all.filter((i) =>
    (!clientFilter || i.client_id === clientFilter) &&
    (!filter || (filter === "offen" && i.status === "offen") || (filter === "bezahlt" && i.status === "bezahlt") || (filter === "ueberfaellig" && i.overdue))
  ), [all, filter, clientFilter]);

  const totals = useMemo(() => {
    const open = all.filter((i) => i.status === "offen");
    return { open: open.reduce((a, i) => a + i.amount, 0), overdue: open.filter((i) => i.overdue).reduce((a, i) => a + i.amount, 0), overdueCount: open.filter((i) => i.overdue).length };
  }, [all]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.uploadInvoice({ file, client_id: fClient, number, amount, issue_date: issue, due_date: due, service_period: sp, note, recipient_email: reMail });
      setFile(null); setFClient(""); setNumber(""); setAmount(""); setIssue(""); setDue(""); setSp(""); setNote(""); setReMail("");
      setShowForm(false); load(); toast("Rechnung gespeichert.");
    } catch (err) { toast((err as Error).message, "err"); }
    finally { setBusy(false); }
  };
  const setStatus = async (inv: Invoice, status: string) => { try { await api.updateInvoice(inv.id, { status }); load(); } catch (e) { toast((e as Error).message, "err"); } };
  const remind = async (inv: Invoice) => { try { const r = await api.remindInvoice(inv.id); toast(`Erinnerung an ${r.to} gesendet.`); } catch (e) { toast((e as Error).message, "err"); } };
  const del = async (inv: Invoice) => { if (!confirm(`Rechnung ${inv.number || ""} löschen?`)) return; await api.deleteInvoice(inv.id); load(); };
  const upReceipt = async (inv: Invoice, file: File) => { try { await api.uploadReceipt(inv.id, file); load(); toast("Beleg gespeichert."); } catch (e) { toast((e as Error).message, "err"); } };

  return (
    <>
      <div className="page-head">
        <h1>Rechnungen &amp; Kosten</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? "Abbrechen" : "+ Rechnung"}</button>
      </div>

      {showForm && (
        <form className="section form-light" onSubmit={submit}>
          <h2>Rechnung reinladen</h2>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Bei E-Rechnungen (XRechnung / ZUGFeRD) werden Nummer, Betrag und Fälligkeit automatisch ausgelesen.</p>
          <div className="field"><label>Datei (PDF oder XML, optional)</label>
            <input className="input" type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
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
            <div className="field" style={{ flex: 1 }}><label>Leistungszeitraum</label>
              <input className="input" type="month" value={sp} onChange={(e) => setSp(e.target.value)} /></div>
          </div>
          <div className="field"><label>Notiz</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="field"><label>Rechnungs-E-Mail (abweichend, optional)</label>
            <input className="input" type="email" value={reMail} onChange={(e) => setReMail(e.target.value)} placeholder="z. B. buchhaltung@kunde.de – sonst geht sie an die Kunden-Mail" /></div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
        </form>
      )}

      <div className="row-inline" style={{ gap: 8, marginBottom: 14 }}>
        <button className={`btn btn-sm ${view === "liste" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("liste")}>Rechnungen</button>
        <button className={`btn btn-sm ${view === "kosten" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("kosten")}>Kostenaufstellung</button>
        <button className={`btn btn-sm ${view === "zahlungen" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("zahlungen")}>Zahlungen</button>
      </div>

      {view === "zahlungen" ? (
        <Zahlungen clients={clients} invoices={all} />
      ) : view === "kosten" ? (
        <Kostenaufstellung invoices={all} clients={clients} />
      ) : (
        <>
          <div className="hero-stats" style={{ marginBottom: 18 }}>
            <div className="hero-stat"><div className="v">{eur(totals.open)}</div><div className="l">Offen gesamt</div></div>
            <div className="hero-stat"><div className="v" style={{ color: totals.overdue ? "#f87171" : undefined }}>{eur(totals.overdue)}</div><div className="l">Überfällig ({totals.overdueCount})</div></div>
            <div className="hero-stat"><div className="v">{all.length}</div><div className="l">Rechnungen</div></div>
          </div>
          <div className="row-inline" style={{ marginBottom: 14 }}>
            <select className="select form-light" style={{ maxWidth: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Alle Status</option><option value="offen">Offen</option><option value="ueberfaellig">Überfällig</option><option value="bezahlt">Bezahlt</option>
            </select>
            <select className="select form-light" style={{ maxWidth: 220 }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">Alle Kunden</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {invoices.length === 0 ? <div className="empty">Keine Rechnungen.</div> : (
            <div className="section" style={{ padding: 0, overflowX: "auto" }}>
              <table className="inv-table">
                <thead><tr><th>Nummer</th><th>Kunde</th><th>Datum</th><th>Leistung</th><th>Fällig</th><th style={{ textAlign: "right" }}>Betrag</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {invoices.map((inv) => {
                    const b = badge(inv);
                    return (
                      <tr key={inv.id}>
                        <td><strong>{inv.number || "—"}</strong>{inv.source === "xrechnung" && <span className="tag" style={{ marginLeft: 6, fontSize: 10 }}>E-Rechnung</span>}</td>
                        <td className="muted">{inv.client_name || "—"}</td>
                        <td className="muted">{inv.issue_date || "—"}</td>
                        <td className="muted">{inv.service_period || "—"}</td>
                        <td className="muted">{inv.due_date || "—"}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(inv.amount, inv.currency)}</td>
                        <td><span className={`inv-badge ${b.cls}`}>{b.label}</span></td>
                        <td><div className="inv-actions">
                          {inv.status !== "bezahlt" ? <button className="btn btn-ghost btn-sm" onClick={() => setStatus(inv, "bezahlt")}>bezahlt</button>
                            : <button className="btn btn-ghost btn-sm" onClick={() => setStatus(inv, "offen")}>offen</button>}
                          {inv.overdue && <button className="btn btn-ghost btn-sm" onClick={() => remind(inv)}>erinnern</button>}
                          {inv.has_file && <button className="btn btn-ghost btn-sm" onClick={() => api.downloadInvoiceFile(inv.id, inv.filename)}>Rechnung</button>}
                          {inv.has_receipt
                            ? <button className="btn btn-ghost btn-sm" onClick={() => api.downloadReceipt(inv.id, inv.receipt_filename)}>Beleg ✓</button>
                            : <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>＋Beleg
                                <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upReceipt(inv, f); e.currentTarget.value = ""; }} /></label>}
                          <button className="del" onClick={() => del(inv)}>×</button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Kostenaufstellung({ invoices, clients }: { invoices: Invoice[]; clients: Client[] }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(0); // 0 = ganzes Jahr
  const [basis, setBasis] = useState<"issue" | "service" | "paid">("issue");
  const [client, setClient] = useState("");

  const basisMonth = (i: Invoice): string => {
    if (basis === "service") return i.service_period || (i.issue_date || "").slice(0, 7);
    if (basis === "paid") return i.status === "bezahlt" && i.paid_at ? i.paid_at.slice(0, 7) : "";
    return (i.issue_date || "").slice(0, 7);
  };
  const years = useMemo(() => {
    const s = new Set<string>();
    invoices.forEach((i) => { const m = basisMonth(i); if (m) s.add(m.slice(0, 4)); });
    s.add(String(now.getFullYear()));
    return Array.from(s).sort().reverse();
  }, [invoices, basis]);

  const inScope = useMemo(() => invoices.filter((i) => {
    if (client && i.client_id !== client) return false;
    const m = basisMonth(i);
    if (!m || m.slice(0, 4) !== year) return false;
    if (month && m.slice(5, 7) !== two(month)) return false;
    return true;
  }), [invoices, year, month, basis, client]);

  const sum = (arr: Invoice[]) => arr.reduce((a, i) => a + i.amount, 0);
  const active = inScope.filter((i) => i.status !== "storniert");
  const gestellt = sum(active);
  const bezahlt = sum(active.filter((i) => i.status === "bezahlt"));
  const offen = sum(active.filter((i) => i.status === "offen"));
  const ueberfaellig = sum(active.filter((i) => i.overdue));

  // je Kunde
  const byClient = useMemo(() => {
    const m: Record<string, { name: string; gestellt: number; bezahlt: number; offen: number }> = {};
    active.forEach((i) => {
      const k = i.client_id || "_";
      const r = (m[k] ||= { name: i.client_name || "ohne Kunde", gestellt: 0, bezahlt: 0, offen: 0 });
      r.gestellt += i.amount;
      if (i.status === "bezahlt") r.bezahlt += i.amount;
      if (i.status === "offen") r.offen += i.amount;
    });
    return Object.values(m).sort((a, b) => b.gestellt - a.gestellt);
  }, [active]);

  // je Monat (ganzes Jahr, ignoriert Monatsfilter)
  const perMonth = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ gestellt: 0, bezahlt: 0 }));
    invoices.forEach((i) => {
      if (client && i.client_id !== client) return;
      if (i.status === "storniert") return;
      const m = basisMonth(i);
      if (!m || m.slice(0, 4) !== year) return;
      const idx = Number(m.slice(5, 7)) - 1;
      if (idx < 0 || idx > 11) return;
      arr[idx].gestellt += i.amount;
      if (i.status === "bezahlt") arr[idx].bezahlt += i.amount;
    });
    return arr;
  }, [invoices, year, basis, client]);
  const maxMonth = Math.max(1, ...perMonth.map((m) => m.gestellt));

  const exportCsv = () => {
    const dec = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, "");
    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const head = ["Nummer", "Kunde", "Rechnungsdatum", "Leistungszeitraum", "Fällig", "Status", "Betrag", "Bezahlt am"];
    const rows = inScope.map((i) => [esc(i.number), esc(i.client_name), i.issue_date, i.service_period, i.due_date, i.status, dec(i.amount), i.paid_at].join(";"));
    const csv = "﻿" + [head.join(";"), ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Kostenaufstellung-${year}${month ? "-" + two(month) : ""}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="section">
        <div className="row-inline" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ maxWidth: 120 }}><label>Jahr</label>
            <select className="select form-light" value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select></div>
          <div className="field" style={{ maxWidth: 160 }}><label>Monat</label>
            <select className="select form-light" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              <option value={0}>Ganzes Jahr</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select></div>
          <div className="field" style={{ maxWidth: 200 }}><label>Auswerten nach</label>
            <select className="select form-light" value={basis} onChange={(e) => setBasis(e.target.value as any)}>
              <option value="issue">Rechnungsdatum</option>
              <option value="service">Leistungszeitraum</option>
              <option value="paid">Zahlungsdatum</option>
            </select></div>
          <div className="field" style={{ maxWidth: 200 }}><label>Kunde</label>
            <select className="select form-light" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">Alle Kunden</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>⬇ CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => api.downloadKosten("pdf", { year, month, basis, client }).catch(() => {})}>📄 PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={() => api.downloadKosten("zip", { year, month, basis, client }).catch(() => alert("Keine Rechnungen im Zeitraum."))}>🗜 ZIP (mit Belegen)</button>
        </div>
      </div>

      <div className="hero-stats" style={{ marginBottom: 18 }}>
        <div className="hero-stat"><div className="v">{eur(gestellt)}</div><div className="l">Rechnungen gestellt</div></div>
        <div className="hero-stat"><div className="v" style={{ color: "#6ee7b7" }}>{eur(bezahlt)}</div><div className="l">Zahlungseingänge</div></div>
        <div className="hero-stat"><div className="v">{eur(offen)}</div><div className="l">Offen</div></div>
        <div className="hero-stat"><div className="v" style={{ color: ueberfaellig ? "#f87171" : undefined }}>{eur(ueberfaellig)}</div><div className="l">Überfällig</div></div>
      </div>

      <div className="section">
        <h2 style={{ fontSize: 16 }}>Verlauf {year} (nach {basis === "service" ? "Leistungszeitraum" : basis === "paid" ? "Zahlung" : "Rechnungsdatum"})</h2>
        <div className="kosten-chart">
          {perMonth.map((m, i) => (
            <div key={i} className={`kosten-col ${month === i + 1 ? "on" : ""}`} onClick={() => setMonth(month === i + 1 ? 0 : i + 1)} title={`${MONTHS[i]}: ${eur(m.gestellt)}`}>
              <div className="kosten-bar-wrap">
                <div className="kosten-bar" style={{ height: `${(m.gestellt / maxMonth) * 100}%` }} />
                <div className="kosten-bar paid" style={{ height: `${(m.bezahlt / maxMonth) * 100}%` }} />
              </div>
              <div className="kosten-mlabel">{MONTHS[i].slice(0, 3)}</div>
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Balken = gestellt · grüner Anteil = bezahlt. Monat anklicken zum Filtern.</div>
      </div>

      <div className="section">
        <h2 style={{ fontSize: 16 }}>Je Kunde</h2>
        {byClient.length === 0 ? <div className="empty sm">Keine Rechnungen im Zeitraum.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="inv-table">
              <thead><tr><th>Kunde</th><th style={{ textAlign: "right" }}>Gestellt</th><th style={{ textAlign: "right" }}>Bezahlt</th><th style={{ textAlign: "right" }}>Offen</th></tr></thead>
              <tbody>
                {byClient.map((c) => (
                  <tr key={c.name}>
                    <td><strong>{c.name}</strong></td>
                    <td style={{ textAlign: "right" }}>{eur(c.gestellt)}</td>
                    <td style={{ textAlign: "right", color: "#6ee7b7" }}>{eur(c.bezahlt)}</td>
                    <td style={{ textAlign: "right" }}>{c.offen ? eur(c.offen) : "—"}</td>
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

function Zahlungen({ clients, invoices }: { clients: Client[]; invoices: Invoice[] }) {
  const toast = useToast();
  const [rows, setRows] = useState<Payment[]>([]);
  const [month, setMonth] = useState("");   // "" = alle, sonst YYYY-MM
  const [form, setForm] = useState<Partial<Payment> | null>(null);

  const load = () => api.payments().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const months = useMemo(() => Array.from(new Set(rows.map((r) => (r.date || "").slice(0, 7)).filter(Boolean))).sort().reverse(), [rows]);
  const shown = useMemo(() => rows.filter((r) => !month || (r.date || "").slice(0, 7) === month), [rows, month]);
  const sums = useMemo(() => {
    const ein = shown.filter((r) => r.direction === "in").reduce((a, r) => a + r.amount, 0);
    const aus = shown.filter((r) => r.direction === "out").reduce((a, r) => a + r.amount, 0);
    return { ein, aus, saldo: ein - aus };
  }, [shown]);

  const openNew = () => setForm({ date: new Date().toISOString().slice(0, 10), direction: "in", amount: 0, counterparty: "", iban: "", reference: "", client_id: null, invoice_id: null });
  const save = async () => {
    if (!form) return;
    if (!form.amount || form.amount <= 0) { toast("Bitte einen Betrag > 0 eingeben.", "err"); return; }
    try {
      if (form.id) await api.updatePayment(form.id, form); else await api.createPayment(form);
      setForm(null); load(); toast("Gespeichert.");
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const del = async (p: Payment) => { if (!confirm("Zahlung löschen?")) return; await api.deletePayment(p.id); load(); };

  const openInvoices = (clientId?: string | null) => invoices.filter((i) => i.status === "offen" && (!clientId || i.client_id === clientId));

  return (
    <>
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <select className="select form-light" style={{ maxWidth: 200 }} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Alle Monate</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {!form && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Zahlung eintragen</button>}
        </div>
      </div>

      <div className="hero-stats" style={{ marginBottom: 18 }}>
        <div className="hero-stat"><div className="v" style={{ color: "#6ee7b7" }}>+{eur(sums.ein)}</div><div className="l">Eingänge</div></div>
        <div className="hero-stat"><div className="v" style={{ color: "#f87171" }}>−{eur(sums.aus)}</div><div className="l">Ausgänge</div></div>
        <div className="hero-stat"><div className="v">{eur(sums.saldo)}</div><div className="l">Saldo</div></div>
      </div>

      {form && (
        <div className="section form-light">
          <h2>{form.id ? "Zahlung bearbeiten" : "Neue Zahlung"}</h2>
          <div className="row-inline">
            <div className="field" style={{ maxWidth: 150 }}><label>Datum</label>
              <input className="input" type="date" value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field" style={{ maxWidth: 160 }}><label>Richtung</label>
              <select className="select" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                <option value="in">+ Eingang</option><option value="out">− Ausgang</option>
              </select></div>
            <div className="field" style={{ maxWidth: 140 }}><label>Betrag (€)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          </div>
          <div className="row-inline">
            <div className="field" style={{ flex: 1 }}><label>Absender / Empfänger</label>
              <input className="input" value={form.counterparty || ""} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder="Name" /></div>
            <div className="field" style={{ flex: 1 }}><label>IBAN</label>
              <input className="input" value={form.iban || ""} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="DE.." /></div>
          </div>
          <div className="field"><label>Betreff / Verwendungszweck</label>
            <input className="input" value={form.reference || ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div className="row-inline">
            <div className="field" style={{ flex: 1 }}><label>Kunde (optional)</label>
              <select className="select" value={form.client_id || ""} onChange={(e) => setForm({ ...form, client_id: e.target.value || null, invoice_id: null })}>
                <option value="">— keiner —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            {form.direction === "in" && (
              <div className="field" style={{ flex: 1 }}><label>Rechnung (optional → als bezahlt markieren)</label>
                <select className="select" value={form.invoice_id || ""} onChange={(e) => setForm({ ...form, invoice_id: e.target.value || null })}>
                  <option value="">— keine —</option>
                  {openInvoices(form.client_id).map((i) => <option key={i.id} value={i.id}>{i.number || "o. Nr."} · {eur(i.amount)}</option>)}
                </select></div>
            )}
          </div>
          <div className="field"><label>Notiz</label><input className="input" value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <div className="row-inline" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={save}>Speichern</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? <div className="empty">Noch keine Zahlungen erfasst.</div> : (
        <div className="section" style={{ padding: 0, overflowX: "auto" }}>
          <table className="inv-table">
            <thead><tr><th>Datum</th><th style={{ textAlign: "right" }}>Betrag</th><th>Absender/Empfänger</th><th>IBAN</th><th>Betreff</th><th>Kunde</th><th></th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="muted">{p.date}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: p.direction === "in" ? "#6ee7b7" : "#f87171" }}>
                    {p.direction === "in" ? "+" : "−"}{eur(p.amount, p.currency)}
                  </td>
                  <td>{p.counterparty || "—"}</td>
                  <td className="muted" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{p.iban || "—"}</td>
                  <td className="muted">{p.reference || "—"}{p.invoice_number ? ` · RE ${p.invoice_number}` : ""}</td>
                  <td className="muted">{p.client_name || "—"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setForm(p)}>bearbeiten</button>
                    <button className="del" onClick={() => del(p)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
