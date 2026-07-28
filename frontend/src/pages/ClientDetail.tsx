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
import Offers from "../sections/Offers";

const NAV = [
  { key: "overview", label: "Übersicht" },
  { key: "work", label: "Projekte & Aufgaben" },
  { key: "reporting", label: "Reporting" },
  { key: "business", label: "Angebote & Vertrag" },
  { key: "contact", label: "Kontakt & Verlauf" },
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
  const toggleArchive = async () => setClient(await api.updateClient(id, { archived: !client?.archived }));
  const removeClient = async () => {
    if (!confirm(`Kunde „${client?.name}" endgültig löschen? Alle Daten (Angebote, Reports, Projekte …) gehen verloren.`)) return;
    await api.deleteClient(id); navigate("/");
  };

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
          <div className="row-inline" style={{ alignItems: "center" }}>
            <button className="btn btn-ghost" onClick={viewAsClient}>👁️ Als Kunde ansehen</button>
            <button className="btn btn-ghost" onClick={toggleArchive}>{client.archived ? "Reaktivieren" : "Archivieren"}</button>
            {user?.role === "agency_admin" && <button className="del" onClick={removeClient}>Löschen</button>}
          </div>
        </div>
      )}
      <div className="client-layout">
        <nav className="client-nav">
          <div className="client-name">{client.name}</div>
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${section === n.key ? "active" : ""}`}
              onClick={() => setSection(n.key)}>
              {n.label}
              {n.key === "work" && openTodos ? <span className="badge-count">{openTodos}</span> : null}
            </button>
          ))}
        </nav>

        <div className="client-content">
          {section === "overview" && (
            <Overview client={client} isAgency={isAgency} onGo={setSection} onSaved={setClient} />
          )}
          {section === "work" && (
            <>
              <Launch clientId={id} isAgency={isAgency} />
              <Projects clientId={id} isAgency={isAgency} />
              <Todos clientId={id} isAgency={isAgency} onCount={setOpenTodos} />
            </>
          )}
          {section === "reporting" && (
            <>
              <Reportings clientId={id} clientName={client.name} isAgency={isAgency} />
              <Monitoring clientId={id} isAgency={isAgency} />
            </>
          )}
          {section === "business" && (
            <>
              <Offers clientId={id} isAgency={isAgency} />
              <Contract client={client} isAgency={isAgency} onSaved={setClient} />
              <Documents clientId={id} isAgency={isAgency} client={client} />
            </>
          )}
          {section === "contact" && (
            <>
              <Contact client={client} isAgency={isAgency} onSaved={setClient} />
              <Updates clientId={id} isAgency={isAgency} />
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
        </div>
      </div>
    </>
  );
}
