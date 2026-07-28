import { useEffect, useMemo, useState } from "react";
import { Assignee, ChecklistItem, Project, Todo, api } from "../api";
import { useToast } from "../toast";

const RECUR_LABEL: Record<string, string> = { daily: "täglich", weekly: "wöchentlich", monthly: "monatlich" };

function Checklist({ clientId, todo, isAgency }: { clientId: string; todo: Todo; isAgency: boolean }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [text, setText] = useState("");
  useEffect(() => { api.checklist(clientId, todo.id).then(setItems).catch(() => {}); }, [clientId, todo.id]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim()) return;
    const it = await api.addChecklist(clientId, todo.id, text.trim());
    setItems((x) => [...x, it]); setText("");
  };
  const toggle = async (it: ChecklistItem) => {
    const up = await api.updateChecklist(clientId, todo.id, it.id, { done: !it.done });
    setItems((x) => x.map((y) => (y.id === it.id ? up : y)));
  };
  const del = async (it: ChecklistItem) => {
    await api.deleteChecklist(clientId, todo.id, it.id);
    setItems((x) => x.filter((y) => y.id !== it.id));
  };
  const done = items.filter((i) => i.done).length;

  return (
    <div className="checklist">
      {items.length > 0 && <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{done}/{items.length} erledigt</div>}
      {items.map((it) => (
        <div key={it.id} className="checklist-item">
          <input type="checkbox" checked={it.done} disabled={!isAgency} onChange={() => toggle(it)} />
          <span style={{ textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.6 : 1, flex: 1 }}>{it.text}</span>
          {isAgency && <button className="del" onClick={() => del(it)}>✕</button>}
        </div>
      ))}
      {isAgency && (
        <form className="checklist-item" onSubmit={add}>
          <input className="input form-light" style={{ flex: 1, padding: "6px 8px" }} value={text}
            onChange={(e) => setText(e.target.value)} placeholder="+ Unteraufgabe" />
        </form>
      )}
    </div>
  );
}

function TodoRow({ t, clientId, isAgency, projects, people, onToggle, onReassignUser, onReassignProject, onDel }: {
  t: Todo; clientId: string; isAgency: boolean; projects: Project[]; people: Assignee[];
  onToggle: (t: Todo) => void; onReassignUser: (t: Todo, id: string) => void;
  onReassignProject: (t: Todo, id: string) => void; onDel: (t: Todo) => void;
}) {
  const [open, setOpen] = useState(false);
  const personLabel = (a: Assignee) => `${a.full_name}${a.kind === "client" ? " (Kunde)" : ""}`;
  return (
    <div className={`todo ${t.status === "done" ? "done" : ""}`}>
      <input className="todo-check" type="checkbox" checked={t.status === "done"} disabled={!isAgency} onChange={() => onToggle(t)} />
      <div className="todo-body">
        <div className="todo-title">
          {t.title}
          {t.priority && t.priority !== "normal" && (
            <span className={`prio prio-${t.priority}`} style={{ marginLeft: 8 }}>{t.priority === "high" ? "hoch" : "niedrig"}</span>
          )}
          {t.recurrence && <span className="tag" style={{ marginLeft: 6, fontSize: 10 }}>↻ {RECUR_LABEL[t.recurrence] || t.recurrence}</span>}
          <button className="chk-toggle" onClick={() => setOpen((o) => !o)}>
            ☑ {t.checklist_total > 0 ? `${t.checklist_done}/${t.checklist_total}` : "Checkliste"}
          </button>
        </div>
        {(t.due_date || t.description || t.assignee_name || t.assignee) && (
          <div className="todo-sub">
            {(t.assignee_name || t.assignee) && `👤 ${t.assignee_name || t.assignee}`}
            {t.due_date && `${(t.assignee_name || t.assignee) ? " · " : ""}fällig ${t.due_date}`}
            {t.description && ` · ${t.description}`}
          </div>
        )}
        {open && <Checklist clientId={clientId} todo={t} isAgency={isAgency} />}
      </div>
      {isAgency && (
        <div className="todo-controls">
          <select className="select form-light todo-project" value={t.assignee_id || ""}
            onChange={(e) => onReassignUser(t, e.target.value)} title="Nutzer zuweisen">
            <option value="">Niemand</option>
            {people.map((a) => <option key={a.id} value={a.id}>{personLabel(a)}</option>)}
          </select>
          <select className="select form-light todo-project" value={t.project_id || ""}
            onChange={(e) => onReassignProject(t, e.target.value)} title="Projekt zuordnen">
            <option value="">Ohne Projekt</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button className="del" onClick={() => onDel(t)}>löschen</button>
        </div>
      )}
    </div>
  );
}

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
  const [recur, setRecur] = useState("");

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
      project_id: projectId || null, assignee_id: assigneeId || null, recurrence: recur,
    });
    setTitle(""); setDue(""); setPrio("normal"); setAssigneeId(""); setProjectId(""); setRecur(""); load();
  };
  const toggle = async (t: Todo) => { await api.updateTodo(clientId, t.id, { status: t.status === "done" ? "open" : "done" }); load(); };
  const reassignProject = async (t: Todo, pid: string) => { await api.updateTodo(clientId, t.id, { project_id: pid || null }); load(); };
  const reassignUser = async (t: Todo, uid: string) => { await api.updateTodo(clientId, t.id, { assignee_id: uid || null }); load(); };
  const del = async (t: Todo) => {
    if (!confirm(`„${t.title}“ löschen?`)) return;
    await api.deleteTodo(clientId, t.id); load(); toast("Aufgabe gelöscht.");
  };

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
          <div className="field"><label>Wiederholung</label>
            <select className="select form-light" value={recur} onChange={(e) => setRecur(e.target.value)}>
              <option value="">einmalig</option><option value="daily">täglich</option>
              <option value="weekly">wöchentlich</option><option value="monthly">monatlich</option>
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
          {grp.items.map((t) => (
            <TodoRow key={t.id} t={t} clientId={clientId} isAgency={isAgency} projects={projects} people={people}
              onToggle={toggle} onReassignUser={reassignUser} onReassignProject={reassignProject} onDel={del} />
          ))}
        </div>
      ))}
    </div>
  );
}
