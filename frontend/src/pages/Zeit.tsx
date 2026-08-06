import { useEffect, useMemo, useRef, useState } from "react";
import { Client, Project, TimeEntry, api } from "../api";
import { useToast } from "../toast";
import { human } from "../lib/timeBilling";
import BillingTable from "../sections/BillingTable";

const two = (n: number) => String(n).padStart(2, "0");
const clock = (sec: number) => `${two(Math.floor(sec / 3600))}:${two(Math.floor((sec % 3600) / 60))}:${two(sec % 60)}`;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export default function Zeit() {
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [now, setNow] = useState(Date.now());
  const [desc, setDesc] = useState("");
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [manual, setManual] = useState(false);
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mMin, setMMin] = useState("");
  const [view, setView] = useState<"verlauf" | "abrechnung">("verlauf");
  const [edit, setEdit] = useState<TimeEntry | null>(null);
  const [ws, setWs] = useState(false);
  const [wsClient, setWsClient] = useState("");
  const [wsProject, setWsProject] = useState("");
  const [wsTitle, setWsTitle] = useState("");
  const tick = useRef<number | null>(null);

  const load = () => {
    api.timeEntries().then(setEntries).catch(() => {});
    api.runningTime().then(setRunning).catch(() => {});
  };
  useEffect(() => {
    api.clients().then((c) => setClients(c.filter((x) => !x.archived))).catch(() => {});
    api.allProjects().then(setProjects).catch(() => {});
    load();
  }, []);
  useEffect(() => {
    if (running) tick.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [running]);

  const projectsFor = (cid: string) => projects.filter((p) => p.client_id === cid);
  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.started_at).getTime()) / 1000)) : 0;

  const start = async () => {
    try { const r = await api.startTimer({ client_id: client || null, project_id: project || null, description: desc }); setRunning(r); setDesc(""); load(); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const stop = async () => {
    if (!running) return;
    try { await api.stopTimer(running.id); setRunning(null); load(); toast("Zeit gespeichert."); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const addManual = async () => {
    const mins = parseInt(mMin, 10);
    if (!mins || mins <= 0) { toast("Bitte Minuten angeben.", "err"); return; }
    try {
      await api.addManualTime({ client_id: client || null, project_id: project || null, description: desc, date: mDate, minutes: mins });
      setMMin(""); setDesc(""); setManual(false); load(); toast("Eintrag hinzugefügt.");
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const del = async (e: TimeEntry) => { if (!confirm("Eintrag löschen?")) return; await api.deleteTime(e.id); load(); };
  const saveEdit = async (patch: { client_id: string | null; project_id: string | null; description: string; minutes: number; date: string }) => {
    if (!edit) return;
    try { await api.updateTime(edit.id, patch); setEdit(null); load(); toast("Gespeichert."); }
    catch (e) { toast((e as Error).message, "err"); }
  };

  const done = useMemo(() => entries.filter((e) => !e.running), [entries]);
  const dayGroups = useMemo(() => {
    const g: { key: string; items: TimeEntry[]; total: number; bill: number }[] = [];
    done.forEach((e) => {
      const k = dayKey(e.started_at);
      let grp = g.find((x) => x.key === k);
      if (!grp) { grp = { key: k, items: [], total: 0, bill: 0 }; g.push(grp); }
      grp.items.push(e); grp.total += e.duration_seconds; grp.bill += e.billable_seconds;
    });
    return g;
  }, [done]);
  const todayTotal = (dayGroups.find((g) => g.key === dayKey(new Date().toISOString()))?.total || 0) + elapsed;

  return (
    <>
      <div className="page-head">
        <h1>Zeiterfassung</h1>
        <div className="row-inline" style={{ alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setWs(true)}>🖨 Arbeitsprotokoll</button>
          <span className="muted" style={{ fontSize: 13 }}>Heute: <strong style={{ color: "var(--ink)" }}>{human(todayTotal)}</strong></span>
        </div>
      </div>

      {ws && (
        <div className="modal-backdrop" onClick={() => setWs(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>🖨 Web-Arbeitsprotokoll</h2>
            <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>Druckbares PDF mit Platz für Farbcodes, CSS-Klassen, Doku. Kunde/Projekt optional vorausfüllen.</p>
            <div className="field"><label>Titel (optional)</label>
              <input className="input form-light" value={wsTitle} onChange={(e) => setWsTitle(e.target.value)} placeholder="Web-Arbeitsprotokoll" /></div>
            <div className="row-inline">
              <div className="field" style={{ flex: 1 }}><label>Kunde</label>
                <select className="select form-light" value={wsClient} onChange={(e) => { setWsClient(e.target.value); setWsProject(""); }}>
                  <option value="">— leer —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div className="field" style={{ flex: 1 }}><label>Projekt</label>
                <select className="select form-light" value={wsProject} onChange={(e) => setWsProject(e.target.value)} disabled={!wsClient}>
                  <option value="">— leer —</option>
                  {projectsFor(wsClient).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select></div>
            </div>
            <div className="row-inline" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => setWs(false)}>Schließen</button>
              <button className="btn btn-primary" onClick={() => api.downloadWorksheet({ client: wsClient, project: wsProject, title: wsTitle }).then(() => setWs(false)).catch((e) => toast((e as Error).message, "err"))}>PDF erzeugen</button>
            </div>
          </div>
        </div>
      )}

      <div className="section timer-card">
        {running ? (
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div className="timer-clock">{clock(elapsed)}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {running.client_name || "ohne Kunde"}{running.project_title ? ` › ${running.project_title}` : ""}{running.description ? ` · ${running.description}` : ""}
              </div>
            </div>
            <button className="btn btn-primary" onClick={stop} style={{ background: "#ef4444" }}>■ Stopp</button>
          </div>
        ) : (
          <>
            <div className="row-inline" style={{ gap: 10, flexWrap: "wrap" }}>
              <input className="input form-light" style={{ flex: 2, minWidth: 180 }} placeholder="Woran arbeitest du?"
                value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} />
              <select className="select form-light" style={{ maxWidth: 180 }} value={client} onChange={(e) => { setClient(e.target.value); setProject(""); }}>
                <option value="">ohne Kunde</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="select form-light" style={{ maxWidth: 180 }} value={project} onChange={(e) => setProject(e.target.value)} disabled={!client}>
                <option value="">{client ? "ohne Projekt" : "— Kunde wählen —"}</option>
                {projectsFor(client).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <button className="btn btn-primary" onClick={start}>▶ Start</button>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setManual((m) => !m)}>
              {manual ? "Abbrechen" : "＋ Zeit nachtragen"}
            </button>
            {manual && (
              <div className="row-inline form-light" style={{ marginTop: 8, gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ maxWidth: 160 }}><label>Datum</label>
                  <input className="input" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} /></div>
                <div className="field" style={{ maxWidth: 120 }}><label>Minuten</label>
                  <input className="input" type="number" min="1" step="15" value={mMin} onChange={(e) => setMMin(e.target.value)} /></div>
                <button className="btn btn-primary" onClick={addManual}>Hinzufügen</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="row-inline" style={{ gap: 8, marginBottom: 14 }}>
        <button className={`btn btn-sm ${view === "verlauf" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("verlauf")}>Verlauf</button>
        <button className={`btn btn-sm ${view === "abrechnung" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("abrechnung")}>Abrechnung</button>
      </div>

      {view === "abrechnung" ? (
        <BillingTable entries={done} clients={clients} projects={projects} filenameBase="Zeiten" />
      ) : dayGroups.length === 0 ? (
        <div className="empty">Noch keine Zeiten erfasst.</div>
      ) : dayGroups.map((g) => (
        <div key={g.key} className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, margin: 0, textTransform: "capitalize" }}>{g.key}</h2>
            <span className="muted" style={{ fontSize: 13 }}>{human(g.total)} · abr. {human(g.bill)}</span>
          </div>
          {g.items.map((e) => (
            <div key={e.id} className="list-row">
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", minWidth: 0 }}>
                <span className="time-dur">{human(e.duration_seconds)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="ellip">{e.description || <span className="muted">— ohne Beschreibung —</span>}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {e.client_name || "ohne Kunde"}{e.project_title ? ` › ${e.project_title}` : ""} · {hhmm(e.started_at)}{e.ended_at ? `–${hhmm(e.ended_at)}` : ""}
                  </div>
                </div>
              </div>
              <div className="row-inline" style={{ gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit(e)}>bearbeiten</button>
                <button className="del" onClick={() => del(e)}>×</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {edit && <EditEntry entry={edit} clients={clients} projectsFor={projectsFor} onClose={() => setEdit(null)} onSave={saveEdit} />}
    </>
  );
}

function EditEntry({ entry, clients, projectsFor, onClose, onSave }: {
  entry: TimeEntry; clients: Client[]; projectsFor: (cid: string) => Project[];
  onClose: () => void; onSave: (p: { client_id: string | null; project_id: string | null; description: string; minutes: number; date: string }) => void;
}) {
  const [client, setClient] = useState(entry.client_id || "");
  const [project, setProject] = useState(entry.project_id || "");
  const [desc, setDesc] = useState(entry.description);
  const [min, setMin] = useState(String(Math.round(entry.duration_seconds / 60)));
  const [date, setDate] = useState(entry.started_at.slice(0, 10));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Zeit bearbeiten</h2>
        <div className="field"><label>Beschreibung</label>
          <input className="input form-light" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div className="row-inline">
          <div className="field" style={{ flex: 1 }}><label>Datum</label>
            <input className="input form-light" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field" style={{ maxWidth: 120 }}><label>Minuten</label>
            <input className="input form-light" type="number" min="0" step="15" value={min} onChange={(e) => setMin(e.target.value)} /></div>
        </div>
        <div className="row-inline">
          <div className="field" style={{ flex: 1 }}><label>Kunde</label>
            <select className="select form-light" value={client} onChange={(e) => { setClient(e.target.value); setProject(""); }}>
              <option value="">ohne Kunde</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field" style={{ flex: 1 }}><label>Projekt</label>
            <select className="select form-light" value={project} onChange={(e) => setProject(e.target.value)} disabled={!client}>
              <option value="">ohne Projekt</option>
              {projectsFor(client).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select></div>
        </div>
        <div className="row-inline" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={() => onSave({ client_id: client || null, project_id: project || null, description: desc, minutes: parseInt(min, 10) || 0, date })}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
