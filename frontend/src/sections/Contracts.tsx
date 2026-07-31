import { useEffect, useState } from "react";
import { Contract, api } from "../api";
import { useToast } from "../toast";

const ST: Record<string, string> = { draft: "Entwurf", sent: "gesendet", signed: "unterschrieben", declined: "abgelehnt" };
const stCls = (s: string) => s === "signed" ? "st-aktiv" : s === "sent" ? "st-lead" : s === "declined" ? "st-pausiert" : "st-beendet";

const TEMPLATE = `zwischen

[Deine Agentur]
[Adresse]
– nachfolgend Dienstleister genannt –

und

[Kunde / Firma]
[Adresse]
– nachfolgend Kunde genannt –

wird folgender Vertrag geschlossen:

§ 1 Vertragsgegenstand
(1) Der Dienstleister übernimmt für den Kunden folgende Leistungen: …

§ 2 Vergütung
(1) Die Vergütung beträgt … € netto pro Monat.

§ 3 Laufzeit und Kündigung
(1) Der Vertrag beginnt am … und läuft auf unbestimmte Zeit.
(2) Er kann von beiden Parteien mit einer Frist von vier Wochen zum Monatsende gekündigt werden.`;

export default function Contracts({ clientId, isAgency }: { clientId: string; isAgency: boolean }) {
  const toast = useToast();
  const [list, setList] = useState<Contract[]>([]);
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = () => api.contracts(clientId).then(setList).catch(() => {});
  useEffect(() => { load(); }, [clientId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast("Titel fehlt.", "err"); return; }
    await api.createContract(clientId, { title, body });
    setTitle(""); setBody(""); setShow(false); load(); toast("Vertrag angelegt.");
  };
  const send = async (c: Contract) => { try { const r = await api.sendContract(clientId, c.id); load(); toast(`An ${r.to} gesendet.`); } catch (err) { toast((err as Error).message, "err"); } };
  const copyLink = (c: Contract) => { navigator.clipboard.writeText(`${location.origin}/vertrag/${c.public_token}`); toast("Link kopiert."); };
  const del = async (c: Contract) => { if (!confirm(`Vertrag ${c.number} löschen?`)) return; await api.deleteContract(clientId, c.id); load(); toast("Gelöscht."); };
  const openSign = (c: Contract) => window.open(`/vertrag/${c.public_token}`, "_blank");

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between" }}>
        <h2>Verträge</h2>
        {isAgency && <button className="btn btn-primary btn-sm" onClick={() => setShow((s) => !s)}>{show ? "Abbrechen" : "+ Vertrag"}</button>}
      </div>

      {show && isAgency && (
        <form className="form-light" style={{ margin: "12px 0 18px" }} onSubmit={create}>
          <div className="field"><label>Titel</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Vertrag über SEO-Dienstleistungen" required /></div>
          <div className="field">
            <div className="row-inline" style={{ justifyContent: "space-between" }}>
              <label>Vertragstext (Zeilen mit „§" werden fett)</label>
              <button type="button" className="link-btn" onClick={() => setBody(TEMPLATE)}>Vorlage einfügen</button>
            </div>
            <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} rows={12} style={{ fontFamily: "inherit" }} /></div>
          <button className="btn btn-primary">Vertrag anlegen</button>
        </form>
      )}

      {list.length === 0 ? <div className="empty">Noch keine Verträge.</div> : list.map((c) => (
        <div key={c.id} className="list-row">
          <div>
            <strong>{c.number}</strong> <span className="muted">· {c.date}{c.title ? ` · ${c.title}` : ""}</span>
            {c.status === "signed" && c.signer_name && <div className="muted" style={{ fontSize: 12 }}>unterschrieben von {c.signer_name}{c.signed_at ? ` · ${new Date(c.signed_at).toLocaleDateString("de-DE")}` : ""}</div>}
          </div>
          <div className="row-inline" style={{ alignItems: "center" }}>
            <span className={`status-badge ${stCls(c.status)}`}>{ST[c.status] || c.status}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => api.downloadContractPdf(clientId, c.id, c.number)}>PDF</button>
            {isAgency && c.status !== "signed" && <button className="btn btn-ghost btn-sm" onClick={() => copyLink(c)}>Link</button>}
            {isAgency && c.status !== "signed" && <button className="btn btn-ghost btn-sm" onClick={() => send(c)}>senden</button>}
            {c.status !== "signed" && <button className="btn btn-primary btn-sm" onClick={() => openSign(c)}>{isAgency ? "unterschreiben" : "Jetzt unterschreiben"}</button>}
            {isAgency && <button className="del" onClick={() => del(c)}>löschen</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
