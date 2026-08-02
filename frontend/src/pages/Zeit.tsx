import { useEffect, useMemo, useRef, useState } from "react";
import { Client, TimeEntry, api } from "../api";
import { useToast } from "../toast";

const two = (n: number) => String(n).padStart(2, "0");
const clock = (sec: number) => `${two(Math.floor(sec / 3600))}:${two(Math.floor((sec % 3600) / 60))}:${two(sec % 60)}`;
const human = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${two(m)} min` : `${m} min`;
};
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export default function Zeit() {
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [now, setNow] = useState(Date.now());
  const [desc, setDesc] = useState("");
  const [client, setClient] = useState("");
  const [manual, setManual] = useState(false);
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [mMin, setMMin] = useState("");
  const tick = useRef<number | null>(null);

  const load = () => {
    api.timeEntries().then(setEntries).catch(() => {});
    api.runningTime().then(setRunning).catch(() => {});
  };
  useEffect(() => { api.clients().then((c) => setClients(c.filter((x) => !x.archived))).catch(() => {}); load(); }, []);

  // Sekundentakt nur, wenn eine Stoppuhr läuft.
  useEffect(() => {
    if (running) { tick.current = window.setInterval(() => setNow(Date.now()), 1000); }
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [running]);

  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.started_at).getTime()) / 1000)) : 0;

  const start = async () => {
    try { const r = await api.startTimer({ client_id: client || null, description: desc }); setRunning(r); setDesc(""); load(); }
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
      await api.addManualTime({ client_id: client || null, description: desc, date: mDate, minutes: mins });
      setMMin(""); setDesc(""); setManual(false); load(); toast("Eintrag hinzugefügt.");
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const del = async (e: TimeEntry) => { if (!confirm("Eintrag löschen?")) return; await api.deleteTime(e.id); load(); };
  const editDesc = async (e: TimeEntry) => {
    const v = prompt("Beschreibung:", e.description); if (v == null) return;
    await api.updateTime(e.id, { description: v }); load();
  };

  const done = useMemo(() => entries.filter((e) => !e.running), [entries]);
  const groups = useMemo(() => {
    const g: { key: string; items: TimeEntry[]; total: number }[] = [];
    done.forEach((e) => {
      const k = dayKey(e.started_at);
      let grp = g.find((x) => x.key === k);
      if (!grp) { grp = { key: k, items: [], total: 0 }; g.push(grp); }
      grp.items.push(e); grp.total += e.duration_seconds;
    });
    return g;
  }, [done]);
  const todayKey = dayKey(new Date().toISOString());
  const todayTotal = groups.find((g) => g.key === todayKey)?.total || 0;

  return (
    <>
      <div className="page-head">
        <h1>Zeiterfassung</h1>
        <span className="muted" style={{ fontSize: 13 }}>Heute: <strong style={{ color: "var(--ink)" }}>{human(todayTotal + elapsed)}</strong></span>
      </div>

      {/* Stoppuhr */}
      <div className="section timer-card">
        {running ? (
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div className="timer-clock">{clock(elapsed)}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {running.client_name || "ohne Kunde"}{running.description ? ` · ${running.description}` : ""}
              </div>
            </div>
            <button className="btn btn-primary" onClick={stop} style={{ background: "#ef4444" }}>■ Stopp</button>
          </div>
        ) : (
          <>
            <div className="row-inline" style={{ gap: 10, flexWrap: "wrap" }}>
              <input className="input form-light" style={{ flex: 2, minWidth: 200 }} placeholder="Woran arbeitest du?"
                value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} />
              <select className="select form-light" style={{ maxWidth: 200 }} value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">ohne Kunde</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn btn-primary" onClick={start}>▶ Start</button>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setManual((m) => !m)}>
              {manual ? "Abbrechen" : "＋ Zeit manuell eintragen"}
            </button>
            {manual && (
              <div className="row-inline form-light" style={{ marginTop: 8, gap: 10, flexWrap: "wrap" }}>
                <div className="field" style={{ maxWidth: 160 }}><label>Datum</label>
                  <input className="input" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} /></div>
                <div className="field" style={{ maxWidth: 120 }}><label>Minuten</label>
                  <input className="input" type="number" min="1" value={mMin} onChange={(e) => setMMin(e.target.value)} /></div>
                <button className="btn btn-primary" style={{ alignSelf: "flex-end" }} onClick={addManual}>Hinzufügen</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Einträge nach Tag */}
      {groups.length === 0 ? (
        <div className="empty">Noch keine Zeiten erfasst.</div>
      ) : groups.map((g) => (
        <div key={g.key} className="section">
          <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, margin: 0, textTransform: "capitalize" }}>{g.key}</h2>
            <span className="muted" style={{ fontSize: 13 }}>{human(g.total)}</span>
          </div>
          {g.items.map((e) => (
            <div key={e.id} className="list-row">
              <div style={{ display: "flex", gap: 12, alignItems: "baseline", minWidth: 0 }}>
                <span className="time-dur">{human(e.duration_seconds)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.description || <span className="muted">— ohne Beschreibung —</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {e.client_name || "ohne Kunde"} · {hhmm(e.started_at)}{e.ended_at ? `–${hhmm(e.ended_at)}` : ""}
                  </div>
                </div>
              </div>
              <div className="row-inline" style={{ gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => editDesc(e)}>bearbeiten</button>
                <button className="del" onClick={() => del(e)}>×</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
