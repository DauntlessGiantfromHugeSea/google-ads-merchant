import { useEffect, useState } from "react";
import { Todo, api } from "../api";

export default function Todos({ clientId, isAgency, onCount }:
  { clientId: string; isAgency: boolean; onCount?: (open: number) => void }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const load = () => api.todos(clientId).then((t) => {
    setTodos(t);
    onCount?.(t.filter((x) => x.status !== "done").length);
  }).catch(() => {});
  useEffect(() => { load(); }, [clientId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createTodo(clientId, { title, due_date: due });
    setTitle(""); setDue(""); load();
  };
  const toggle = async (t: Todo) => {
    await api.updateTodo(clientId, t.id, { status: t.status === "done" ? "open" : "done" });
    load();
  };
  const del = async (t: Todo) => { await api.deleteTodo(clientId, t.id); load(); };

  return (
    <div className="section">
      <h2>To-Dos</h2>
      {isAgency && (
        <form className="row-inline" style={{ marginBottom: 12 }} onSubmit={add}>
          <div className="field" style={{ flex: 2 }}><label>Aufgabe</label>
            <input className="input form-light" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was ist zu tun?" /></div>
          <div className="field"><label>Fällig</label>
            <input className="input form-light" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <button className="btn btn-primary">Hinzufügen</button>
        </form>
      )}
      {todos.length === 0 ? <div className="empty">Keine offenen Aufgaben.</div> : todos.map((t) => (
        <div key={t.id} className={`todo ${t.status === "done" ? "done" : ""}`}>
          <input className="todo-check" type="checkbox" checked={t.status === "done"}
            disabled={!isAgency} onChange={() => toggle(t)} />
          <div className="todo-body">
            <div className="todo-title">{t.title}</div>
            {(t.due_date || t.description) && (
              <div className="todo-sub">{t.due_date && `fällig ${t.due_date}`}{t.description && ` · ${t.description}`}</div>
            )}
          </div>
          {isAgency && <button className="del" onClick={() => del(t)}>löschen</button>}
        </div>
      ))}
    </div>
  );
}
