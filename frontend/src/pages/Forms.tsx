import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BriefingForm, BriefingSubmission, Client, IntakeForm, IntakeSubmission, api } from "../api";
import { useToast } from "../toast";

const LABELS: Record<string, string> = {
  company: "Firma", contact_person: "Ansprechpartner", email: "E-Mail", phone: "Telefon",
  website: "Website", billing_address: "Rechnungsadresse", vat_id: "USt-IdNr",
  billing_email: "Rechnungs-E-Mail", notes: "Notiz",
};
const BR_LABELS: Record<string, string> = {
  contact_name: "Name", contact_email: "E-Mail", company: "Firma", audience: "Zielgruppe",
  goal: "Ziel", format: "Format", channel: "Kanal", deadline: "Deadline", details: "Details",
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
        <h1>Formulare</h1>
        <div className="sub">Öffentliche Links für Kundendaten und Briefing-Anfragen.</div>
      </div>

      <BriefingSection clients={clients} />


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

function BriefingSection({ clients }: { clients: Client[] }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [types, setTypes] = useState<{ key: string; label: string }[]>([]);
  const [forms, setForms] = useState<BriefingForm[]>([]);
  const [bType, setBType] = useState("general");
  const [label, setLabel] = useState("");
  const [clientId, setClientId] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [subs, setSubs] = useState<BriefingSubmission[]>([]);
  const [target, setTarget] = useState<Record<string, string>>({});

  const load = () => api.briefingForms().then(setForms).catch(() => {});
  useEffect(() => { load(); api.briefingTypes().then(setTypes).catch(() => {}); }, []);

  const typeLabel = (k: string) => types.find((t) => t.key === k)?.label || k;
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createBriefing({ briefing_type: bType, label, client_id: clientId || null });
    setLabel(""); setClientId(""); setBType("general"); load(); toast("Briefing-Link erstellt.");
  };
  const link = (id: string) => `${location.origin}/briefing/${id}`;
  const copy = (id: string) => { navigator.clipboard.writeText(link(id)); toast("Link kopiert."); };
  const view = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setSubs(await api.briefingSubmissions(id));
  };
  const convert = async (fid: string, s: BriefingSubmission) => {
    const r = await api.convertBriefing(fid, s.id, target[s.id] || null);
    toast("In Projekt umgewandelt."); if (r.client_id) navigate(`/clients/${r.client_id}`);
  };
  const delForm = async (id: string) => {
    if (!confirm("Briefing-Formular inkl. Eingänge löschen?")) return;
    await api.deleteBriefing(id); if (open === id) setOpen(null); load(); toast("Gelöscht.");
  };

  return (
    <>
      <div className="section">
        <h2>Neues Briefing-/Anfrageformular</h2>
        <p className="muted" style={{ marginTop: 0 }}>Öffentlicher Link mit Pflichtfeldern (Zielgruppe, Ziel, Format, Kanal, Deadline). Eingänge werden per Klick zum Projekt.</p>
        <form className="row-inline form-light" onSubmit={create}>
          <div className="field"><label>Briefing-Art</label>
            <select className="select" value={bType} onChange={(e) => setBType(e.target.value)}>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select></div>
          <div className="field" style={{ flex: 2 }}><label>Beschreibung/Titel</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. Anfrage Kampagne Frühling" /></div>
          <div className="field"><label>Optional: Kunde</label>
            <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Neuer Lead</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <button className="btn btn-primary">Link erstellen</button>
        </form>
      </div>

      <div className="section">
        <h2>Briefing-Formulare</h2>
        {forms.length === 0 ? <div className="empty">Noch keine Briefing-Formulare.</div> : forms.map((f) => (
          <div key={f.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
            <div className="list-row" style={{ border: "none", padding: 0 }}>
              <div>
                <strong>{f.label || typeLabel(f.briefing_type)}</strong>
                <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>{typeLabel(f.briefing_type)}</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  {f.submission_count} Eingang/Eingänge{f.client_id ? " · Kunde zugeordnet" : " · Neuer Lead"}
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
                      {Object.entries(BR_LABELS).filter(([k]) => s.data[k]).map(([k, lbl]) => (
                        <div key={k} style={{ display: "contents" }}><dt>{lbl}</dt><dd style={{ whiteSpace: "pre-line" }}>{s.data[k]}</dd></div>
                      ))}
                    </dl>
                    <div className="row-inline" style={{ marginTop: 8, alignItems: "center" }}>
                      {s.converted
                        ? <span className="tag done">in Projekt umgewandelt</span>
                        : <>
                            {!f.client_id && (
                              <select className="select form-light" style={{ maxWidth: 200 }} value={target[s.id] || ""}
                                onChange={(e) => setTarget((t) => ({ ...t, [s.id]: e.target.value }))}>
                                <option value="">Neuen Lead anlegen</option>
                                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            )}
                            <button className="btn btn-primary btn-sm" onClick={() => convert(f.id, s)}>In Projekt umwandeln</button>
                          </>}
                      <button className="del" onClick={async () => { await api.deleteBriefingSubmission(f.id, s.id); setSubs((x) => x.filter((y) => y.id !== s.id)); load(); }}>löschen</button>
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
