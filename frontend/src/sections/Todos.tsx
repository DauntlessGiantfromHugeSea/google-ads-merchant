import { useEffect, useMemo, useState } from "react";
import { Assignee, Project, Todo, api } from "../api";
import { useToast } from "../toast";

export default function Todos({ clientId, isAgency, onCount }:
  { clientId: string; isAgency: boolean; onCount?: (open: number) => void }) {
  const toast = useToast();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Assignee[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [prio, setPrio] = useState("normal");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");

  const load = () => api.todos(clientId).then((t) => {
    setTodos(t);
    onCount?.(t.filter((x) => x.status !== "done").length);
  }).catch(() => {});
  useEffect(() => {
    load();
    api.projects(clientId).then(setProjects).catch(() => {});
    if (isAgency) api.assignees(clientId).then(setPeople).catch(() => {});
  }, [clientId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createTodo(clientId, {
      title, due_date: due, priority: prio,
      project_id: projectId || null, assignee_id: assigneeId || null,
    });
    setTitle(""); setDue(""); setPrio("normal"); setAssigneeId(""); setProjectId(""); load();
  };
  const toggle = async (t: Todo) => {
    await api.updateTodo(clientId, t.id, { status: t.status === "done" ? "open" : "done" });
    load();
  };
  const reassignProject = async (t: Todo, pid: string) => {
    await api.updateTodo(clientId, t.id, { project_id: pid || null }); load();
  };
  const reassignUser = async (t: Todo, uid: string) => {
    await api.updateTodo(clientId, t.id, { assignee_id: uid || null }); load();
  };
  const del = async (t: Todo) => {
    if (!confirm(`„${t.title}“ löschen?`)) return;
    await api.deleteTodo(clientId, t.id); load(); toast("Aufgabe gelöscht.");
  };

  // Nach Projekt gruppieren: Projekte in ihrer Reihenfolge, dann "Ohne Projekt".
  const groups = useMemo(() => {
    const g = projects.map((p) => ({ id: p.id, title: p.title, items: [] as Todo[] }));
    const none: Todo[] = [];
    for (const t of todos) {
      const grp = t.project_id ? g.find((x) => x.id === t.project_id) : null;
      if (grp) grp.items.push(t); else none.push(t);
    }
    const out = g.filter((x) => x.items.length > 0);
    if (none.length) out.push({ id: "", title: "Ohne Projekt", items: none });
    return out;
  }, [todos, projects]);

  const personLabel = (a: Assignee) => `${a.full_name}${a.kind === "client" ? " (Kunde)" : ""}`;

  const row = (t: Todo) => (
    <div key={t.id} className={`todo ${t.status === "done" ? "done" : ""}`}>
      <input className="todo-check" type="checkbox" checked={t.status === "done"}
        disabled={!isAgency} onChange={() => toggle(t)} />
      <div className="todo-body">
        <div className="todo-title">
          {t.title}
          {t.priority && t.priority !== "normal" && (
            <span className={`prio prio-${t.priority}`} style={{ marginLeft: 8 }}>
              {t.priority === "high" ? "hoch" : "niedrig"}
            </span>
          )}
        </div>
        {(t.due_date || t.description || t.assignee_name || t.assignee) && (
          <div className="todo-sub">
            {(t.assignee_name || t.assignee) && `👤 ${t.assignee_name || t.assignee}`}
            {t.due_date && `${(t.assignee_name || t.assignee) ? " · " : ""}fällig ${t.due_date}`}
            {t.description && ` · ${t.description}`}
          </div>
        )}
      </div>
      {isAgency && (
        <div className="todo-controls">
          <select className="select form-light todo-project" value={t.assignee_id || ""}
            onChange={(e) => reassignUser(t, e.target.value)} title="Nutzer zuweisen">
            <option value="">Niemand</option>
            {people.map((a) => <option key={a.id} value={a.id}>{personLabel(a)}</option>)}
          </select>
          <select className="select form-light todo-project" value={t.project_id || ""}
            onChange={(e) => reassignProject(t, e.target.value)} title="Projekt zuordnen">
            <option value="">Ohne Projekt</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button className="del" onClick={() => del(t)}>löschen</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="section">
      <h2>To-Dos</h2>
      {isAgency && (
        <form className="row-inline" style={{ marginBottom: 12 }} onSubmit={add}>
          <div className="field" style={{ flex: 2 }}><label>Aufgabe</label>
            <input className="input form-light" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was ist zu tun?" /></div>
          <div className="field"><label>Zuständig</label>
            <select className="select form-light" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Niemand</option>
              {people.map((a) => <option key={a.id} value={a.id}>{personLabel(a)}</option>)}
            </select></div>
          <div className="field"><label>Projekt</label>
            <select className="select form-light" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Ohne Projekt</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select></div>
          <div className="field"><label>Fällig</label>
            <input className="input form-light" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div className="field"><label>Priorität</label>
            <select className="select form-light" value={prio} onChange={(e) => setPrio(e.target.value)}>
              <option value="low">niedrig</option><option value="normal">normal</option><option value="high">hoch</option>
            </select></div>
          <button className="btn btn-primary">Hinzufügen</button>
        </form>
      )}
      {todos.length === 0 ? <div className="empty">Keine offenen Aufgaben.</div> : groups.map((grp) => (
        <div key={grp.id || "none"} className="todo-group">
          <div className="todo-group-head">
            {grp.id ? <span className="ci-dot d-project" /> : <span className="ci-dot" />}
            {grp.title}
            <span className="muted" style={{ fontWeight: 400 }}> · {grp.items.filter((t) => t.status !== "done").length} offen</span>
          </div>
          {grp.items.map(row)}
        </div>
      ))}
    </div>
  );
}
