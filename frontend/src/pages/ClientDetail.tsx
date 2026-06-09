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

const NAV = [
  { key: "overview", label: "Übersicht" },
  { key: "reportings", label: "Reportings" },
  { key: "contract", label: "Vertragsdaten" },
  { key: "todos", label: "To-Dos" },
  { key: "contact", label: "Kontakt" },
  { key: "updates", label: "Verlauf" },
];

export default function ClientDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAgency = user?.role !== "client_user";

  const [client, setClient] = useState<Client | null>(null);
  const [section, setSection] = useState("overview");
  const [openTodos, setOpenTodos] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Einladung (Kunden-Zugang)
  const [invEmail, setInvEmail] = useState("");
  const [invPw, setInvPw] = useState("");
  const [invMsg, setInvMsg] = useState("");

  useEffect(() => {
    api.client(id).then(setClient).catch((e) => setError((e as Error).message));
    api.todos(id).then((t) => setOpenTodos(t.filter((x) => x.status !== "done").length)).catch(() => {});
  }, [id]);

  if (error) return <div className="empty">{error}</div>;
  if (!client) return <div className="empty">Lädt…</div>;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setInvMsg("");
    try {
      await api.invite(id, { email: invEmail, password: invPw });
      setInvEmail(""); setInvPw(""); setInvMsg("Kunden-Zugang angelegt.");
    } catch (err) { setInvMsg((err as Error).message); }
  };

  return (
    <>
      <span className="back-link" onClick={() => navigate("/")}>← Alle Kunden</span>
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
          {section === "reportings" && (
            <Reportings clientId={id} clientName={client.name} isAgency={isAgency} />
          )}
          {section === "contract" && (
            <Contract client={client} isAgency={isAgency} onSaved={setClient} />
          )}
          {section === "todos" && (
            <Todos clientId={id} isAgency={isAgency} onCount={setOpenTodos} />
          )}
          {section === "contact" && (
            <>
              <Contact client={client} isAgency={isAgency} onSaved={setClient} />
              {isAgency && (
                <div className="section form-light">
                  <h2>Kunden-Zugang</h2>
                  <p className="muted" style={{ marginTop: 0 }}>Legt einen Login an, der nur diesen Kunden sieht.</p>
                  <form className="row-inline" onSubmit={invite}>
                    <div className="field" style={{ flex: 2 }}><label>E-Mail</label>
                      <input className="input" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required /></div>
                    <div className="field"><label>Start-Passwort</label>
                      <input className="input" value={invPw} onChange={(e) => setInvPw(e.target.value)} required /></div>
                    <button className="btn btn-primary">Einladen</button>
                  </form>
                  {invMsg && <div className="muted" style={{ marginTop: 8 }}>{invMsg}</div>}
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
