import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TodoGlobal, api } from "../api";
import { useToast } from "../toast";

function dueInfo(due: string): { cls: string; label: string } {
  if (!due) return { cls: "due-none", label: "" };
  const d = new Date(due + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { cls: "due-red", label: `überfällig (${due})` };
  if (days <= 3) return { cls: "due-amber", label: `bald fällig (${due})` };
  return { cls: "due-green", label: `fällig ${due}` };
}

export default function Tasks() {
  const toast = useToast();
  const navigate = useNavigate();
  const [todos, setTodos] = useState<TodoGlobal[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [assignee, setAssignee] = useState("");

  const load = () => api.allTodos().then(setTodos).catch(() => {});
  useEffect(() => { load(); }, []);

  const assignees = useMemo(() => Array.from(new Set(todos.map((t) => t.assignee).filter(Boolean))), [todos]);
  const list = useMemo(() => todos
    .filter((t) => (showDone ? true : t.status !== "done"))
    .filter((t) => (assignee ? t.assignee === assignee : true))
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")), [todos, showDone, assignee]);

  const toggle = async (t: TodoGlobal) => {
    const status = t.status === "done" ? "open" : "done";
    await api.updateTodo(t.client_id, t.id, { status });
    setTodos((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x)));
    if (status === "done") toast("Erledigt.");
  };

  const open = list.filter((t) => t.status !== "done").length;
  const overdue = list.filter((t) => t.status !== "done" && dueInfo(t.due_date).cls === "due-red").length;

  return (
    <>
      <div className="hero">
        <h1>Aufgaben</h1>
        <div className="sub">Alle offenen Aufgaben über alle Kunden.</div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="v">{open}</div><div className="l">Offen</div></div>
          <div className="hero-stat"><div className="v">{overdue}</div><div className="l">Überfällig</div></div>
        </div>
      </div>

      <div className="row-inline" style={{ marginBottom: 16, alignItems: "center" }}>
        <select className="select form-light" style={{ maxWidth: 200 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Alle Zuständigen</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Erledigte zeigen
        </label>
      </div>

      <div className="section">
        {list.length === 0 ? <div className="empty">Keine Aufgaben.</div> : list.map((t) => {
          const di = dueInfo(t.due_date);
          return (
            <div key={t.id} className={`todo ${t.status === "done" ? "done" : ""}`}>
              <input className="todo-check" type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} />
              <div className="todo-body">
                <div className="todo-title">
                  {t.title}
                  {t.priority === "high" && <span className="prio prio-high" style={{ marginLeft: 8 }}>hoch</span>}
                </div>
                <div className="todo-sub">
                  <span className="link-like" style={{ cursor: "pointer", color: "var(--violet)" }}
                    onClick={() => navigate(`/clients/${t.client_id}`)}>{t.client_name}</span>
                  {t.assignee && ` · 👤 ${t.assignee}`}
                  {di.label && <> · <span className={`due-dot ${di.cls}`} /> {di.label}</>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
