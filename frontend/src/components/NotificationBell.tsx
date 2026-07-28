import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Notification, api } from "../api";

const ICON: Record<string, string> = {
  message: "💬", task_assigned: "✅", approval_requested: "📝", approval_responded: "👍", info: "🔔",
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  return `vor ${Math.floor(s / 86400)} T.`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const timer = useRef<number | null>(null);

  const poll = () => api.notificationsUnread().then((r) => setCount(r.count)).catch(() => {});
  useEffect(() => {
    poll();
    timer.current = window.setInterval(poll, 60000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) { try { setItems(await api.notifications()); } catch { /* ignore */ } }
  };
  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read) { api.notificationRead(n.id).catch(() => {}); setCount((c) => Math.max(0, c - 1)); }
    if (n.link) navigate(n.link);
  };
  const markAll = async () => {
    await api.notificationsReadAll().catch(() => {});
    setCount(0);
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
  };

  return (
    <div className="notif">
      <button className="notif-btn" onClick={toggle} aria-label="Benachrichtigungen">
        🔔{count > 0 && <span className="notif-badge">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <>
          <div className="user-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-head">
              <strong>Benachrichtigungen</strong>
              {items.some((x) => !x.read) && <button className="link-btn" onClick={markAll}>Alle gelesen</button>}
            </div>
            {items.length === 0 ? (
              <div className="muted" style={{ padding: "18px 12px", textAlign: "center", fontSize: 13 }}>Nichts Neues.</div>
            ) : items.map((n) => (
              <button key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}>
                <span className="notif-ic">{ICON[n.type] || ICON.info}</span>
                <span className="notif-body">
                  <span className="notif-title">{n.title}</span>
                  {n.body && <span className="notif-sub">{n.body}</span>}
                  <span className="notif-time">{ago(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
