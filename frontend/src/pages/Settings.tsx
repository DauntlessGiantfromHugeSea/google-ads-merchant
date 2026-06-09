import { useEffect, useState } from "react";
import { User, api } from "../api";
import { useAuth } from "../App";
import { useToast } from "../toast";

function Team() {
  const { user } = useAuth();
  const toast = useToast();
  const [team, setTeam] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const load = () => api.team().then(setTeam).catch(() => {});
  useEffect(() => { load(); }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await api.inviteMember({ email, password: pw, full_name: name }); setEmail(""); setPw(""); setName(""); load(); toast("Mitarbeiter eingeladen."); }
    catch (err) { setError((err as Error).message); }
  };
  const remove = async (id: string) => {
    if (!confirm("Diesen Mitarbeiter entfernen?")) return;
    await api.removeMember(id); load(); toast("Mitarbeiter entfernt.");
  };

  return (
    <div className="section">
      <h2>Team</h2>
      {team.map((m) => (
        <div key={m.id} className="list-row">
          <div><strong>{m.full_name || m.email}</strong> <span className="muted">· {m.email} · {m.role === "agency_admin" ? "Admin" : "Mitarbeiter"}</span></div>
          {m.id !== user?.id && m.role !== "agency_admin" && <button className="del" onClick={() => remove(m.id)}>entfernen</button>}
        </div>
      ))}
      <form className="row-inline form-light" style={{ marginTop: 14 }} onSubmit={invite}>
        <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field" style={{ flex: 1 }}><label>E-Mail</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Start-Passwort</label><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        <button className="btn btn-primary">Mitarbeiter einladen</button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function AgencyContactForm() {
  const toast = useToast();
  const [f, setF] = useState({ agency_contact_name: "", agency_contact_email: "", agency_contact_phone: "", agency_contact_note: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.getAgencyContact().then(setF).catch(() => {}); }, []);
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try { await api.setAgencyContact(f); toast("Agentur-Kontakt gespeichert."); }
    catch (err) { toast((err as Error).message, "err"); }
    finally { setSaving(false); }
  };
  return (
    <div className="section">
      <h2>Agentur-Kontakt</h2>
      <p className="muted" style={{ marginTop: 0 }}>Diese Kontaktdaten sehen deine Kunden in ihrem Bereich.</p>
      <div className="form-light">
        <div className="row-inline">
          <div className="field" style={{ flex: 1 }}><label>Ansprechpartner / Agentur</label><input className="input" value={f.agency_contact_name} onChange={upd("agency_contact_name")} /></div>
          <div className="field" style={{ flex: 1 }}><label>E-Mail</label><input className="input" value={f.agency_contact_email} onChange={upd("agency_contact_email")} /></div>
        </div>
        <div className="row-inline">
          <div className="field" style={{ flex: 1 }}><label>Telefon</label><input className="input" value={f.agency_contact_phone} onChange={upd("agency_contact_phone")} /></div>
        </div>
        <div className="field"><label>Hinweis (z.B. Erreichbarkeit)</label><textarea className="input" value={f.agency_contact_note} onChange={upd("agency_contact_note")} /></div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [bust, setBust] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setMsg(""); setBusy(true);
    try {
      await api.uploadLogo(file);
      setBust(Date.now());
      setMsg("Logo gespeichert. Im Login (dunkler Hintergrund) sichtbar.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const remove = async () => {
    setError(""); setMsg("");
    try { await api.deleteLogo(); setBust(Date.now()); setMsg("Logo entfernt."); }
    catch (err) { setError((err as Error).message); }
  };

  return (
    <>
      <span className="eyebrow">Einstellungen</span>
      <div className="page-head"><h1>Einstellungen</h1></div>

      <div className="section">
        <h2>Logo</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Wird in der Login-Maske angezeigt (auf dunklem Hintergrund). PNG mit
          transparentem Hintergrund oder SVG empfohlen, max. 2 MB.
        </p>

        {/* Vorschau auf dunklem Hintergrund */}
        <div style={{ background: "#0e0e10", borderRadius: 12, padding: 24, display: "flex",
                      justifyContent: "center", marginBottom: 16 }}>
          <img src={`/api/branding/logo?t=${bust}`} alt="Aktuelles Logo" style={{ maxHeight: 70, maxWidth: 260 }}
            onError={(e) => { e.currentTarget.style.opacity = "0.35"; e.currentTarget.src = "/logo.svg"; }} />
        </div>

        <div className="row-inline" style={{ alignItems: "center" }}>
          <label className="btn btn-primary" style={{ cursor: "pointer" }}>
            {busy ? "Lädt…" : "Logo hochladen"}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
              style={{ display: "none" }} onChange={onFile} disabled={busy} />
          </label>
          <button className="btn btn-ghost" onClick={remove} disabled={busy}>Entfernen</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <AgencyContactForm />
      <Team />
    </>
  );
}
