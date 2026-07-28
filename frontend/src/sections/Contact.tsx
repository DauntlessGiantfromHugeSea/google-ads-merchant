import { useState } from "react";
import { Client, api } from "../api";
import { useToast } from "../toast";

export default function Contact({ client, isAgency, onSaved }:
  { client: Client; isAgency: boolean; onSaved: (c: Client) => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    contact_person: client.contact_person, contact_email: client.contact_email,
    phone: client.phone, website: client.website, address: client.address,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { onSaved(await api.updateClient(client.id, f)); setEdit(false); toast("Kontakt gespeichert."); }
    catch (err) { toast((err as Error).message, "err"); }
    finally { setSaving(false); }
  };
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  if (!isAgency || !edit) {
    return (
      <div className="section">
        <div className="row-inline" style={{ justifyContent: "space-between" }}>
          <h2>Kontakt</h2>
          {isAgency && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}>Bearbeiten</button>}
        </div>
        <dl className="kv">
          <dt>Ansprechpartner</dt><dd>{client.contact_person || "–"}</dd>
          <dt>E-Mail</dt><dd>{client.contact_email || "–"}</dd>
          <dt>Telefon</dt><dd>{client.phone || "–"}</dd>
          <dt>Website</dt><dd>{client.website || "–"}</dd>
          <dt>Adresse</dt><dd style={{ whiteSpace: "pre-line" }}>{client.address || "–"}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="section form-light">
      <h2>Kontakt bearbeiten</h2>
      <div className="row-inline">
        <div className="field" style={{ flex: 1 }}><label>Ansprechpartner</label><input className="input" value={f.contact_person} onChange={upd("contact_person")} /></div>
        <div className="field" style={{ flex: 1 }}><label>E-Mail</label><input className="input" value={f.contact_email} onChange={upd("contact_email")} /></div>
      </div>
      <div className="row-inline">
        <div className="field" style={{ flex: 1 }}><label>Telefon</label><input className="input" value={f.phone} onChange={upd("phone")} /></div>
        <div className="field" style={{ flex: 1 }}><label>Website</label><input className="input" value={f.website} onChange={upd("website")} /></div>
      </div>
      <div className="field"><label>Adresse</label><textarea className="input" value={f.address} onChange={upd("address")} /></div>
      <div className="row-inline">
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
        <button className="btn btn-ghost" onClick={() => setEdit(false)}>Abbrechen</button>
      </div>
    </div>
  );
}
