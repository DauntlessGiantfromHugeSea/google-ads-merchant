import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Client, IntakeForm, IntakeSubmission, api } from "../api";
import { useToast } from "../toast";

const LABELS: Record<string, string> = {
  company: "Firma", contact_person: "Ansprechpartner", email: "E-Mail", phone: "Telefon",
  website: "Website", billing_address: "Rechnungsadresse", vat_id: "USt-IdNr",
  billing_email: "Rechnungs-E-Mail", notes: "Notiz",
};

export default function Forms() {
  const toast = useToast();
  const navigate = useNavigate();
  const [forms, setForms] = useState<IntakeForm[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [label, setLabel] = useState("");
  const [clientId, setClientId] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [subs, setSubs] = useState<IntakeSubmission[]>([]);

  const load = () => api.intakeForms().then(setForms).catch(() => {});
  useEffect(() => { load(); api.clients().then(setClients).catch(() => {}); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createIntake({ label, client_id: clientId || null });
    setLabel(""); setClientId(""); load(); toast("Formular-Link erstellt.");
  };
  const link = (id: string) => `${location.origin}/intake/${id}`;
  const copy = (id: string) => { navigator.clipboard.writeText(link(id)); toast("Link kopiert."); };
  const view = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setSubs(await api.intakeSubmissions(id));
  };
  const apply = async (id: string, sid: string) => {
    const r = await api.applyIntake(id, sid);
    toast("Als Kunde übernommen."); navigate(`/clients/${r.client_id}`);
  };
  const delForm = async (id: string) => {
    if (!confirm("Formular inkl. Eingänge löschen?")) return;
    await api.deleteIntake(id); if (open === id) setOpen(null); load(); toast("Formular gelöscht.");
  };

  return (
    <>
      <div className="hero">
        <h1>Kundendaten-Formulare</h1>
        <div className="sub">Erstelle einen Link, über den Kunden ihre Rechnungs- & Stammdaten selbst eintragen.</div>
      </div>

      <div className="section">
        <h2>Neues Formular</h2>
        <form className="row-inline form-light" onSubmit={create}>
          <div className="field" style={{ flex: 2 }}><label>Beschreibung</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Onboarding Neukunde" required /></div>
          <div className="field" style={{ flex: 1 }}><label>Optional: bestehendem Kunden zuordnen</label>
            <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Neukunde (neu anlegen)</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <button className="btn btn-primary">Link erstellen</button>
        </form>
      </div>

      <div className="section">
        <h2>Deine Formulare</h2>
        {forms.length === 0 ? <div className="empty">Noch keine Formulare.</div> : forms.map((f) => (
          <div key={f.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
            <div className="list-row" style={{ border: "none", padding: 0 }}>
              <div>
                <strong>{f.label || "Formular"}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {f.submission_count} Eingang/Eingänge{f.client_id ? " · an Kunden gebunden" : " · Neukunde"}
                </div>
              </div>
              <div className="row-inline" style={{ alignItems: "center" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(f.id)}>Link kopieren</button>
                <button className="btn btn-ghost btn-sm" onClick={() => view(f.id)}>{open === f.id ? "Schließen" : `Eingänge (${f.submission_count})`}</button>
                <button className="del" onClick={() => delForm(f.id)}>löschen</button>
              </div>
            </div>
            {open === f.id && (
              <div style={{ marginTop: 10 }}>
                {subs.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Noch keine Eingänge.</div> : subs.map((s) => (
                  <div key={s.id} className="card" style={{ marginBottom: 10, boxShadow: "none" }}>
                    <dl className="kv" style={{ fontSize: 13 }}>
                      {Object.entries(LABELS).filter(([k]) => s.data[k]).map(([k, lbl]) => (
                        <div key={k} style={{ display: "contents" }}><dt>{lbl}</dt><dd style={{ whiteSpace: "pre-line" }}>{s.data[k]}</dd></div>
                      ))}
                    </dl>
                    <div className="row-inline" style={{ marginTop: 8, alignItems: "center" }}>
                      {s.applied
                        ? <span className="tag done">übernommen</span>
                        : <button className="btn btn-primary btn-sm" onClick={() => apply(f.id, s.id)}>Als Kunde übernehmen</button>}
                      <button className="del" onClick={async () => { await api.deleteIntakeSubmission(f.id, s.id); setSubs((x) => x.filter((y) => y.id !== s.id)); load(); }}>löschen</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
