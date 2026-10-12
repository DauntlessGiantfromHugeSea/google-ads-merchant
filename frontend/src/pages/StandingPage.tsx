import { useEffect, useMemo, useState } from "react";
import { Client, StandingCharge, StandingOrder, api } from "../api";
import { useToast } from "../toast";

const IV: Record<string, string> = { monthly: "monatlich", quarterly: "quartalsweise", yearly: "jährlich" };
const money = (n: number, c = "EUR") => `${n.toFixed(2)} ${c}`;
const fmt = (s: string) => s ? new Date(s + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
const periodLabel = (p: string) => { const [y, m] = p.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" }); };

export default function StandingPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<StandingOrder[]>([]);
  const [charges, setCharges] = useState<StandingCharge[]>([]);
  const [openTotal, setOpenTotal] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [showPaid, setShowPaid] = useState(false);
  const [f, setF] = useState({ client_id: "", title: "", amount: "", interval: "monthly", due_day: "1", start_date: new Date().toISOString().slice(0, 10) });

  const loadCharges = (paid = showPaid) => api.standingCharges(paid ? "all" : "open").then((r) => { setCharges(r.charges); setOpenTotal(r.open_total); }).catch(() => {});
  const loadOrders = () => api.standingOrders().then(setOrders).catch(() => {});
  useEffect(() => { loadOrders(); loadCharges(false); api.clients().then(setClients).catch(() => {}); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.client_id) { toast("Bitte Kunde wählen.", "err"); return; }
    if (!(parseFloat(f.amount) > 0)) { toast("Bitte Betrag eingeben.", "err"); return; }
    try {
      await api.createStandingOrder({ client_id: f.client_id, title: f.title.trim() || "Dauerauftrag",
        amount: parseFloat(f.amount), interval: f.interval, due_day: parseInt(f.due_day) || 1, start_date: f.start_date });
      setF({ ...f, title: "", amount: "" });
      loadOrders(); loadCharges();
      toast("Dauerauftrag angelegt.");
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const toggle = async (o: StandingOrder) => { await api.patchStandingOrder(o.id, { active: !o.active }); loadOrders(); loadCharges(); };
  const delOrder = async (o: StandingOrder) => { if (!confirm(`Dauerauftrag „${o.title}" löschen? Offene Posten verschwinden mit.`)) return; await api.deleteStandingOrder(o.id); loadOrders(); loadCharges(); toast("Gelöscht."); };
  const paid = async (c: StandingCharge) => { await api.markChargePaid(c.id); loadCharges(); };
  const unpaid = async (c: StandingCharge) => { await api.markChargeOpen(c.id); loadCharges(); };
  const toggleShowPaid = async () => { const v = !showPaid; setShowPaid(v); loadCharges(v); };

  const clientOpts = useMemo(() => [...clients].sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const openCount = charges.filter((c) => c.status === "open").length;

  return (
    <>
      <div className="page-head"><h1>Daueraufträge</h1>
        <div className="muted" style={{ fontSize: 13 }}>Wiederkehrende Zahlungen als offene Posten – ohne Versand. {openCount} offen · {money(openTotal)} fällig</div></div>

      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2>Fällige Posten</h2>
          <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={showPaid} onChange={toggleShowPaid} /> bezahlte zeigen
          </label>
        </div>
        {charges.length === 0 ? <div className="empty">Keine Posten. Lege unten einen Dauerauftrag an.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="inv-table" style={{ width: "100%", fontSize: 13 }}>
              <thead><tr><th>Kunde</th><th>Posten</th><th>Zeitraum</th><th>Fällig</th><th style={{ textAlign: "right" }}>Betrag</th><th></th></tr></thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} style={{ opacity: c.status === "paid" ? 0.55 : 1 }}>
                    <td><strong>{c.client_name}</strong></td>
                    <td>{c.title}</td>
                    <td className="muted">{periodLabel(c.period)}</td>
                    <td>{fmt(c.due_date)} {c.overdue && <span className="status-badge st-pausiert" style={{ marginLeft: 4 }}>überfällig</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{money(c.amount, c.currency)}</td>
                    <td style={{ textAlign: "right" }}>
                      {c.status === "open"
                        ? <button className="btn btn-primary btn-sm" onClick={() => paid(c)}>bezahlt</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => unpaid(c)}>↩ offen</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <h2>Dauerauftrag anlegen</h2>
        <form className="form-light" onSubmit={add}>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Kunde</label>
              <select className="select" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
                <option value="">— wählen —</option>
                {clientOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="field" style={{ flex: 2 }}><label>Bezeichnung</label>
              <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="z. B. Hosting & Wartung" /></div>
          </div>
          <div className="row-inline">
            <div className="field"><label>Betrag (€)</label>
              <input className="input" type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="z. B. 49.00" /></div>
            <div className="field"><label>Rhythmus</label>
              <select className="select" value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })}>
                {Object.entries(IV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="field"><label>Fällig am (Tag)</label>
              <input className="input" type="number" min="1" max="28" value={f.due_day} onChange={(e) => setF({ ...f, due_day: e.target.value })} /></div>
            <div className="field"><label>Ab</label>
              <input className="input" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary">Dauerauftrag anlegen</button>
        </form>

        {orders.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {orders.map((o) => (
              <div key={o.id} className="list-row" style={{ alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <strong>{o.title}</strong> <span className="muted">· {o.client_name}</span>
                  {!o.active && <span className="status-badge st-pausiert" style={{ marginLeft: 6 }}>pausiert</span>}
                  <div className="muted" style={{ fontSize: 12 }}>{money(o.amount, o.currency)} · {IV[o.interval] || o.interval} · fällig am {o.due_day}. · ab {fmt(o.start_date)}</div>
                </div>
                <div className="row-inline" style={{ alignItems: "center" }}>
                  <label className="muted" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                    <input type="checkbox" checked={o.active} onChange={() => toggle(o)} /> aktiv
                  </label>
                  <button className="del" onClick={() => delOrder(o)}>löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
