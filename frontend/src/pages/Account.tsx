import { useEffect, useState } from "react";
import { useAuth } from "../App";
import { api } from "../api";
import TwoFactor from "../components/TwoFactor";
import { useToast } from "../toast";

function NotifyPrefs() {
  const toast = useToast();
  const [on, setOn] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { api.notifyPrefs().then((p) => { setOn(p.notify_contact_email); setLoaded(true); }).catch(() => setLoaded(true)); }, []);

  const toggle = async (v: boolean) => {
    setOn(v);
    try { await api.setNotifyPrefs(v); toast(v ? "E-Mail-Benachrichtigung an." : "E-Mail-Benachrichtigung aus."); }
    catch (e) { setOn(!v); toast((e as Error).message, "err"); }
  };

  return (
    <div className="section">
      <h2>Benachrichtigungen</h2>
      <p className="muted" style={{ marginTop: 0 }}>Lege fest, ob du bei neuen Nachrichten im Portal zusätzlich eine E-Mail bekommst.</p>
      <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, opacity: loaded ? 1 : 0.5 }}>
        <input type="checkbox" checked={on} disabled={!loaded} onChange={(e) => toggle(e.target.checked)} />
        Bei neuen Nachrichten per E-Mail benachrichtigen
      </label>
    </div>
  );
}

export default function Account() {
  const { user } = useAuth();
  const roleLabel = user?.role === "agency_admin" ? "Administrator"
    : user?.role === "agency_member" ? "Team-Mitglied" : "Kunde";
  return (
    <>
      <span className="eyebrow">Konto</span>
      <div className="page-head"><h1>Mein Konto</h1></div>

      <div className="section">
        <h2>Profil</h2>
        <dl className="kv">
          <dt>Name</dt><dd>{user?.full_name || "—"}</dd>
          <dt>E-Mail</dt><dd>{user?.email}</dd>
          <dt>Rolle</dt><dd>{roleLabel}</dd>
        </dl>
      </div>

      <NotifyPrefs />

      <TwoFactor />
    </>
  );
}
