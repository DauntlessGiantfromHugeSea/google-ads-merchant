import { useAuth } from "../App";
import TwoFactor from "../components/TwoFactor";

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

      <TwoFactor />
    </>
  );
}
