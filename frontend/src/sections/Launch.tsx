import { useEffect, useState } from "react";
import { Approval, Milestone, api } from "../api";
import { useToast } from "../toast";

const MS_STATUS: Record<string, string> = { planned: "geplant", in_progress: "in Arbeit", done: "fertig" };
const MS_NEXT: Record<string, string> = { planned: "in_progress", in_progress: "done", done: "planned" };

export default function Launch({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [ms, setMs] = useState<Milestone[]>([]);
  const [aps, setAps] = useState<Approval[]>([]);
  const [mTitle, setMTitle] = useState("");
  const [mDate, setMDate] = useState("");
  const [aTitle, setATitle] = useState("");
  const [aDesc, setADesc] = useState("");
  const [aLink, setALink] = useState("");

  const load = () => {
    api.milestones(clientId).then(setMs).catch(() => {});
    api.approvals(clientId).then(setAps).catch(() => {});
  };
  useEffect(() => { load(); }, [clientId]);

  const addMs = async (e: React.FormEvent) => {
    e.preventDefault(); if (!mTitle.trim()) return;
    await api.createMilestone(clientId, { title: mTitle, date: mDate }); setMTitle(""); setMDate(""); load(); toast("Meilenstein hinzugefügt.");
  };
  const cycle = async (m: Milestone) => { await api.updateMilestone(clientId, m.id, { status: MS_NEXT[m.status] || "planned" }); load(); };
  const delMs = async (m: Milestone) => { if (!confirm("Meilenstein löschen?")) return; await api.deleteMilestone(clientId, m.id); load(); };

  const addAp = async (e: React.FormEvent) => {
    e.preventDefault(); if (!aTitle.trim()) return;
    await api.createApproval(clientId, { title: aTitle, description: aDesc, link: aLink }); setATitle(""); setADesc(""); setALink(""); load(); toast("Freigabe angefragt.");
  };
  const respond = async (a: Approval, decision: string) => {
    let comment = "";
    if (decision === "changes_requested") { comment = prompt("Was soll geändert werden?") || ""; }
    await api.respondApproval(clientId, a.id, { decision, comment }); load();
    toast(decision === "approved" ? "Freigegeben." : "Änderungen angefragt.");
  };
  const delAp = async (a: Approval) => { if (!confirm("Freigabe löschen?")) return; await api.deleteApproval(clientId, a.id); load(); };

  const dotColor = (s: string) => s === "done" ? "#34d399" : s === "in_progress" ? "#f8836b" : "#565b6b";
  const apBadge = (s: string) => s === "approved" ? "st-aktiv" : s === "changes_requested" ? "st-pausiert" : "st-lead";
  const apLabel = (s: string) => s === "approved" ? "freigegeben" : s === "changes_requested" ? "Änderungen erwünscht" : "offen";

  return (
    <>
      <div className="section">
        <h2>Launch-Roadmap</h2>
        {isAgency && (
          <form className="row-inline form-light" style={{ marginBottom: 14 }} onSubmit={addMs}>
            <div className="field" style={{ flex: 2 }}><label>Meilenstein</label>
              <input className="input" value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="z.B. Design-Freigabe" /></div>
            <div className="field"><label>Datum</label><input className="input" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} /></div>
            <button className="btn btn-primary">Hinzufügen</button>
          </form>
        )}
        {ms.length === 0 ? <div className="empty">Noch keine Meilensteine.</div> : (
          <div className="timeline">
            {ms.map((m) => (
              <div key={m.id} className="tl-item">
                <span style={{ position: "absolute", left: -20, top: 4, width: 11, height: 11, borderRadius: "50%", background: dotColor(m.status), border: "2px solid #0a0a0e" }} />
                <div className="tl-title">{m.title} <span className="status-badge st-beendet" style={{ marginLeft: 6 }}>{MS_STATUS[m.status] || m.status}</span></div>
                {m.date && <div className="tl-meta">{m.date}</div>}
                {m.description && <div style={{ fontSize: 14 }}>{m.description}</div>}
                {isAgency && (
                  <div className="tl-meta" style={{ marginTop: 4 }}>
                    <span className="switch-link" onClick={() => cycle(m)}>Status wechseln</span> · <span className="del" style={{ display: "inline" }} onClick={() => delMs(m)}>löschen</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h2>Freigaben</h2>
        {isAgency && (
          <form className="form-light" style={{ marginBottom: 14 }} onSubmit={addAp}>
            <div className="row-inline">
              <div className="field" style={{ flex: 2 }}><label>Titel</label><input className="input" value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="z.B. Startseite freigeben" /></div>
              <div className="field" style={{ flex: 2 }}><label>Link (optional, z.B. Staging)</label><input className="input" value={aLink} onChange={(e) => setALink(e.target.value)} placeholder="https://staging…" /></div>
            </div>
            <div className="field"><label>Beschreibung</label><textarea className="input" value={aDesc} onChange={(e) => setADesc(e.target.value)} /></div>
            <button className="btn btn-primary">Freigabe anfragen</button>
          </form>
        )}
        {aps.length === 0 ? <div className="empty">Keine Freigaben.</div> : aps.map((a) => (
          <div key={a.id} className="card" style={{ marginBottom: 10, boxShadow: "none" }}>
            <div className="row-inline" style={{ justifyContent: "space-between" }}>
              <strong>{a.title}</strong>
              <span className={`status-badge ${apBadge(a.status)}`}>{apLabel(a.status)}</span>
            </div>
            {a.description && <div style={{ fontSize: 14, marginTop: 4 }}>{a.description}</div>}
            {a.link && <div style={{ marginTop: 4 }}><a className="switch-link" href={a.link} target="_blank" rel="noreferrer">→ Ansehen</a></div>}
            {a.status !== "pending" && (
              <div className="tl-meta" style={{ marginTop: 6 }}>
                {apLabel(a.status)} von {a.responded_by}{a.response_comment ? ` · „${a.response_comment}"` : ""}
              </div>
            )}
            <div className="row-inline" style={{ marginTop: 8, alignItems: "center" }}>
              {a.status === "pending" && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => respond(a, "approved")}>Freigeben</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => respond(a, "changes_requested")}>Änderungen anfragen</button>
                </>
              )}
              {isAgency && <button className="del" onClick={() => delAp(a)}>löschen</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
