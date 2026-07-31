import { useMemo, useState } from "react";

export interface WorkItem {
  id: string;
  kind: "project" | "todo" | "appointment";
  title: string;
  clientId: string;
  clientName: string;
  status: string;
  dueDate: string;   // "YYYY-MM-DD" oder ""
  assignee: string;
  priority: string;  // nur To-Dos: low/normal/high
  type: string;      // nur Projekte: design/web/…
  projectTitle?: string;
}

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];
const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const isDone = (i: WorkItem) => i.status === "done";

/** Minimalistische Fälligkeits-Klasse: rot=überfällig, gelb=heute, grün=erledigt, sonst neutral. */
function chipClass(i: WorkItem, todayStr: string): string {
  if (isDone(i)) return "done";
  if (i.dueDate && i.dueDate < todayStr) return "overdue";
  if (i.dueDate === todayStr) return "today";
  return "";
}

export default function Calendar({ items, onOpen }: { items: WorkItem[]; onOpen: (i: WorkItem) => void }) {
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const todayStr = ymd(new Date());

  const byDay = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    for (const it of items) {
      if (!it.dueDate) continue;
      (map[it.dueDate] ||= []).push(it);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || a.title.localeCompare(b.title));
    }
    return map;
  }, [items]);

  const first = new Date(cur.y, cur.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cur.y, cur.m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = () => setCur((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCur((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const goToday = () => { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }); };

  return (
    <>
      <div className="cal-head">
        <div className="cal-title">{MONTHS[cur.m]} {cur.y}</div>
        <div className="row-inline" style={{ alignItems: "center", gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={prev} aria-label="Vorheriger Monat">‹</button>
          <button className="btn btn-ghost btn-sm" onClick={goToday}>Heute</button>
          <button className="btn btn-ghost btn-sm" onClick={next} aria-label="Nächster Monat">›</button>
        </div>
      </div>

      <div className="cal-dow">{DOW.map((d) => <span key={d}>{d}</span>)}</div>

      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="cal-cell empty" />;
          const key = ymd(d);
          const dayItems = byDay[key] || [];
          const shown = dayItems.slice(0, 2);
          const extra = dayItems.length - shown.length;
          return (
            <div key={key} className={`cal-cell ${key === todayStr ? "today" : ""}`}>
              <div className="cal-daynum">{d.getDate()}</div>
              {shown.map((it) => (
                <button key={it.kind + it.id} className={`cal-item ci-${chipClass(it, todayStr) || "plain"}`}
                  title={`${it.title} · ${it.clientName}`} onClick={() => onOpen(it)}>
                  <span className="ci-dot" />{it.title}
                </button>
              ))}
              {extra > 0 && <div className="cal-more">+{extra}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
