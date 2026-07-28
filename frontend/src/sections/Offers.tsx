import { useEffect, useState } from "react";
import { Offer, OfferItem, Package, api } from "../api";
import { useToast } from "../toast";

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const ST: Record<string, string> = { draft: "Entwurf", sent: "gesendet", accepted: "angenommen", declined: "abgelehnt" };
const stCls = (s: string) => s === "accepted" ? "st-aktiv" : s === "sent" ? "st-lead" : s === "declined" ? "st-pausiert" : "st-beendet";
const emptyRow = (): OfferItem => ({ description: "", quantity: 1, unit: "Stunden", unit_price: 0 });

export default function Offers({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pkgs, setPkgs] = useState<Package[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [vat, setVat] = useState("0");
  const [rows, setRows] = useState<OfferItem[]>([emptyRow()]);

  const load = () => api.offers(clientId).then(setOffers).catch(() => {});
  useEffect(() => { load(); if (isAgency) api.packages().then(setPkgs).catch(() => {}); }, [clientId]);

  const setRow = (i: number, patch: Partial<OfferItem>) => setRows((r) => r.map((x, j) => j === i ? { ...x, ...patch } : x));
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const delRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));
  const fromPkg = (i: number, pkgId: string) => {
    const p = pkgs.find((x) => x.id === pkgId); if (!p) return;
    setRow(i, { description: p.description ? `${p.name}\n${p.description}` : p.name, unit: p.unit || "Stunden", unit_price: p.unit_price || 0 });
  };
  const net = rows.reduce((s, r) => s + (r.quantity || 0) * (r.unit_price || 0), 0);
  const vatN = net * (parseFloat(vat.replace(",", ".")) || 0) / 100;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = rows.filter((r) => r.description.trim());
    if (!items.length) { toast("Mindestens eine Position.", "err"); return; }
    await api.createOffer(clientId, { title, vat_rate: parseFloat(vat.replace(",", ".")) || 0, items });
    setTitle(""); setVat("0"); setRows([emptyRow()]); setShow(false); load(); toast("Angebot erstellt.");
  };
  const send = async (o: Offer) => { try { const r = await api.sendOffer(clientId, o.id); load(); toast(`Angebot an ${r.to} gesendet.`); } catch (err) { toast((err as Error).message, "err"); } };
  const copyLink = (o: Offer) => { navigator.clipboard.writeText(`${location.origin}/angebot/${o.public_token}`); toast("Link kopiert."); };
  const del = async (o: Offer) => { if (!confirm(`Angebot ${o.number} löschen?`)) return; await api.deleteOffer(clientId, o.id); load(); toast("Gelöscht."); };
  const accept = async (o: Offer) => { await api.acceptOffer(o.public_token, ""); load(); toast("Angebot angenommen."); };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Angebote</h2>
        {isAgency && <button className="btn btn-primary btn-sm" onClick={() => setShow((s) => !s)}>{show ? "Abbrechen" : "+ Angebot"}</button>}
      </div>

      {show && isAgency && (
        <form className="form-light" style={{ margin: "12px 0 18px" }} onSubmit={create}>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Betreff (optional)</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="field"><label>USt %</label><input className="input" value={vat} onChange={(e) => setVat(e.target.value)} style={{ width: 80 }} /></div>
          </div>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>Positionen</label>
          {rows.map((r, i) => (
            <div key={i} style={{ border: "1px solid var(--glass-border)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div className="row-inline">
                {pkgs.length > 0 && (
                  <div className="field"><label>Aus Paket</label>
                    <select className="select" onChange={(e) => { fromPkg(i, e.target.value); e.target.value = ""; }}>
                      <option value="">– wählen –</option>
                      {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select></div>
                )}
                <div className="field" style={{ width: 90 }}><label>Menge</label><input className="input" type="number" step="0.5" value={r.quantity} onChange={(e) => setRow(i, { quantity: parseFloat(e.target.value) || 0 })} /></div>
                <div className="field" style={{ width: 110 }}><label>Einheit</label><input className="input" value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} /></div>
                <div className="field" style={{ width: 120 }}><label>Preis/Einheit €</label><input className="input" type="number" step="0.01" value={r.unit_price} onChange={(e) => setRow(i, { unit_price: parseFloat(e.target.value) || 0 })} /></div>
                <div className="field" style={{ width: 110 }}><label>Betrag</label><div style={{ padding: "10px 0" }}>{eur((r.quantity || 0) * (r.unit_price || 0))}</div></div>
                <button type="button" className="del" onClick={() => delRow(i)}>✕</button>
              </div>
              <div className="field"><label>Beschreibung (1. Zeile = Titel)</label><textarea className="input" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} rows={2} /></div>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>+ Position</button>
          <div style={{ textAlign: "right", margin: "10px 0", fontWeight: 700 }}>Gesamt: {eur(net + vatN)}</div>
          <button className="btn btn-primary">Angebot erstellen</button>
        </form>
      )}

      {offers.length === 0 ? <div className="empty">Noch keine Angebote.</div> : offers.map((o) => (
        <div key={o.id} className="list-row">
          <div>
            <strong>{o.number}</strong> <span className="muted">· {o.date} · {eur(o.gross)}</span>
            {o.title && <div className="muted" style={{ fontSize: 12 }}>{o.title}</div>}
          </div>
          <div className="row-inline" style={{ alignItems: "center" }}>
            <span className={`status-badge ${stCls(o.status)}`}>{ST[o.status] || o.status}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => api.downloadOfferPdf(clientId, o.id, o.number)}>PDF</button>
            {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => copyLink(o)}>Link</button>}
            {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => send(o)}>senden</button>}
            {!isAgency && o.status !== "accepted" && <button className="btn btn-primary btn-sm" onClick={() => accept(o)}>annehmen</button>}
            {isAgency && <button className="del" onClick={() => del(o)}>löschen</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
