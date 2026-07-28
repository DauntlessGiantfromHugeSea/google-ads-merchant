import { useEffect, useMemo, useState } from "react";
import { Project, Todo, api } from "../api";
import { useToast } from "../toast";
import Kanban from "../components/Kanban";

const TYPES = ["design", "marketing", "web", "seo", "social", "sonstiges"];

export default function Projects({ clientId, isAgency, onCount }:
  { clientId: string; isAgency: boolean; onCount?: (open: number) => void }) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("design");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");

  const load = () => api.projects(clientId).then((p) => {
    setProjects(p);
    onCount?.(p.filter((x) => x.status !== "done").length);
  }).catch(() => {});
  useEffect(() => {
    load();
    api.todos(clientId).then(setTodos).catch(() => {});
  }, [clientId]);

  const todoCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of todos) if (t.project_id && t.status !== "done") m[t.project_id] = (m[t.project_id] || 0) + 1;
    return m;
  }, [todos]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createProject(clientId, { title, type, assignee, due_date: due });
      setTitle(""); setAssignee(""); setDue(""); setShow(false); load(); toast("Projekt angelegt.");
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const move = async (p: Project, status: string) => {
    await api.updateProject(clientId, p.id, { status });
    setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status } : x)));
  };
  const del = async (p: Project) => {
    if (!confirm(`Projekt „${p.title}" löschen?`)) return;
    await api.deleteProject(clientId, p.id); load(); toast("Projekt gelöscht.");
  };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Projekte</h2>
        {isAgency && <button className="btn btn-primary btn-sm" onClick={() => setShow((s) => !s)}>{show ? "Abbrechen" : "+ Projekt"}</button>}
      </div>
      {show && (
        <form className="row-inline form-light" style={{ margin: "10px 0 16px" }} onSubmit={create}>
          <div className="field" style={{ flex: 2 }}><label>Titel</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="z.B. Logo Redesign" /></div>
          <div className="field"><label>Typ</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div className="field"><label>Verantwortlich</label>
            <input className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} /></div>
          <div className="field"><label>Fällig</label>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <button className="btn btn-primary">Anlegen</button>
        </form>
      )}
      {projects.length === 0
        ? <div className="empty">Noch keine Projekte.</div>
        : <Kanban projects={projects} canEdit={isAgency} onMove={move} onDelete={del} todoCounts={todoCounts} />}
    </div>
  );
}
