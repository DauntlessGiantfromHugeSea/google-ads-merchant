import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Client } from "../api";
import { useAuth } from "../App";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");

  const isAgency = user?.role !== "client_user";

  const load = () => api.clients().then(setClients).catch((e) => setError((e as Error).message));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.createClient({ name, contact_email: contact });
      setName(""); setContact(""); setShowForm(false);
      load();
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <>
      <span className="eyebrow">Kunden</span>
      <div className="page-head">
        <h1>{isAgency ? "Deine Kunden" : "Dein Dashboard"}</h1>
        {isAgency && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Abbrechen" : "+ Neuer Kunde"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="section form-light" onSubmit={create}>
          <h2>Neuen Kunden anlegen</h2>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}>
              <label>Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>Kontakt-E-Mail</label>
              <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <button className="btn btn-primary">Anlegen</button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      )}

      {clients.length === 0 ? (
        <div className="empty">Noch keine Kunden. {isAgency && "Lege deinen ersten Kunden an."}</div>
      ) : (
        <div className="grid">
          {clients.map((c) => (
            <div key={c.id} className="card clickable" onClick={() => navigate(`/clients/${c.id}`)}>
              <h3>{c.name}</h3>
              <div className="meta">{c.contact_email || "—"}</div>
              <div style={{ marginTop: 12 }}>
                {c.onboarding_completed
                  ? <span className="tag done">Onboarding abgeschlossen</span>
                  : <span className="tag coral">Onboarding offen</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
