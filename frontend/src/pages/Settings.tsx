import { useEffect, useState } from "react";
import { Package, User, api } from "../api";
import { useAuth } from "../App";
import { useToast } from "../toast";

function MonitoringSettings() {
  const toast = useToast();
  const [url, setUrl] = useState("");
  useEffect(() => { api.monitoringWebhookUrl().then((r) => setUrl(r.url)).catch(() => {}); }, []);
  return (
    <div className="section">
      <h2>Website-Monitoring (Uptime Kuma)</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        In Uptime Kuma unter <strong>Einstellungen → Benachrichtigungen → Neu</strong> den Typ
        <strong> „Webhook"</strong> wählen, folgende URL eintragen (Content-Type: application/json) und die
        Benachrichtigung bei deinen Monitoren aktivieren. Fällt eine Seite aus, erscheint sie hier & im Dashboard,
        dem Kunden per Domain zugeordnet.
      </p>
      <div className="field"><label>Webhook-URL</label>
        <input className="input form-light" readOnly value={url} onFocus={(e) => e.currentTarget.select()} /></div>
      <button className="btn btn-primary btn-sm" onClick={() => { navigator.clipboard.writeText(url); toast("URL kopiert."); }}>Kopieren</button>
    </div>
  );
}

function MailSettings() {
  const toast = useToast();
  const [st, setSt] = useState<{ connected: boolean; email: string; configured: boolean } | null>(null);

  const load = () => api.mailStatus().then(setSt).catch(() => {});
  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search).get("mail");
    if (p === "connected") toast("Microsoft-Konto verbunden.");
    if (p === "error") toast("Verbindung fehlgeschlagen.", "err");
    if (p) window.history.replaceState({}, "", "/settings");
  }, []);

  const connect = async () => {
    try { const r = await api.mailConnect(); window.location.href = r.url; }
    catch (err) { toast((err as Error).message, "err"); }
  };
  const disconnect = async () => { await api.mailDisconnect(); load(); toast("Microsoft-Konto getrennt."); };

  return (
    <div className="section">
      <h2>E-Mail (Microsoft 365)</h2>
      {!st ? <div className="muted">Lädt…</div> : !st.configured ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Microsoft ist serverseitig noch nicht konfiguriert (MICROSOFT_CLIENT_ID/SECRET). Siehe Anleitung – danach
          erscheint hier „Mit Microsoft anmelden".
        </p>
      ) : st.connected ? (
        <div className="row-inline" style={{ alignItems: "center" }}>
          <span className="tag done">verbunden</span>
          <span className="muted">{st.email}</span>
          <button className="btn btn-primary btn-sm" onClick={async () => {
            try { const r = await api.mailTest(); toast(`Testmail an ${r.to} gesendet.`); }
            catch (err) { toast((err as Error).message, "err"); }
          }}>Testmail senden</button>
          <button className="btn btn-ghost btn-sm" onClick={disconnect}>Trennen</button>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Verbinde dein Microsoft-Postfach, um E-Mails direkt aus dem Tool zu senden.</p>
          <button className="btn btn-primary" onClick={connect}>Mit Microsoft anmelden</button>
        </>
      )}
    </div>
  );
}

function Packages() {
  const toast = useToast();
  const [pkgs, setPkgs] = useState<Package[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState("monatlich");

  const load = () => api.packages().then(setPkgs).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createPackage({ name, price, interval }); setName(""); setPrice(""); load(); toast("Paket angelegt.");
  };
  const del = async (id: string) => { if (!confirm("Paket löschen?")) return; await api.deletePackage(id); load(); toast("Paket gelöscht."); };

  return (
    <div className="section">
      <h2>Leistungen & Pakete</h2>
      <p className="muted" style={{ marginTop: 0 }}>Dein Katalog – steht in den Vertragsdaten zur Auswahl.</p>
      {pkgs.map((p) => (
        <div key={p.id} className="list-row">
          <div><strong>{p.name}</strong> <span className="muted">· {p.price || "—"} · {p.interval}</span></div>
          <button className="del" onClick={() => del(p.id)}>löschen</button>
        </div>
      ))}
      <form className="row-inline form-light" style={{ marginTop: 14 }} onSubmit={create}>
        <div className="field" style={{ flex: 2 }}><label>Paketname</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="z.B. SEO Premium" /></div>
        <div className="field"><label>Preis</label><input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="990 €" /></div>
        <div className="field"><label>Intervall</label>
          <select className="select" value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="monatlich">monatlich</option><option value="jährlich">jährlich</option><option value="einmalig">einmalig</option>
          </select></div>
        <button className="btn btn-primary">Hinzufügen</button>
      </form>
    </div>
  );
}

function Team() {
  const { user } = useAuth();
  const toast = useToast();
  const [team, setTeam] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("agency_member");
  const [error, setError] = useState("");

  const load = () => api.team().then(setTeam).catch(() => {});
  useEffect(() => { load(); }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await api.inviteMember({ email, password: pw, full_name: name, role }); setEmail(""); setPw(""); setName(""); setRole("agency_member"); load(); toast("Team-Mitglied angelegt."); }
    catch (err) { setError((err as Error).message); }
  };
  const remove = async (id: string) => {
    if (!confirm("Diesen Nutzer entfernen?")) return;
    await api.removeMember(id); load(); toast("Entfernt.");
  };
  const changeRole = async (id: string, r: string) => {
    try { await api.setMemberRole(id, r); load(); toast(r === "agency_admin" ? "Zum Admin gemacht." : "Zu Mitarbeiter gemacht."); }
    catch (err) { toast((err as Error).message, "err"); }
  };

  return (
    <div className="section">
      <h2>Team</h2>
      {team.map((m) => (
        <div key={m.id} className="list-row">
          <div>
            <strong>{m.full_name || m.email}</strong>
            <span className="muted"> · {m.email}</span>
            <span className={`status-badge ${m.role === "agency_admin" ? "st-lead" : "st-beendet"}`} style={{ marginLeft: 8 }}>
              {m.role === "agency_admin" ? "Admin" : "Mitarbeiter"}
            </span>
          </div>
          <div className="row-inline" style={{ alignItems: "center" }}>
            {m.id !== user?.id && (
              m.role === "agency_admin"
                ? <button className="btn btn-ghost btn-sm" onClick={() => changeRole(m.id, "agency_member")}>zu Mitarbeiter</button>
                : <button className="btn btn-ghost btn-sm" onClick={() => changeRole(m.id, "agency_admin")}>zum Admin</button>
            )}
            {m.id !== user?.id && <button className="del" onClick={() => remove(m.id)}>entfernen</button>}
          </div>
        </div>
      ))}
      <form className="row-inline form-light" style={{ marginTop: 14 }} onSubmit={invite}>
        <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field" style={{ flex: 1 }}><label>E-Mail</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Start-Passwort</label><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        <div className="field"><label>Rolle</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="agency_member">Mitarbeiter</option>
            <option value="agency_admin">Admin</option>
          </select></div>
        <button className="btn btn-primary">Anlegen</button>
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

      <MailSettings />
      <MonitoringSettings />
      <Packages />
      <AgencyContactForm />
      <Team />
    </>
  );
}
