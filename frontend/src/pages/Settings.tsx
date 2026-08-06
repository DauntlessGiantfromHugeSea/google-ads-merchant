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
  const [preview, setPreview] = useState("");

  const load = () => api.mailStatus().then(setSt).catch(() => {});
  useEffect(() => {
    load();
    api.mailPreview().then((r) => setPreview(r.html)).catch(() => {});
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

      {preview && (
        <>
          <h3 style={{ margin: "18px 0 8px", fontSize: 15 }}>Vorschau (E-Mail-Design)</h3>
          <iframe title="Mail-Vorschau" srcDoc={preview}
            style={{ width: "100%", height: 380, border: "1px solid var(--glass-border)", borderRadius: 12, background: "#fff" }} />
        </>
      )}
    </div>
  );
}

function Packages() {
  const toast = useToast();
  const [pkgs, setPkgs] = useState<Package[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState("monatlich");
  const [unit, setUnit] = useState("Stunden");
  const [rate, setRate] = useState("");

  const load = () => api.packages().then(setPkgs).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createPackage({ name, category, price, interval, unit, unit_price: parseFloat(rate.replace(",", ".")) || 0 });
    setName(""); setCategory(""); setPrice(""); setRate(""); load(); toast("Paket angelegt.");
  };
  const del = async (id: string) => { if (!confirm("Paket löschen?")) return; await api.deletePackage(id); load(); toast("Paket gelöscht."); };
  const importList = async () => {
    try { const r = await api.importNorthlab(); load(); toast(`${r.added} Leistungen importiert${r.skipped ? `, ${r.skipped} bereits vorhanden` : ""}.`); }
    catch (err) { toast((err as Error).message, "err"); }
  };

  // Nach Kategorie gruppieren (Reihenfolge nach erstem Auftreten).
  const groups: { cat: string; items: Package[] }[] = [];
  for (const p of pkgs) {
    const key = p.category || "Sonstiges";
    let g = groups.find((x) => x.cat === key);
    if (!g) { g = { cat: key, items: [] }; groups.push(g); }
    g.items.push(p);
  }

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>Leistungen & Pakete</h2>
        <button className="btn btn-ghost btn-sm" onClick={importList}>Preisliste importieren (North Lab)</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Dein Katalog – steht in Angeboten & Vertragsdaten zur Auswahl. Beim Import bereits vorhandene Namen bleiben unverändert.</p>
      {groups.map((g) => (
        <div key={g.cat} style={{ marginBottom: 8 }}>
          <div className="todo-group-head">{g.cat}</div>
          {g.items.map((p) => (
            <div key={p.id} className="list-row">
              <div><strong>{p.name}</strong> <span className="muted">· {p.price || "—"} · {p.interval}{p.unit_price ? ` · ${p.unit_price} €/${p.unit}` : ""}</span></div>
              <button className="del" onClick={() => del(p.id)}>löschen</button>
            </div>
          ))}
        </div>
      ))}
      <form className="row-inline form-light" style={{ marginTop: 14 }} onSubmit={create}>
        <div className="field" style={{ flex: 2 }}><label>Paketname</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="z.B. SEO Premium" /></div>
        <div className="field"><label>Kategorie</label><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="z.B. SEO & Online-Marketing" /></div>
        <div className="field"><label>Preis (Anzeige)</label><input className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="990 €" /></div>
        <div className="field"><label>Intervall</label>
          <select className="select" value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="monatlich">monatlich</option><option value="jährlich">jährlich</option><option value="einmalig">einmalig</option>
          </select></div>
        <div className="field"><label>Einheit</label>
          <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option>Stunden</option><option>Monat</option><option>Pauschal</option>
          </select></div>
        <div className="field"><label>Stundensatz/Preis (€)</label><input className="input" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="15,90" /></div>
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
  const [f, setF] = useState({ agency_contact_name: "", agency_contact_email: "", agency_contact_phone: "", agency_contact_note: "", agency_address: "", email_notifications: true, meeting_link: "", timezone: "Europe/Berlin" });
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
        <div className="field"><label>Postanschrift der Agentur (für Verträge)</label><textarea className="input" value={f.agency_address} onChange={upd("agency_address")} placeholder="Straße Nr.&#10;PLZ Ort" /></div>
        <div className="field"><label>Hinweis (z.B. Erreichbarkeit)</label><textarea className="input" value={f.agency_contact_note} onChange={upd("agency_contact_note")} /></div>
        <div className="field"><label>Standard-Terminlink (z.B. Zoom/Meet/Calendly)</label>
          <input className="input" value={f.meeting_link} onChange={upd("meeting_link")} placeholder="https://…" /></div>
        <div className="field"><label>Zeitzone (für Anzeige &amp; Reports)</label>
          <select className="select" value={f.timezone}
            onChange={(e) => setF((p) => ({ ...p, timezone: e.target.value }))}>
            <option value="Europe/Berlin">Berlin / Deutschland (Europe/Berlin)</option>
            <option value="Europe/Vienna">Wien (Europe/Vienna)</option>
            <option value="Europe/Zurich">Zürich (Europe/Zurich)</option>
            <option value="Europe/London">London (Europe/London)</option>
            <option value="Europe/Athens">Athen (Europe/Athens)</option>
            <option value="America/New_York">New York (America/New_York)</option>
            <option value="UTC">UTC</option>
          </select>
          <span className="muted" style={{ fontSize: 12 }}>Zeitstempel in Reports und Verträgen erscheinen in dieser Zeitzone.</span>
        </div>
        <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "6px 0 12px" }}>
          <input type="checkbox" checked={f.email_notifications} onChange={(e) => setF((p) => ({ ...p, email_notifications: e.target.checked }))} />
          E-Mail-Benachrichtigung bei wichtigen Ereignissen (Vertrag unterschrieben, Angebot angenommen, neue Aufgabe/Anfrage/Termin) – über dein Microsoft-Konto.
        </label>
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
  const [tagline, setTagline] = useState("");
  useEffect(() => { api.loginInfo().then((r) => setTagline(r.tagline)).catch(() => {}); }, []);
  const saveTagline = async () => {
    try { await api.setLoginTagline(tagline); setMsg("Login-Untertitel gespeichert."); }
    catch (err) { setError((err as Error).message); }
  };

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

        <div className="field form-light" style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <label>Login-Untertitel (Text unter „Anmelden")</label>
          <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="z.B. Willkommen bei North Lab" />
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={saveTagline}>Untertitel speichern</button>
        </div>
      </div>

      <MailSettings />
      <MonitoringSettings />
      <PublicAssets />
      <Packages />
      <AgencyContactForm />
      <Backups />
      <Team />
    </>
  );
}

