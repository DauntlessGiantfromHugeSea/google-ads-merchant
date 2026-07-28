import { useRef, useState } from "react";
import { Project } from "../api";

const COLS = [
  { key: "backlog", label: "Backlog" },
  { key: "in_progress", label: "In Arbeit" },
  { key: "review", label: "Review" },
  { key: "done", label: "Fertig" },
];
const TYPES: Record<string, string> = {
  design: "Design", marketing: "Marketing", web: "Web", seo: "SEO", social: "Social", sonstiges: "Sonstiges",
};

export default function Kanban({ projects, onMove, onDelete, onOpenClient, canEdit, todoCounts }: {
  projects: Project[];
  onMove?: (p: Project, status: string) => void;
  onDelete?: (p: Project) => void;
  onOpenClient?: (clientId: string) => void;
  canEdit: boolean;
  todoCounts?: Record<string, number>;
}) {
  const dragged = useRef<Project | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="kanban">
      {COLS.map((col, ci) => {
        const items = projects.filter((p) => (p.status || "backlog") === col.key);
        const drop = (e: React.DragEvent) => {
          e.preventDefault(); setOver(null);
          const p = dragged.current;
          if (p && onMove && p.status !== col.key) onMove(p, col.key);
          dragged.current = null;
        };
        return (
          <div key={col.key} className={`kcol ${over === col.key ? "over" : ""}`}
            onDragOver={canEdit ? (e) => { e.preventDefault(); setOver(col.key); } : undefined}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={canEdit ? drop : undefined}>
            <h4>{col.label}<span>{items.length}</span></h4>
            {items.map((p) => (
              <div key={p.id} className="kcard" draggable={canEdit}
                onDragStart={() => { dragged.current = p; }} onDragEnd={() => { dragged.current = null; }}>
                <div className="t">{p.title}</div>
                {p.client_name && (
                  <div className="m" style={{ cursor: onOpenClient ? "pointer" : "default" }}
                    onClick={() => onOpenClient?.(p.client_id)}>{p.client_name}</div>
                )}
                <div className="m">{p.assignee || "—"}{p.due_date ? ` · bis ${p.due_date}` : ""}</div>
                <div className="row">
                  <span className={`ptype pt-${TYPES[p.type] ? p.type : "sonstiges"}`}>{TYPES[p.type] || p.type}</span>
                  {todoCounts && todoCounts[p.id] > 0 && (
                    <span className="ktodo" title="offene Aufgaben">✓ {todoCounts[p.id]}</span>
                  )}
                  {canEdit && onMove && (
                    <>
                      <button className="kmove" title="Zurück" disabled={ci === 0}
                        onClick={() => onMove(p, COLS[ci - 1].key)}>◀</button>
                      <button className="kmove" title="Weiter" disabled={ci === COLS.length - 1}
                        onClick={() => onMove(p, COLS[ci + 1].key)}>▶</button>
                    </>
                  )}
                  {canEdit && onDelete && <button className="del" onClick={() => onDelete(p)}>löschen</button>}
                </div>
              </div>
            ))}
            {items.length === 0 && <div className="muted" style={{ fontSize: 12, padding: "4px 2px" }}>Hierher ziehen</div>}
          </div>
        );
      })}
    </div>
  );
}
