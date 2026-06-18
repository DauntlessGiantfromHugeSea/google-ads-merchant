import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Project, api } from "../api";
import Kanban from "../components/Kanban";

export default function ProjectsBoard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  const load = () => api.allProjects().then(setProjects).catch((e) => setError((e as Error).message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => (type ? projects.filter((p) => p.type === type) : projects), [projects, type]);
  const active = projects.filter((p) => p.status !== "done").length;

  const move = async (p: Project, status: string) => {
    await api.updateProject(p.client_id, p.id, { status });
    setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status } : x)));
  };

  return (
    <>
      <div className="hero">
        <h1>Projekte</h1>
        <div className="sub">Alle Projekte über alle Kunden – dein Agentur-Cockpit.</div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="v">{projects.length}</div><div className="l">Gesamt</div></div>
          <div className="hero-stat"><div className="v">{active}</div><div className="l">Aktiv</div></div>
          <div className="hero-stat"><div className="v">{projects.filter((p) => p.status === "done").length}</div><div className="l">Fertig</div></div>
        </div>
      </div>

      <div className="row-inline" style={{ marginBottom: 16 }}>
        <select className="select form-light" style={{ maxWidth: 200 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Alle Typen</option>
          {["design", "marketing", "web", "seo", "social", "sonstiges"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {error && <div className="error">{error}</div>}
      {projects.length === 0
        ? <div className="empty">Noch keine Projekte. Lege sie im Kundenprofil unter „Projekte" an.</div>
        : <Kanban projects={filtered} canEdit onMove={move} onOpenClient={(cid) => navigate(`/clients/${cid}`)} />}
    </>
  );
}
