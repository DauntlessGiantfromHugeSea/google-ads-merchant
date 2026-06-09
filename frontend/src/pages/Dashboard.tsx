import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Client, DashboardData, api } from "../api";
import { useAuth } from "../App";

const STATUS = ["lead", "aktiv", "pausiert", "beendet"];
const statusClass = (s: string) =>
  `status-badge st-${["lead", "aktiv", "pausiert", "beendet"].includes(s) ? s : "aktiv"}`;

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAgency = user?.role !== "client_user";

  const [clients, setClients] = useState<Client[]>([]);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    api.clients().then(setClients).catch((e) => setError((e as Error).message));
    if (isAgency) api.dashboard().then(setDash).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.createClient({ name, contact_email: contact });
      setName(""); setContact(""); setShowForm(false); load();
    } catch (err) { setError((err as Error).message); }
  };

  const filtered = useMemo(() => clients.filter((c) =>
    (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.tags.toLowerCase().includes(q.toLowerCase()))
    && (!filter || c.status === filter)
  ), [clients, q, filter]);

  return (
    <>
      {isAgency && dash && (
        <div className="hero">
          <h1>Übersicht</h1>
          <div className="sub">Alle Kunden, Pakete und Aktivitäten auf einen Blick.</div>
          <div className="hero-stats">
            <div className="hero-stat"><div className="v">{dash.clients_total}</div><div className="l">Kunden</div></div>
            <div className="hero-stat"><div className="v">{dash.open_todos}</div><div className="l">Offene To-Dos</div></div>
            <div className="hero-stat"><div className="v">{dash.reports_total}</div><div className="l">Reports</div></div>
            <div className="hero-stat"><div className="v">{dash.status_counts["aktiv"] || 0}</div><div className="l">Aktiv</div></div>
          </div>
        </div>
      )}

      {isAgency && dash && dash.packages.length > 0 && (
        <div className="section">
          <h2>Gebuchte Pakete</h2>
          <div className="grid">
            {dash.packages.map((p) => (
              <div key={p.package} className="card" style={{ boxShadow: "none" }}>
                <div className="meta">{p.count} Kunde(n)</div>
                <h3>{p.package}</h3>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {p.clients.map((c) => (
                    <span key={c.id} className="tag" style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/clients/${c.id}`)}>{c.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="page-head">
        <h1>{isAgency ? "Kunden" : "Dein Bereich"}</h1>
        {isAgency && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Abbrechen" : "+ Neuer Kunde"}
          </button>
        )}
      </div>

      {isAgency && (
        <div className="row-inline" style={{ marginBottom: 16 }}>
          <input className="input form-light search" placeholder="Kunde oder Tag suchen…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select form-light" style={{ maxWidth: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Alle Status</option>
            {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {showForm && (
        <form className="section form-light" onSubmit={create}>
          <h2>Neuen Kunden anlegen</h2>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="field" style={{ flex: 2 }}><label>Kontakt-E-Mail</label>
              <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} /></div>
            <button className="btn btn-primary">Anlegen</button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="empty">Keine Kunden gefunden.</div>
      ) : (
        <div className="grid">
          {filtered.map((c) => (
            <div key={c.id} className="card clickable" onClick={() => navigate(`/clients/${c.id}`)}>
              <div className="row-inline" style={{ justifyContent: "space-between" }}>
                <h3>{c.name}</h3>
                <span className={statusClass(c.status)}>{c.status || "aktiv"}</span>
              </div>
              <div className="meta">{c.contract_package || c.contact_email || "—"}</div>
              <div style={{ marginTop: 10 }}>
                {!c.onboarding_completed && <span className="tag coral">Onboarding offen</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