function PublicAssets() {
  const toast = useToast();
  const [items, setItems] = useState<import("../api").Asset[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const fmtSize = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
  const load = () => api.assets().then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  const upload = async (f: File) => {
    setBusy(true);
    try { await api.uploadAsset(label, f); setLabel(""); load(); toast("Hochgeladen."); }
    catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  const del = async (id: string) => { if (!confirm("Asset löschen? Bestehende Einbindungen brechen dann.")) return; await api.deleteAsset(id); load(); };
  const copy = (t: string, msg: string) => navigator.clipboard.writeText(t).then(() => toast(msg));

  return (
    <div className="section">
      <h2>Öffentliche Logo-Dateien</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Lade Logo-Varianten hoch und erhalte je eine <strong>offene URL</strong> zum Einbinden auf anderen Seiten
        (z. B. <code>&lt;img src="…"&gt;</code>). Die Datei ist ohne Login abrufbar.
      </p>
      <div className="form-light row-inline" style={{ alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 2, minWidth: 180 }}><label>Bezeichnung (optional)</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Logo weiß, Logo quadratisch …" /></div>
        <label className="btn btn-primary" style={{ cursor: "pointer" }}>{busy ? "Lädt…" : "+ Datei hochladen"}
          <input type="file" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} /></label>
      </div>

      {items.length === 0 ? <div className="empty sm" style={{ marginTop: 12 }}>Noch keine Dateien.</div> : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((a) => (
            <div key={a.id} className="asset-row">
              <div className="asset-preview">
                {a.content_type.startsWith("image/")
                  ? <img src={api.assetUrl(a.token)} alt={a.label} />
                  : <span style={{ fontSize: 22 }}>📄</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong className="ellip">{a.label}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{a.filename} · {fmtSize(a.size)}</div>
                <input className="input" readOnly value={api.assetUrl(a.token)} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 6, fontSize: 12 }} />
              </div>
              <div className="row-inline" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(api.assetUrl(a.token), "URL kopiert.")}>URL</button>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(`<img src="${api.assetUrl(a.token)}" alt="${a.label}">`, "Einbettungs-Code kopiert.")}>&lt;img&gt;</button>
                <a className="btn btn-ghost btn-sm" href={api.assetUrl(a.token)} target="_blank" rel="noreferrer">öffnen</a>
                <button className="del" onClick={() => del(a.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Backups() {
  const toast = useToast();
  const [items, setItems] = useState<{ name: string; kind: string; size: number; modified: number }[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "blocked" | "empty">("loading");

  useEffect(() => {
    api.backups()
      .then((r) => { setItems(r.backups); setState(r.count ? "ok" : "empty"); })
      .catch((e) => setState((e as Error).message.includes("Tailscale") ? "blocked" : "empty"));
  }, []);

  const fmtSize = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
  const fmtDate = (s: number) => new Date(s * 1000).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  const dl = async (name: string) => { try { await api.downloadBackup(name); } catch (e) { toast((e as Error).message, "err"); } };

  return (
    <div className="section">
      <h2>Datensicherung</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Nächtliche Backups der Datenbank. Download nur für Admins und nur über Tailscale (die Dumps enthalten alle Daten).
      </p>
      {state === "loading" && <div className="muted">lädt…</div>}
      {state === "blocked" && (
        <div className="muted" style={{ fontSize: 13 }}>
          🔒 Der Download ist nur über <strong>Tailscale</strong> (dein privates Netz) erreichbar. Öffne North Flow über die Tailscale-Adresse, um die Sicherungen zu laden.
        </div>
      )}
      {state === "empty" && <div className="empty">Noch keine Sicherungen vorhanden.</div>}
      {state === "ok" && (
        <div style={{ overflowX: "auto" }}>
          <table className="inv-table" style={{ fontSize: 13 }}>
            <thead><tr><th>Datei</th><th>Typ</th><th>Datum</th><th style={{ textAlign: "right" }}>Größe</th><th></th></tr></thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.name}>
                  <td><strong style={{ fontSize: 12 }}>{b.name}</strong></td>
                  <td className="muted">{b.kind === "weekly" ? "wöchentlich" : "täglich"}</td>
                  <td className="muted">{fmtDate(b.modified)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtSize(b.size)}</td>
                  <td style={{ textAlign: "right" }}><button className="btn btn-ghost btn-sm" onClick={() => dl(b.name)}>herunterladen</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
