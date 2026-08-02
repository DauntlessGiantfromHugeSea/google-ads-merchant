import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Client, Project, TimeEntry, api } from "../api";
import { useToast } from "../toast";

const two = (n: number) => String(n).padStart(2, "0");
const clock = (sec: number) => `${two(Math.floor(sec / 3600))}:${two(Math.floor((sec % 3600) / 60))}:${two(sec % 60)}`;
const human = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${two(m)} min` : `${m} min`;
};
const decH = (sec: number) => (sec / 3600).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const monthOf = (iso: string) => iso.slice(0, 7);
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  const n = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  return `${n[Number(m)] || m} ${y}`;
};

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
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [edit, setEdit] = useState<TimeEntry | null>(null);
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
    try {
      const r = await api.startTimer({ client_id: client || null, project_id: project || null, description: desc });
      setRunning(r); setDesc(""); load();
    } catch (e) { toast((e as Error).message, "err"); }
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

  // Verlauf nach Tag
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

  // Abrechnung: Monat -> Kunde -> Projekt (billable)
  const months = useMemo(() => Array.from(new Set(done.map((e) => monthOf(e.started_at)))).sort().reverse(), [done]);
  const billing = useMemo(() => {
    const inMonth = done.filter((e) => monthOf(e.started_at) === month);
    const byClient: Record<string, { name: string; total: number; projects: Record<string, { title: string; sec: number }> }> = {};
    inMonth.forEach((e) => {
      const ck = e.client_id || "_";
      const c = (byClient[ck] ||= { name: e.client_name || "ohne Kunde", total: 0, projects: {} });
      c.total += e.billable_seconds;
      const pk = e.project_id || "_";
      const p = (c.projects[pk] ||= { title: e.project_title || "ohne Projekt", sec: 0 });
      p.sec += e.billable_seconds;
    });
    const grand = inMonth.reduce((a, e) => a + e.billable_seconds, 0);
    return { rows: Object.values(byClient).sort((a, b) => b.total - a.total), grand };
  }, [done, month]);

  return (
    <>
      <div className="page-head">
        <h1>Zeiterfassung</h1>
        <span className="muted" style={{ fontSize: 13 }}>Heute: <strong style={{ color: "var(--ink)" }}>{human(todayTotal)}</strong></span>
      </div>

      {/* Stoppuhr */}
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
              <select className="select form-light" style={{ maxWidth: 180 }} value={client}
                onChange={(e) => { setClient(e.target.value); setProject(""); }}>
                <option value="">ohne Kunde</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="select form-light" style={{ maxWidth: 180 }} value={project}
                onChange={(e) => setProject(e.target.value)} disabled={!client}>
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

      {/* Umschalter */}
      <div className="row-inline" style={{ gap: 8, marginBottom: 14 }}>
        <button className={`btn btn-sm ${view === "verlauf" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("verlauf")}>Verlauf</button>
        <button className={`btn btn-sm ${view === "abrechnung" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("abrechnung")}>Abrechnung (15-Min-Takt)</button>
      </div>

      {view === "verlauf" ? (
        dayGroups.length === 0 ? <div className="empty">Noch keine Zeiten erfasst.</div> : dayGroups.map((g) => (
          <div key={g.key} className="section">
            <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ fontSize: 16, margin: 0, textTransform: "capitalize" }}>{g.key}</h2>
              <span className="muted" style={{ fontSize: 13 }}>{human(g.total)} · <span title="abrechenbar">abr. {human(g.bill)}</span></span>
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
        ))
      ) : (
        <div className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <select className="select form-light" style={{ maxWidth: 220 }} value={month} onChange={(e) => setMonth(e.target.value)}>
              {(months.includes(month) ? months : [month, ...months]).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <div style={{ textAlign: "right" }}>
              <div className="muted" style={{ fontSize: 12 }}>Abrechenbar gesamt</div>
              <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 700 }}>{decH(billing.grand)} h <span className="muted" style={{ fontSize: 13 }}>({human(billing.grand)})</span></div>
            </div>
          </div>
          {billing.rows.length === 0 ? <div className="empty sm">Keine Zeiten in diesem Monat.</div> : (
            <table className="inv-table">
              <thead><tr><th>Kunde / Projekt</th><th style={{ textAlign: "right" }}>Stunden</th><th style={{ textAlign: "right" }}>abrechenbar</th></tr></thead>
              <tbody>
                {billing.rows.map((c) => (
                  <Fragment key={c.name}>
                    <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                      <td><strong>{c.name}</strong></td>
                      <td style={{ textAlign: "right" }}><strong>{decH(c.total)} h</strong></td>
                      <td style={{ textAlign: "right" }}><strong>{human(c.total)}</strong></td>
                    </tr>
                    {Object.values(c.projects).sort((a, b) => b.sec - a.sec).map((p, i) => (
                      <tr key={c.name + i}>
                        <td style={{ paddingLeft: 24 }} className="muted">↳ {p.title}</td>
                        <td style={{ textAlign: "right" }} className="muted">{decH(p.sec)} h</td>
                        <td style={{ textAlign: "right" }} className="muted">{human(p.sec)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Jeder Eintrag wird auf volle 15 Minuten aufgerundet.</div>
        </div>
      )}

      {edit && (
        <EditEntry entry={edit} clients={clients} projectsFor={projectsFor} onClose={() => setEdit(null)} onSave={saveEdit} />
      )}
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
