import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Project, TodoGlobal, api } from "../api";
import { useToast } from "../toast";
import Kanban from "../components/Kanban";
import Calendar, { WorkItem, isDone } from "../components/Calendar";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function dueInfo(due: string, todayStr: string): { cls: string; label: string } {
  if (!due) return { cls: "due-none", label: "kein Termin" };
  const d = new Date(due + "T00:00:00");
  const today = new Date(todayStr + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { cls: "due-red", label: `überfällig · ${due}` };
  if (days === 0) return { cls: "due-amber", label: `heute fällig` };
  if (days <= 3) return { cls: "due-amber", label: `in ${days} Tag${days === 1 ? "" : "en"} · ${due}` };
  return { cls: "due-green", label: `fällig ${due}` };
}

type View = "kalender" | "liste" | "board";

export default function Planner() {
  const toast = useToast();
  const navigate = useNavigate();
  const todayStr = ymd(new Date());

  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<TodoGlobal[]>([]);
  const [view, setView] = useState<View>("kalender");
  const [assignee, setAssignee] = useState("");
  const [kind, setKind] = useState<"" | "project" | "todo">("");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.allProjects().then(setProjects).catch((e) => setError((e as Error).message));
    api.allTodos().then(setTodos).catch((e) => setError((e as Error).message));
  };
  useEffect(() => { load(); }, []);

  const items: WorkItem[] = useMemo(() => {
    const p: WorkItem[] = projects.map((x) => ({
      id: x.id, kind: "project", title: x.title, clientId: x.client_id, clientName: x.client_name || "",
      status: x.status, dueDate: x.due_date || "", assignee: x.assignee || "", priority: "normal", type: x.type,
    }));
    const t: WorkItem[] = todos.map((x) => ({
      id: x.id, kind: "todo", title: x.title, clientId: x.client_id, clientName: x.client_name || "",
      status: x.status, dueDate: x.due_date || "", assignee: x.assignee || "", priority: x.priority || "normal",
      type: "", projectTitle: x.project_title || "",
    }));
    return [...p, ...t];
  }, [projects, todos]);

  const filtered = useMemo(() => items
    .filter((i) => (kind ? i.kind === kind : true))
    .filter((i) => (assignee ? i.assignee === assignee : true))
    .filter((i) => (showDone ? true : !isDone(i))), [items, kind, assignee, showDone]);

  const assignees = useMemo(
    () => Array.from(new Set(items.map((i) => i.assignee).filter(Boolean))).sort(), [items]);

  const listItems = useMemo(() => [...filtered]
    .sort((a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99")), [filtered]);

  const openCount = items.filter((i) => !isDone(i)).length;
  const overdue = items.filter((i) => !isDone(i) && i.dueDate && i.dueDate < todayStr).length;
  const dueSoon = items.filter((i) => {
    if (isDone(i) || !i.dueDate) return false;
    const days = Math.round((new Date(i.dueDate).getTime() - new Date(todayStr).getTime()) / 86400000);
    return days >= 0 && days <= 7;
  }).length;

  const openItem = (i: WorkItem) => navigate(`/clients/${i.clientId}`);

  // Board: nur Projekte (Kanban-Spalten sind Projekt-Status)
  const boardProjects = useMemo(() => filtered.filter((i) => i.kind === "project")
    .map((i) => projects.find((p) => p.id === i.id)!).filter(Boolean), [filtered, projects]);

  const move = async (p: Project, status: string) => {
    await api.updateProject(p.client_id, p.id, { status });
    setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status } : x)));
  };
  const del = async (p: Project) => {
    if (!confirm(`Projekt „${p.title}“ löschen?`)) return;
    await api.deleteProject(p.client_id, p.id);
    setProjects((ps) => ps.filter((x) => x.id !== p.id));
    toast("Projekt gelöscht.");
  };
  const toggleTodo = async (i: WorkItem) => {
    const status = i.status === "done" ? "open" : "done";
    await api.updateTodo(i.clientId, i.id, { status });
    setTodos((ts) => ts.map((x) => (x.id === i.id ? { ...x, status } : x)));
    if (status === "done") toast("Erledigt.");
  };

  const VIEWS: { key: View; label: string }[] = [
    { key: "kalender", label: "Kalender" },
    { key: "liste", label: "Liste" },
    { key: "board", label: "Board" },
  ];

  return (
    <>
      <div className="hero">
        <h1>Planner</h1>
        <div className="sub">Alle Projekte & Aufgaben über alle Kunden – mit Terminen im Blick.</div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="v">{openCount}</div><div className="l">Offen</div></div>
          <div className="hero-stat"><div className="v">{dueSoon}</div><div className="l">Diese Woche</div></div>
          <div className="hero-stat"><div className="v">{overdue}</div><div className="l">Überfällig</div></div>
        </div>
      </div>

      <div className="planner-bar">
        <div className="seg">
          {VIEWS.map((v) => (
            <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </div>
        <div className="row-inline" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <select className="select form-light" style={{ maxWidth: 170 }} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="">Alles</option>
            <option value="project">Nur Projekte</option>
            <option value="todo">Nur Aufgaben</option>
          </select>
          <select className="select form-light" style={{ maxWidth: 180 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Alle Zuständigen</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Erledigte
          </label>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {view === "kalender" && (
        <div className="section">
          <Calendar items={filtered} onOpen={openItem} />
        </div>
      )}

      {view === "liste" && (
        <div className="section">
          {listItems.length === 0 ? <div className="empty">Nichts gefunden.</div> : listItems.map((i) => {
            const di = dueInfo(i.dueDate, todayStr);
            return (
              <div key={i.kind + i.id} className={`todo ${isDone(i) ? "done" : ""}`}>
                {i.kind === "todo"
                  ? <input className="todo-check" type="checkbox" checked={isDone(i)} onChange={() => toggleTodo(i)} />
                  : <span className="todo-check kind-dot" title="Projekt" />}
                <div className="todo-body">
                  <div className="todo-title">
                    {i.title}
                    <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>
                      {i.kind === "project" ? "Projekt" : "Aufgabe"}
                    </span>
                    {i.kind === "todo" && i.projectTitle && (
                      <span className="tag" style={{ marginLeft: 6, fontSize: 10, background: "rgba(167,139,250,0.18)", color: "#c9b8ff" }}>
                        ↳ {i.projectTitle}
                      </span>
                    )}
                    {i.priority === "high" && <span className="prio prio-high" style={{ marginLeft: 6 }}>hoch</span>}
                  </div>
                  <div className="todo-sub">
                    <span className="link-like" style={{ cursor: "pointer", color: "var(--violet)" }}
                      onClick={() => navigate(`/clients/${i.clientId}`)}>{i.clientName}</span>
                    {i.assignee && ` · 👤 ${i.assignee}`}
                    {" · "}<span className={`due-dot ${di.cls}`} /> {di.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "board" && (
        boardProjects.length === 0
          ? <div className="empty">Keine Projekte. Lege sie im Kundenprofil unter „Projekte & Aufgaben“ an.</div>
          : <Kanban projects={boardProjects} canEdit onMove={move} onDelete={del} onOpenClient={(cid) => navigate(`/clients/${cid}`)} />
      )}
    </>
  );
}
