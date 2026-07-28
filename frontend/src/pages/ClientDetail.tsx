import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Client, api } from "../api";
import { useAuth } from "../App";
import Overview from "../sections/Overview";
import Reportings from "../sections/Reportings";
import Contract from "../sections/Contract";
import Contact from "../sections/Contact";
import Todos from "../sections/Todos";
import Updates from "../sections/Updates";
import Documents from "../sections/Documents";
import Projects from "../sections/Projects";
import MailCompose from "../sections/MailCompose";
import Launch from "../sections/Launch";
import Monitoring from "../sections/Monitoring";

const NAV = [
  { key: "overview", label: "Übersicht" },
  { key: "launch", label: "Launch" },
  { key: "projects", label: "Projekte" },
  { key: "reportings", label: "Reportings" },
  { key: "monitoring", label: "Monitoring" },
  { key: "contract", label: "Vertragsdaten" },
  { key: "documents", label: "Dokumente" },
  { key: "todos", label: "To-Dos" },
  { key: "contact", label: "Kontakt" },
  { key: "updates", label: "Verlauf" },
];
const STATUS = ["lead", "aktiv", "pausiert", "beendet"];

export default function ClientDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user, impersonating, startImpersonate } = useAuth();
  const isAgency = user?.role !== "client_user";

  const viewAsClient = async () => {
    const r = await api.impersonate(id);
    await startImpersonate(r.access_token);
    setSection("overview");
  };
  const changeStatus = async (status: string) => setClient(await api.updateClient(id, { status }));

  const [client, setClient] = useState<Client | null>(null);
  const [section, setSection] = useState("overview");
  const [openTodos, setOpenTodos] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Einladung (Kunden-Zugang)
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invMsg, setInvMsg] = useState("");
  const [invLink, setInvLink] = useState("");

  useEffect(() => {
    api.client(id).then(setClient).catch((e) => setError((e as Error).message));
    api.todos(id).then((t) => setOpenTodos(t.filter((x) => x.status !== "done").length)).catch(() => {});
  }, [id]);

  if (error) return <div className="empty">{error}</div>;
  if (!client) return <div className="empty">Lädt…</div>;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setInvMsg(""); setInvLink("");
    try {
      const r = await api.invite(id, { email: invEmail, full_name: invName });
      setInvEmail(""); setInvName("");
      setInvMsg(r.emailed ? "Einladung per E-Mail gesendet." : "Zugang erstellt – bitte den Link teilen:");
      setInvLink(r.invite_url || "");
    } catch (err) { setInvMsg((err as Error).message); }
  };

  return (
    <>
      <span className="back-link" onClick={() => navigate("/")}>← Alle Kunden</span>
      {isAgency && !impersonating && (
        <div className="row-inline" style={{ justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
          <div className="row-inline" style={{ alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 13 }}>Status:</span>
            <select className="select form-light" style={{ maxWidth: 150, padding: "7px 10px" }}
              value={client.status || "aktiv"} onChange={(e) => changeStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost" onClick={viewAsClient}>👁️ Als Kunde ansehen</button>
        </div>
      )}
      <div className="client-layout">
        <nav className="client-nav">
          <div className="client-name">{client.name}</div>
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${section === n.key ? "active" : ""}`}
              onClick={() => setSection(n.key)}>
              {n.label}
              {n.key === "todos" && openTodos ? <span className="badge-count">{openTodos}</span> : null}
            </button>
          ))}
        </nav>

        <div className="client-content">
          {section === "overview" && (
            <Overview client={client} isAgency={isAgency} onGo={setSection} onSaved={setClient} />
          )}
          {section === "launch" && (
            <Launch clientId={id} isAgency={isAgency} />
          )}
          {section === "projects" && (
            <Projects clientId={id} isAgency={isAgency} />
          )}
          {section === "reportings" && (
            <Reportings clientId={id} clientName={client.name} isAgency={isAgency} />
          )}
          {section === "monitoring" && (
            <Monitoring clientId={id} isAgency={isAgency} />
          )}
          {section === "contract" && (
            <Contract client={client} isAgency={isAgency} onSaved={setClient} />
          )}
          {section === "documents" && (
            <Documents clientId={id} isAgency={isAgency} client={client} />
          )}
          {section === "todos" && (
            <Todos clientId={id} isAgency={isAgency} onCount={setOpenTodos} />
          )}
          {section === "contact" && (
            <>
              <Contact client={client} isAgency={isAgency} onSaved={setClient} />
              {isAgency && <MailCompose client={client} />}
              {isAgency && (
                <div className="section form-light">
                  <h2>Kunden-Zugang</h2>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Lädt den Kunden per E-Mail ein – er legt sein Passwort selbst fest. Ist Microsoft verbunden,
                    wird die Einladung automatisch gemailt; sonst teilst du den angezeigten Link.
                  </p>
                  <form className="row-inline" onSubmit={invite}>
                    <div className="field"><label>Name</label>
                      <input className="input" value={invName} onChange={(e) => setInvName(e.target.value)} /></div>
                    <div className="field" style={{ flex: 2 }}><label>E-Mail</label>
                      <input className="input" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required /></div>
                    <button className="btn btn-primary">Einladen</button>
                  </form>
                  {invMsg && <div className="muted" style={{ marginTop: 8 }}>{invMsg}</div>}
                  {invLink && (
                    <input className="input" readOnly value={invLink} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 6 }} />
                  )}
                </div>
              )}
            </>
          )}
          {section === "updates" && (
            <Updates clientId={id} isAgency={isAgency} />
          )}
        </div>
      </div>
    </>
  );
}
