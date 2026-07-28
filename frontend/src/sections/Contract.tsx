import { useEffect, useState } from "react";
import { Client, Package, api } from "../api";
import { useToast } from "../toast";

export default function Contract({ client, isAgency, onSaved }:
  { client: Client; isAgency: boolean; onSaved: (c: Client) => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [pkgs, setPkgs] = useState<Package[]>([]);
  useEffect(() => { if (isAgency) api.packages().then(setPkgs).catch(() => {}); }, [isAgency]);
  const [f, setF] = useState({
    contract_package: client.contract_package, contract_status: client.contract_status,
    contract_start: client.contract_start, contract_end: client.contract_end,
    contract_fee: client.contract_fee, contract_billing: client.contract_billing,
    contract_notes: client.contract_notes,
    company: client.company, vat_id: client.vat_id,
    billing_email: client.billing_email, billing_address: client.billing_address,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { onSaved(await api.updateClient(client.id, f)); setEdit(false); toast("Vertragsdaten gespeichert."); }
    catch (err) { toast((err as Error).message, "err"); }
    finally { setSaving(false); }
  };

  if (!isAgency || !edit) {
    return (
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between" }}>
          <h2>Vertragsdaten</h2>
          {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}>Bearbeiten</button>}
        </div>
        <dl className="kv">
          <dt>Paket</dt><dd>{client.contract_package || "–"}</dd>
          <dt>Status</dt><dd>{client.contract_status || "–"}</dd>
          <dt>Laufzeit</dt><dd>{client.contract_start || "?"} – {client.contract_end || "offen"}</dd>
          <dt>Gebühr</dt><dd>{client.contract_fee || "–"}</dd>
          <dt>Abrechnung</dt><dd>{client.contract_billing || "–"}</dd>
          <dt>Notizen</dt><dd>{client.contract_notes || "–"}</dd>
        </dl>
        <h3 style={{ margin: "16px 0 8px", fontSize: 15 }}>Rechnungsdaten</h3>
        <dl className="kv">
          <dt>Firma</dt><dd>{client.company || "–"}</dd>
          <dt>USt-IdNr</dt><dd>{client.vat_id || "–"}</dd>
          <dt>Rechnungs-E-Mail</dt><dd>{client.billing_email || "–"}</dd>
          <dt>Rechnungsadresse</dt><dd style={{ whiteSpace: "pre-line" }}>{client.billing_address || "–"}</dd>
        </dl>
      </div>
    );
  }

  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="section form-light">
      <h2>Vertragsdaten bearbeiten</h2>
      <div className="field"><label>Paket</label>
        <input className="input" list="pkg-list" value={f.contract_package}
          onChange={(e) => {
            const val = e.target.value;
            const m = pkgs.find((p) => p.name === val);
            setF((p) => ({
              ...p, contract_package: val,
              contract_fee: m ? m.price : p.contract_fee,
              contract_billing: m ? m.interval : p.contract_billing,
            }));
          }}
          placeholder="aus Katalog wählen oder frei eingeben" />
        <datalist id="pkg-list">{pkgs.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      </div>
      <div className="row-inline">
        <div className="field" style={{ flex: 1 }}><label>Status (aktiv/pausiert/beendet)</label><input className="input" value={f.contract_status} onChange={upd("contract_status")} /></div>
        <div className="field" style={{ flex: 1 }}><label>Gebühr</label><input className="input" value={f.contract_fee} onChange={upd("contract_fee")} placeholder="z.B. 990 € / Monat" /></div>
      </div>
      <div className="row-inline">
        <div className="field"><label>Start</label><input className="input" type="date" value={f.contract_start} onChange={upd("contract_start")} /></div>
        <div className="field"><label>Ende</label><input className="input" type="date" value={f.contract_end} onChange={upd("contract_end")} /></div>
        <div className="field" style={{ flex: 1 }}><label>Abrechnung</label><input className="input" value={f.contract_billing} onChange={upd("contract_billing")} placeholder="monatlich / jährlich" /></div>
      </div>
      <div className="field"><label>Notizen</label><textarea className="input" value={f.contract_notes} onChange={upd("contract_notes")} /></div>

      <h3 style={{ margin: "8px 0", fontSize: 15 }}>Rechnungsdaten</h3>
      <div className="row-inline">
        <div className="field" style={{ flex: 1 }}><label>Firma</label><input className="input" value={f.company} onChange={upd("company")} /></div>
        <div className="field" style={{ flex: 1 }}><label>USt-IdNr</label><input className="input" value={f.vat_id} onChange={upd("vat_id")} /></div>
      </div>
      <div className="field"><label>Rechnungs-E-Mail</label><input className="input" value={f.billing_email} onChange={upd("billing_email")} /></div>
      <div className="field"><label>Rechnungsadresse</label><textarea className="input" value={f.billing_address} onChange={upd("billing_address")} /></div>

      <div className="row-inline">
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
        <button className="btn btn-ghost" onClick={() => setEdit(false)}>Abbrechen</button>
      </div>
    </div>
  );
}
