import { useEffect, useState } from "react";
import { api } from "../api";
import Calendar, { WorkItem } from "../components/Calendar";

/** Kompakter Kalender für einen einzelnen Kunden (Projekte + To-Dos mit Termin). */
export default function WorkCalendar({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [items, setItems] = useState<WorkItem[]>([]);

  useEffect(() => {
    let done = false;
    Promise.all([api.projects(clientId), api.todos(clientId), api.appointments(clientId).catch(() => [])])
      .then(([projects, todos, appts]) => {
      if (done) return;
      const p: WorkItem[] = projects.map((x) => ({
        id: x.id, kind: "project", title: x.title, clientId, clientName,
        status: x.status, dueDate: x.due_date || "", assignee: x.assignee || "", priority: "normal", type: x.type,
      }));
      const t: WorkItem[] = todos.map((x) => ({
        id: x.id, kind: "todo", title: x.title, clientId, clientName,
        status: x.status, dueDate: x.due_date || "", assignee: x.assignee || "", priority: x.priority || "normal", type: "",
      }));
      const a: WorkItem[] = (appts || []).map((x) => ({
        id: x.id, kind: "appointment", title: `📅 ${x.title}`, clientId, clientName,
        status: "", dueDate: (x.starts_at || "").slice(0, 10), assignee: x.assignee_names.join(", "), priority: "normal", type: "",
      }));
      setItems([...p, ...t, ...a]);
    }).catch(() => {});
    return () => { done = true; };
  }, [clientId]);

  const withDates = items.filter((i) => i.dueDate).length;

  return (
    <div className="section">
      <h2>Kalender</h2>
      {withDates === 0
        ? <div className="empty">Noch keine Termine. Setze bei Projekten/To-Dos ein Datum oder buche einen Termin.</div>
        : <Calendar items={items} onOpen={() => {}} />}
    </div>
  );
}
