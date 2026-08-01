import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Client, DashboardData, Monitor, MyTodo, api } from "../api";
import { useAuth } from "../App";

const STATUS = ["lead", "aktiv", "pausiert", "beendet"];
function dueInfo(due: string): { cls: string; label: string } {
  if (!due) return { cls: "due-none", label: "kein Termin" };
  const d = new Date(due + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { cls: "due-red", label: `überfällig · ${due}` };
  if (days === 0) return { cls: "due-amber", label: "heute fällig" };
  if (days <= 3) return { cls: "due-amber", label: `in ${days} Tag${days === 1 ? "" : "en"}` };
  return { cls: "due-green", label: `fällig ${due}` };
}
const statusClass = (s: string) =>
  `status-badge st-${["lead", "aktiv", "pausiert", "beendet"].includes(s) ? s : "aktiv"}`;
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAgency = user?.role !== "client_user";

  const [clients, setClients] = useState<Client[]>([]);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [myTasks, setMyTasks] = useState<MyTodo[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    api.clients().then(setClients).catch((e) => setError((e as Error).message));
    api.myTodos().then(setMyTasks).catch(() => {});
    if (isAgency) { api.dashboard().then(setDash).catch(() => {}); api.monitors().then(setMonitors).catch(() => {}); }
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
    && (showArchived ? c.archived : !c.archived)
  ), [clients, q, filter, showArchived]);

  return (
    <>
      {user && !user.totp_enabled && (
        <div className="section" style={{ borderLeft: "3px solid var(--teal)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <strong>🔒 Konto absichern</strong>
            <div className="muted" style={{ fontSize: 13 }}>Aktiviere die Zwei-Faktor-Authentifizierung – zusätzlicher Schutz per Authenticator-App.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/konto")}>2FA einrichten</button>
        </div>
      )}

      {isAgency && dash && (
        <div className="hero">
          <h1>Hallo{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""} 👋</h1>
          <div className="sub">Alle Kunden, Pakete und Aktivitäten auf einen Blick.</div>
          <div className="hero-stats">
            <div className="hero-stat"><div className="v">{dash.clients_total}</div><div className="l">Kunden</div></div>
            <div className="hero-stat"><div className="v">{dash.status_counts["aktiv"] || 0}</div><div className="l">Aktiv</div></div>
            <div className="hero-stat"><div className="v">{dash.status_counts["lead"] || 0}</div><div className="l">Leads</div></div>
            <div className="hero-stat"><div className="v">{dash.open_todos}</div><div className="l">Offene To-Dos</div></div>
            <div className="hero-stat"><div className="v">{dash.reports_total}</div><div className="l">Reports</div></div>
          </div>
        </div>
      )}

      {myTasks.length > 0 && (
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between" }}>
            <h2>Meine offenen Aufgaben</h2>
            <span className="muted" style={{ fontSize: 13 }}>{myTasks.length}</span>
          </div>
          {myTasks.map((t) => {
            const di = dueInfo(t.due_date);
            return (
              <div key={t.id} className="list-row clickable" onClick={() => navigate(`/clients/${t.client_id}`)}
                style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span className={`due-dot ${di.cls}`} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{t.title}</strong>
                    {t.priority === "high" && <span className="prio prio-high" style={{ marginLeft: 8 }}>hoch</span>}
                    <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.client_name}{t.project_title ? ` · ↳ ${t.project_title}` : ""}
                    </div>
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{di.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {isAgency && monitors.filter((m) => m.status === "down").length > 0 && (
        <div className="section" style={{ borderLeft: "3px solid #f87171" }}>
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>⚠️ {monitors.filter((m) => m.status === "down").length} Website(s) offline</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/monitoring")}>Monitoring öffnen</button>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {monitors.filter((m) => m.status === "down").map((m) => m.name).join(", ")}
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
          <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archiv
          </label>
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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="avatar">{initials(c.name) || "?"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ marginBottom: 2 }}>{c.name}</h3>
                  <div className="meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.contract_package || c.contact_email || "—"}
                  </div>
                </div>
                <span className={statusClass(c.status)}>{c.status || "aktiv"}</span>
              </div>
              {!c.onboarding_completed && <div style={{ marginTop: 12 }}><span className="tag coral">Onboarding offen</span></div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
