import { useEffect, useState } from "react";
import { api } from "../api";
import Calendar, { WorkItem } from "../components/Calendar";

/** Kompakter Kalender für einen einzelnen Kunden (Projekte + To-Dos mit Termin). */
export default function WorkCalendar({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [items, setItems] = useState<WorkItem[]>([]);

  useEffect(() => {
    let done = false;
    Promise.all([api.projects(clientId), api.todos(clientId)]).then(([projects, todos]) => {
      if (done) return;
      const p: WorkItem[] = projects.map((x) => ({
        id: x.id, kind: "project", title: x.title, clientId, clientName,
        status: x.status, dueDate: x.due_date || "", assignee: x.assignee || "", priority: "normal", type: x.type,
      }));
      const t: WorkItem[] = todos.map((x) => ({
        id: x.id, kind: "todo", title: x.title, clientId, clientName,
        status: x.status, dueDate: x.due_date || "", assignee: x.assignee || "", priority: x.priority || "normal", type: "",
      }));
      setItems([...p, ...t]);
    }).catch(() => {});
    return () => { done = true; };
  }, [clientId]);

  const withDates = items.filter((i) => i.dueDate).length;

  return (
    <div className="section">
      <h2>Kalender</h2>
      {withDates === 0
        ? <div className="empty">Noch keine Termine. Setze bei Projekten oder To-Dos ein Fälligkeitsdatum.</div>
        : <Calendar items={items} onOpen={() => {}} />}
    </div>
  );
}
