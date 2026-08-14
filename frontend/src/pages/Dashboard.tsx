import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Appointment, Client, DashboardData, Monitor, MyTodo, api } from "../api";
import { useAuth } from "../App";

const STATUS = ["lead", "aktiv", "pausiert", "beendet"];
const STAGES = [
  { key: "lead", label: "Lead", color: "#94a3b8" },
  { key: "kontaktiert", label: "Kontaktiert", color: "#38bdf8" },
  { key: "angebot", label: "Angebot", color: "#f59e0b" },
  { key: "gewonnen", label: "Gewonnen", color: "#10b981" },
  { key: "verloren", label: "Verloren", color: "#ef4444" },
];
function effectiveStage(c: Client): string {
  if (c.pipeline_stage) return c.pipeline_stage;
  if (c.status === "aktiv") return "gewonnen";
  if (c.status === "beendet") return "verloren";
  return "lead";
}
function dueInfo(due: string): { cls: string; label: string; days: number } {
  if (!due) return { cls: "due-none", label: "kein Termin", days: 9999 };
  const d = new Date(due + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { cls: "due-red", label: `überfällig · ${due}`, days };
  if (days === 0) return { cls: "due-amber", label: "heute fällig", days };
  if (days <= 3) return { cls: "due-amber", label: `in ${days} Tag${days === 1 ? "" : "en"}`, days };
  return { cls: "due-green", label: `fällig ${due}`, days };
}
const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const statusClass = (s: string) =>
  `status-badge st-${["lead", "aktiv", "pausiert", "beendet"].includes(s) ? s : "aktiv"}`;
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
function fmtAppt(iso: string): { day: string; time: string; overdueToday: boolean } {
  const d = new Date(iso);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const day = same ? "heute" : d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return { day, time, overdueToday: same };
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAgency = user?.role !== "client_user";

  const [clients, setClients] = useState<Client[]>([]);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [myTasks, setMyTasks] = useState<MyTodo[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
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
    if (isAgency) {
      api.dashboard().then(setDash).catch(() => {});
      api.monitors().then(setMonitors).catch(() => {});
      api.allAppointments().then(setAppts).catch(() => {});
    }
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

  const active = useMemo(() => clients.filter((c) => !c.archived), [clients]);
  const pipelineValue = active
    .filter((c) => ["lead", "kontaktiert", "angebot"].includes(effectiveStage(c)))
    .reduce((a, c) => a + (c.deal_value || 0), 0);
  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    STAGES.forEach((s) => (m[s.key] = 0));
    active.forEach((c) => { m[effectiveStage(c)] = (m[effectiveStage(c)] || 0) + 1; });
    return m;
  }, [active]);
  const followups = useMemo(() =>
    active.filter((c) => c.next_followup && !["gewonnen", "verloren"].includes(effectiveStage(c)))
      .map((c) => ({ c, info: dueInfo(c.next_followup) }))
      .sort((a, b) => a.info.days - b.info.days).slice(0, 6),
  [active]);
  const upcoming = useMemo(() => {
    const now = Date.now();
    return appts
      .filter((a) => { const t = new Date(a.starts_at).getTime(); return !isNaN(t) && t >= now - 3600000; })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 5);
  }, [appts]);
  const todayTasks = myTasks.filter((t) => dueInfo(t.due_date).days <= 0);
  const downCount = monitors.filter((m) => m.status === "down").length;
  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "";

  // ---- Kundenansicht (schlank) ----
  if (!isAgency) {
    return (
      <>
        {user && !user.totp_enabled && <TwoFANudge onGo={() => navigate("/konto")} />}
        <div className="hero">
          <h1>Hallo{firstName ? `, ${firstName}` : ""} 👋</h1>
          <div className="sub">Deine Reports und offenen Punkte auf einen Blick.</div>
        </div>
        {myTasks.length > 0 && <MyTasksCard tasks={myTasks} navigate={navigate} />}
        <div className="page-head"><h1>Dein Bereich</h1></div>
        {filtered.length === 0 ? <div className="empty">Noch nichts freigegeben.</div> : (
          <div className="grid">
            {filtered.map((c) => (
              <div key={c.id} className="card clickable" onClick={() => navigate(`/clients/${c.id}`)}>
                <h3>{c.name}</h3>
                <div className="meta">{c.contract_package || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // ---- Agentur-Cockpit ----
  return (
    <>
      {user && !user.totp_enabled && <TwoFANudge onGo={() => navigate("/konto")} />}

      <div className="hero">
        <h1>Hallo{firstName ? `, ${firstName}` : ""} 👋</h1>
        <div className="sub">Dein Agentur-Cockpit – Pipeline, Termine und Aufgaben auf einen Blick.</div>
        {dash && (
          <div className="hero-stats">
            <div className="hero-stat"><div className="v">{eur(pipelineValue)}</div><div className="l">Offene Pipeline</div></div>
            <div className="hero-stat"><div className="v">{dash.status_counts["aktiv"] || 0}</div><div className="l">Aktive Kunden</div></div>
            <div className="hero-stat"><div className="v">{dash.status_counts["lead"] || 0}</div><div className="l">Leads</div></div>
            <div className="hero-stat"><div className="v">{todayTasks.length}</div><div className="l">Heute fällig</div></div>
            <div className="hero-stat"><div className="v">{upcoming.length}</div><div className="l">Termine</div></div>
          </div>
        )}
      </div>

      {dash?.expiring_contracts && dash.expiring_contracts.length > 0 && (
        <div className="section" style={{ borderLeft: "3px solid #fbbf24" }}>
          <h2 style={{ margin: "0 0 8px" }}>⏳ Verträge laufen bald aus</h2>
          <div className="cockpit-list">
            {dash.expiring_contracts.map((e) => (
              <div key={e.client_id} className="list-row clickable" onClick={() => navigate(`/clients/${e.client_id}`)}>
                <div style={{ minWidth: 0 }}>
                  <strong className="ellip">{e.client_name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>endet {e.contract_end}</div>
                </div>
                <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", color: e.days_left <= 7 ? "#f87171" : undefined }}>
                  {e.days_left === 0 ? "heute" : `in ${e.days_left} Tag${e.days_left === 1 ? "" : "en"}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {downCount > 0 && (
        <div className="section" style={{ borderLeft: "3px solid #f87171" }}>
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>⚠️ {downCount} Website(s) offline</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/monitoring")}>Monitoring</button>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {monitors.filter((m) => m.status === "down").map((m) => m.name).join(", ")}
          </div>
        </div>
      )}

      <div className="cockpit">
        {/* Meine Aufgaben */}
        <div className="section cockpit-card">
          <div className="row-inline" style={{ justifyContent: "space-between" }}>
            <h2>Meine Aufgaben</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/planner")}>Planner</button>
          </div>
          {myTasks.length === 0 ? <div className="empty sm">Nichts offen. 🎉</div> : (
            <div className="cockpit-list">
              {myTasks.slice(0, 6).map((t) => {
                const di = dueInfo(t.due_date);
                return (
                  <div key={t.id} className="list-row clickable" onClick={() => navigate(`/clients/${t.client_id}`)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      <span className={`due-dot ${di.cls}`} />
                      <div style={{ minWidth: 0 }}>
                        <strong>{t.title}</strong>
                        {t.priority === "high" && <span className="prio prio-high" style={{ marginLeft: 8 }}>hoch</span>}
                        <div className="muted ellip" style={{ fontSize: 12 }}>{t.client_name}</div>
                      </div>
                    </div>
                    <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{di.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Anstehende Termine */}
        <div className="section cockpit-card">
          <h2>Anstehende Termine</h2>
          {upcoming.length === 0 ? <div className="empty sm">Keine Termine geplant.</div> : (
            <div className="cockpit-list">
              {upcoming.map((a) => {
                const f = fmtAppt(a.starts_at);
                return (
                  <div key={a.id} className="list-row clickable" onClick={() => navigate(`/clients/${a.client_id}`)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                      <span className={`appt-badge ${f.overdueToday ? "today" : ""}`}>{f.day}<b>{f.time}</b></span>
                      <div style={{ minWidth: 0 }}>
                        <strong className="ellip">{a.title}</strong>
                        <div className="muted ellip" style={{ fontSize: 12 }}>{a.client_name}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Follow-ups */}
        <div className="section cockpit-card">
          <div className="row-inline" style={{ justifyContent: "space-between" }}>
            <h2>Follow-ups</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/crm")}>CRM</button>
          </div>
          {followups.length === 0 ? <div className="empty sm">Keine Follow-ups fällig.</div> : (
            <div className="cockpit-list">
              {followups.map(({ c, info }) => (
                <div key={c.id} className="list-row clickable" onClick={() => navigate(`/clients/${c.id}`)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className={`due-dot ${info.cls}`} />
                    <div style={{ minWidth: 0 }}>
                      <strong className="ellip">{c.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{effectiveStage(c)}</div>
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{info.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline-Snapshot */}
        <div className="section cockpit-card">
          <div className="row-inline" style={{ justifyContent: "space-between" }}>
            <h2>Pipeline</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/crm")}>Board</button>
          </div>
          <div className="pipe-mini">
            {STAGES.map((s) => (
              <div key={s.key} className="pipe-mini-row clickable" onClick={() => navigate("/crm")}>
                <span className="crm-dot" style={{ background: s.color }} />
                <span className="pipe-mini-label">{s.label}</span>
                <span className="pipe-mini-count">{stageCounts[s.key] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {dash && dash.recent_updates && dash.recent_updates.length > 0 && (
        <div className="section">
          <h2>Letzte Aktivität</h2>
          <div className="cockpit-list">
            {dash.recent_updates.slice(0, 6).map((u, i) => (
              <div key={i} className="list-row clickable" onClick={() => navigate(`/clients/${u.client_id}`)}>
                <div style={{ minWidth: 0 }}>
                  <strong className="ellip">{u.title}</strong>
                  <div className="muted ellip" style={{ fontSize: 12 }}>{u.client_name}{u.body ? ` · ${u.body}` : ""}</div>
                </div>
                <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {new Date(u.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kundenliste */}
      <div className="page-head">
        <h1>Kunden</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Abbrechen" : "+ Neuer Kunde"}
        </button>
      </div>

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
                  <div className="meta ellip">{c.contract_package || c.contact_email || "—"}</div>
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

function TwoFANudge({ onGo }: { onGo: () => void }) {
  return (
    <div className="section" style={{ borderLeft: "3px solid var(--teal)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div>
        <strong>🔒 Konto absichern</strong>
        <div className="muted" style={{ fontSize: 13 }}>Aktiviere die Zwei-Faktor-Authentifizierung – zusätzlicher Schutz per Authenticator-App.</div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={onGo}>2FA einrichten</button>
    </div>
  );
}

function MyTasksCard({ tasks, navigate }: { tasks: MyTodo[]; navigate: (p: string) => void }) {
  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Meine offenen Aufgaben</h2>
        <span className="muted" style={{ fontSize: 13 }}>{tasks.length}</span>
      </div>
      {tasks.map((t) => {
        const di = dueInfo(t.due_date);
        return (
          <div key={t.id} className="list-row clickable" onClick={() => navigate(`/clients/${t.client_id}`)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className={`due-dot ${di.cls}`} />
              <div style={{ minWidth: 0 }}>
                <strong>{t.title}</strong>
                <div className="muted ellip" style={{ fontSize: 12 }}>{t.client_name}</div>
              </div>
            </div>
            <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{di.label}</span>
          </div>
        );
      })}
    </div>
  );
}
