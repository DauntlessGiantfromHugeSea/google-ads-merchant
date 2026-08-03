import { useEffect, useMemo, useState } from "react";
import { Doc, Project, ProjectEvent, Todo, api } from "../api";
import { useToast } from "../toast";
import Kanban from "../components/Kanban";

const fileSize = (b: number) => b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function ProjectFilesModal({ clientId, project, isAgency, onClose }:
  { clientId: string; project: Project; isAgency: boolean; onClose: () => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => api.projectFiles(clientId, project.id).then(setFiles).catch(() => {});
  useEffect(() => { load(); }, [project.id]);
  const upload = async (f: File) => {
    setBusy(true);
    try { await api.uploadProjectFile(clientId, project.id, f); load(); toast("Datei angehängt."); }
    catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  const del = async (fid: string) => { if (!confirm("Datei löschen?")) return; await api.deleteProjectFile(clientId, project.id, fid); load(); };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>📎 {project.title}</h2>
          {isAgency && (
            <label className="btn btn-primary btn-sm" style={{ cursor: "pointer" }}>{busy ? "Lädt…" : "+ Datei"}
              <input type="file" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} /></label>
          )}
        </div>
        <div className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>Angehängte Dateien – für den Kunden herunterladbar.</div>
        {files.length === 0 ? <div className="empty sm">Noch keine Dateien.</div> : files.map((f) => (
          <div key={f.id} className="list-row">
            <div style={{ minWidth: 0 }}>
              <strong className="ellip">{f.filename}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{fileSize(f.size)} · {new Date(f.created_at).toLocaleDateString("de-DE")}</div>
            </div>
            <div className="row-inline" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => api.downloadProjectFile(clientId, project.id, f.id, f.filename).catch((e) => toast((e as Error).message, "err"))}>laden</button>
              {isAgency && <button className="del" onClick={() => del(f.id)}>×</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TYPES = ["design", "marketing", "web", "seo", "social", "sonstiges"];
const num = (v: string) => parseFloat(v.replace(",", ".")) || 0;
const EV_ICON: Record<string, string> = { created: "✨", status: "🔄", edit: "✏️", note: "🗒️", decision: "✅" };

function ProjectChronik({ clientId, projectId, isAgency }: { clientId: string; projectId: string; isAgency: boolean }) {
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("decision");
  const load = () => api.projectEvents(clientId, projectId).then(setEvents).catch(() => {});
  useEffect(() => { load(); }, [projectId]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim()) return;
    await api.addProjectEvent(clientId, projectId, { text: text.trim(), kind });
    setText(""); load();
  };
  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Projektchronik</h3>
      {isAgency && (
        <form className="row-inline" style={{ marginBottom: 10 }} onSubmit={add}>
          <select className="select form-light" style={{ maxWidth: 140 }} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="decision">Entscheidung</option><option value="note">Notiz</option>
          </select>
          <input className="input form-light" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Entscheidung oder Notiz festhalten…" />
          <button className="btn btn-primary btn-sm">Eintragen</button>
        </form>
      )}
      {events.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Noch keine Einträge.</div> : (
        <div className="timeline">
          {events.map((ev) => (
            <div key={ev.id} className={`tl-item ${ev.kind === "decision" ? "message" : ""}`}>
              <div style={{ fontSize: 13 }}>{EV_ICON[ev.kind] || "•"} {ev.text}</div>
              <div className="tl-meta">{ev.actor} · {new Date(ev.created_at).toLocaleString("de-DE")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Projects({ clientId, isAgency, onCount }:
  { clientId: string; isAgency: boolean; onCount?: (open: number) => void }) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("design");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [hours, setHours] = useState("");
  const [edit, setEdit] = useState<Project | null>(null);
  const [filesFor, setFilesFor] = useState<Project | null>(null);

  const load = () => api.projects(clientId).then((p) => {
    setProjects(p);
    onCount?.(p.filter((x) => x.status !== "done").length);
  }).catch(() => {});
  useEffect(() => {
    load();
    api.todos(clientId).then(setTodos).catch(() => {});
  }, [clientId]);

  const todoCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of todos) if (t.project_id && t.status !== "done") m[t.project_id] = (m[t.project_id] || 0) + 1;
    return m;
  }, [todos]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createProject(clientId, { title, type, assignee, due_date: due, brief, budget: num(budget), hours_quota: num(hours) });
      setTitle(""); setAssignee(""); setDue(""); setBrief(""); setBudget(""); setHours(""); setShow(false); load(); toast("Projekt angelegt.");
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    try {
      await api.updateProject(clientId, edit.id, {
        title: edit.title, type: edit.type, assignee: edit.assignee, due_date: edit.due_date,
        brief: edit.brief, budget: edit.budget, hours_quota: edit.hours_quota,
      });
      setEdit(null); load(); toast("Projekt gespeichert.");
    } catch (err) { toast((err as Error).message, "err"); }
  };
  const move = async (p: Project, status: string) => {
    await api.updateProject(clientId, p.id, { status });
    setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, status } : x)));
  };
  const del = async (p: Project) => {
    if (!confirm(`Projekt „${p.title}“ löschen?`)) return;
    await api.deleteProject(clientId, p.id); load(); toast("Projekt gelöscht.");
  };

  const editField = (patch: Partial<Project>) => setEdit((p) => (p ? { ...p, ...patch } : p));

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Projekte</h2>
        {isAgency && <button className="btn btn-primary btn-sm" onClick={() => setShow((s) => !s)}>{show ? "Abbrechen" : "+ Projekt"}</button>}
      </div>
      {show && (
        <form className="form-light" style={{ margin: "10px 0 16px" }} onSubmit={create}>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Titel</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="z.B. Logo Redesign" /></div>
            <div className="field"><label>Typ</label>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field"><label>Verantwortlich</label>
              <input className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} /></div>
            <div className="field"><label>Fällig</label>
              <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div className="field" style={{ width: 110 }}><label>Budget €</label>
              <input className="input" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" /></div>
            <div className="field" style={{ width: 110 }}><label>Stunden</label>
              <input className="input" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" /></div>
          </div>
          <div className="field"><label>Briefing / Projektziel</label>
            <textarea className="input" value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} placeholder="Ziel, Zielgruppe, Rahmen …" /></div>
          <button className="btn btn-primary">Anlegen</button>
        </form>
      )}

      {edit && (
        <form className="form-light" style={{ margin: "10px 0 16px", border: "1px solid var(--glass-border)", borderRadius: 12, padding: 12 }} onSubmit={saveEdit}>
          <div className="row-inline" style={{ justifyContent: "space-between" }}>
            <strong>Projekt bearbeiten</strong>
            <button type="button" className="del" onClick={() => setEdit(null)}>abbrechen</button>
          </div>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Titel</label>
              <input className="input" value={edit.title} onChange={(e) => editField({ title: e.target.value })} required /></div>
            <div className="field"><label>Typ</label>
              <select className="select" value={edit.type} onChange={(e) => editField({ type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div className="field"><label>Verantwortlich</label>
              <input className="input" value={edit.assignee} onChange={(e) => editField({ assignee: e.target.value })} /></div>
            <div className="field"><label>Fällig</label>
              <input className="input" type="date" value={edit.due_date} onChange={(e) => editField({ due_date: e.target.value })} /></div>
            <div className="field" style={{ width: 110 }}><label>Budget €</label>
              <input className="input" value={edit.budget || ""} onChange={(e) => editField({ budget: num(e.target.value) })} /></div>
            <div className="field" style={{ width: 110 }}><label>Stunden</label>
              <input className="input" value={edit.hours_quota || ""} onChange={(e) => editField({ hours_quota: num(e.target.value) })} /></div>
          </div>
          <div className="field"><label>Briefing / Projektziel</label>
            <textarea className="input" value={edit.brief} onChange={(e) => editField({ brief: e.target.value })} rows={3} /></div>
          <button className="btn btn-primary">Speichern</button>
          <ProjectChronik clientId={clientId} projectId={edit.id} isAgency={isAgency} />
        </form>
      )}

      {projects.length === 0
        ? <div className="empty">Noch keine Projekte.</div>
        : <Kanban projects={projects} canEdit={isAgency} onMove={move} onDelete={del}
            onEdit={isAgency ? (p) => setEdit(p) : undefined} onFiles={(p) => setFilesFor(p)} todoCounts={todoCounts} />}

      {filesFor && <ProjectFilesModal clientId={clientId} project={filesFor} isAgency={isAgency} onClose={() => setFilesFor(null)} />}
    </div>
  );
}
