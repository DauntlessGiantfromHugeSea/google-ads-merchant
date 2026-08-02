import { useEffect, useState } from "react";
import { Credential, api } from "../api";
import { useToast } from "../toast";

type Form = { label: string; url: string; category: string; username: string; password: string; notes: string };
const EMPTY: Form = { label: "", url: "", category: "", username: "", password: "", notes: "" };

export default function Credentials({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Credential[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = () => api.credentials(clientId).then((c) => { setItems(c); setLoaded(true); }).catch(() => setLoaded(true));
  useEffect(() => { load(); }, [clientId]);

  const openNew = () => { setForm({ ...EMPTY }); setEditId(null); };
  const openEdit = (c: Credential) => {
    setEditId(c.id);
    setForm({ label: c.label, url: c.url, category: c.category, username: c.username, password: "", notes: c.notes });
  };
  const upd = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form || !form.label.trim()) { toast("Bitte eine Bezeichnung angeben.", "err"); return; }
    try {
      if (editId) await api.updateCredential(clientId, editId, form);
      else await api.createCredential(clientId, form);
      setForm(null); setEditId(null); setRevealed({}); load();
      toast("Gespeichert.");
    } catch (e) { toast((e as Error).message, "err"); }
  };
  const del = async (c: Credential) => {
    if (!confirm(`„${c.label}" löschen?`)) return;
    await api.deleteCredential(clientId, c.id); load();
  };
  const reveal = async (c: Credential) => {
    if (revealed[c.id] != null) { setRevealed((r) => { const n = { ...r }; delete n[c.id]; return n; }); return; }
    try { const r = await api.revealCredential(clientId, c.id); setRevealed((s) => ({ ...s, [c.id]: r.password })); }
    catch (e) { toast((e as Error).message, "err"); }
  };
  const copy = async (c: Credential) => {
    try {
      const pw = revealed[c.id] ?? (await api.revealCredential(clientId, c.id)).password;
      await navigator.clipboard.writeText(pw);
      toast("Passwort kopiert.");
    } catch { toast("Kopieren nicht möglich.", "err"); }
  };
  const copyText = async (t: string, what: string) => {
    try { await navigator.clipboard.writeText(t); toast(`${what} kopiert.`); } catch { /* ignore */ }
  };

  return (
    <div className="section">
      <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>🔐 Interne Zugangsdaten</h2>
          <div className="muted" style={{ fontSize: 13 }}>Nur fürs Team – verschlüsselt gespeichert. Kunden sehen das nicht.</div>
        </div>
        {!form && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Zugang</button>}
      </div>

      {form && (
        <div className="form-light" style={{ marginTop: 12 }}>
          <div className="row-inline">
            <div className="field" style={{ flex: 2 }}><label>Bezeichnung *</label>
              <input className="input" value={form.label} onChange={(e) => upd("label", e.target.value)} placeholder="z. B. WordPress Admin" /></div>
            <div className="field" style={{ flex: 1 }}><label>Kategorie</label>
              <input className="input" value={form.category} onChange={(e) => upd("category", e.target.value)} placeholder="Hosting, CMS, Google …" /></div>
          </div>
          <div className="field"><label>URL</label>
            <input className="input" value={form.url} onChange={(e) => upd("url", e.target.value)} placeholder="https://…/wp-admin" /></div>
          <div className="row-inline">
            <div className="field" style={{ flex: 1 }}><label>Benutzername</label>
              <input className="input" value={form.username} onChange={(e) => upd("username", e.target.value)} autoComplete="off" /></div>
            <div className="field" style={{ flex: 1 }}><label>Passwort {editId && <span className="muted" style={{ fontWeight: 400 }}>· leer = unverändert</span>}</label>
              <input className="input" type="text" value={form.password} onChange={(e) => upd("password", e.target.value)} autoComplete="new-password" /></div>
          </div>
          <div className="field"><label>Notiz</label>
            <textarea className="input" value={form.notes} onChange={(e) => upd("notes", e.target.value)} placeholder="2FA-Hinweise, Ansprechpartner, Besonderheiten …" /></div>
          <div className="row-inline" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setForm(null); setEditId(null); }}>Abbrechen</button>
            <button className="btn btn-primary" onClick={save}>Speichern</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {!loaded ? null : items.length === 0 ? (
          <div className="empty sm">Noch keine Zugangsdaten hinterlegt.</div>
        ) : items.map((c) => (
          <div key={c.id} className="cred-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row-inline" style={{ gap: 8, alignItems: "center" }}>
                <strong>{c.label}</strong>
                {c.category && <span className="tag" style={{ fontSize: 10 }}>{c.category}</span>}
              </div>
              <div className="cred-meta">
                {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="cred-link">{c.url.replace(/^https?:\/\//, "")}</a>}
                {c.username && <span onClick={() => copyText(c.username, "Benutzername")} title="kopieren" style={{ cursor: "pointer" }}>👤 {c.username}</span>}
                <span className="cred-pw">
                  🔑 {revealed[c.id] != null ? <code>{revealed[c.id] || "—"}</code> : "••••••••"}
                </span>
              </div>
              {c.notes && <div className="muted" style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap" }}>{c.notes}</div>}
            </div>
            <div className="cred-actions">
              {c.has_password && <button className="btn btn-ghost btn-sm" onClick={() => reveal(c)}>{revealed[c.id] != null ? "verbergen" : "anzeigen"}</button>}
              {c.has_password && <button className="btn btn-ghost btn-sm" onClick={() => copy(c)}>kopieren</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>bearbeiten</button>
              <button className="del" onClick={() => del(c)}>löschen</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
