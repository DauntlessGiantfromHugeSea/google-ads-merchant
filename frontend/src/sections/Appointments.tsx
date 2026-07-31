import { useEffect, useMemo, useState } from "react";
import { Appointment, User, api } from "../api";
import { useToast } from "../toast";

const fmt = (s: string) => { try { return new Date(s).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }); } catch { return s; } };

export default function Appointments({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [list, setList] = useState<Appointment[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [defLink, setDefLink] = useState("");
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [proto, setProto] = useState<Record<string, string>>({});

  const load = () => api.appointments(clientId).then(setList).catch(() => {});
  useEffect(() => {
    load();
    if (isAgency) {
      api.team().then(setTeam).catch(() => {});
      api.getAgencyContact().then((a) => setDefLink(a.meeting_link || "")).catch(() => {});
    }
  }, [clientId]);

  const toggleAssignee = (id: string) => setAssignees((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !when) { toast("Titel und Zeitpunkt nötig.", "err"); return; }
    await api.createAppointment(clientId, { title, starts_at: when, link, note, assignees });
    setTitle(""); setWhen(""); setLink(""); setNote(""); setAssignees([]); setShow(false); load();
    toast("Termin gebucht – Benachrichtigungen gesendet.");
  };
  const saveProto = async (a: Appointment) => {
    await api.updateAppointment(clientId, a.id, { protocol: proto[a.id] ?? a.protocol }); load(); toast("Protokoll gespeichert.");
  };
  const del = async (a: Appointment) => { if (!confirm("Termin löschen?")) return; await api.deleteAppointment(clientId, a.id); load(); };

  const now = useMemo(() => new Date().toISOString().slice(0, 16), []);

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Termine</h2>
        {isAgency && <button className="btn btn-primary btn-sm" onClick={() => { setShow((s) => !s); if (!show && !link) setLink(defLink); }}>{show ? "Abbrechen" : "+ Termin"}</button>}
      </div>

      {show && isAgency && (
        <form className="form-light" style={{ margin: "12px 0 16px" }} onSubmit={create}>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Titel</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Kickoff-Call" required /></div>
            <div className="field"><label>Datum & Uhrzeit</label>
              <input className="input" type="datetime-local" min={now} value={when} onChange={(e) => setWhen(e.target.value)} required /></div>
          </div>
          <div className="field"><label>Link (Zoom/Meet/…)</label>
            <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder={defLink || "https://…"} /></div>
          <div className="field"><label>Teilnehmende Mitarbeiter (werden benachrichtigt)</label>
            <div className="row-inline" style={{ gap: 12, flexWrap: "wrap" }}>
              {team.map((m) => (
                <label key={m.id} className="muted" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={assignees.includes(m.id)} onChange={() => toggleAssignee(m.id)} /> {m.full_name || m.email}
                </label>
              ))}
              {team.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Keine Mitarbeiter im Team.</span>}
            </div>
          </div>
          <div className="field"><label>Notiz (optional)</label>
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          <p className="muted" style={{ fontSize: 12 }}>Kunde, ausgewählte Mitarbeiter und du bekommen „Ein Termin wurde für dich gebucht" (Glocke + E-Mail); der Termin erscheint im Kalender und im Verlauf.</p>
          <button className="btn btn-primary">Termin buchen</button>
        </form>
      )}

      {list.length === 0 ? <div className="empty">Noch keine Termine.</div> : list.map((a) => (
        <div key={a.id} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
          <div className="list-row" style={{ border: "none", padding: 0, alignItems: "flex-start" }}>
            <div>
              <strong>{a.title}</strong> <span className="muted">· {fmt(a.starts_at)}</span>
              <div className="muted" style={{ fontSize: 12 }}>
                {a.assignee_names.length > 0 && `👥 ${a.assignee_names.join(", ")}`}
                {a.link && <> · <a className="switch-link" href={a.link} target="_blank" rel="noreferrer">Link öffnen</a></>}
              </div>
              {a.note && <div className="muted" style={{ fontSize: 12, whiteSpace: "pre-line" }}>{a.note}</div>}
            </div>
            {isAgency && <button className="del" onClick={() => del(a)}>löschen</button>}
          </div>
          {isAgency && (
            <div style={{ marginTop: 8 }}>
              <label className="muted" style={{ fontSize: 12 }}>Protokoll</label>
              <textarea className="input form-light" rows={3} value={proto[a.id] ?? a.protocol}
                onChange={(e) => setProto((p) => ({ ...p, [a.id]: e.target.value }))} placeholder="Was wurde besprochen / entschieden …" />
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => saveProto(a)}>Protokoll speichern</button>
            </div>
          )}
          {!isAgency && a.protocol && (
            <div className="card" style={{ marginTop: 8, boxShadow: "none", fontSize: 13, whiteSpace: "pre-line" }}>
              <strong>Protokoll</strong><br />{a.protocol}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
