import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, auth, User } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ClientDetail from "./pages/ClientDetail";
import Settings from "./pages/Settings";
import Vault from "./pages/Vault";
import Reveal from "./pages/Reveal";

interface AuthCtx {
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => void;
  impersonating: boolean;
  startImpersonate: (token: string) => Promise<void>;
  stopImpersonate: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>({
  user: null, setUser: () => {}, logout: () => {},
  impersonating: false, startImpersonate: async () => {}, stopImpersonate: async () => {},
});
export const useAuth = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(auth.isImpersonating);

  useEffect(() => {
    if (!auth.token) { setLoading(false); return; }
    api.me().then(setUser).catch(() => auth.clear()).finally(() => setLoading(false));
  }, []);

  const logout = () => { auth.clear(); setUser(null); setImpersonating(false); };

  const startImpersonate = async (token: string) => {
    auth.startImpersonation(token);
    setImpersonating(true);
    setUser(await api.me());
  };
  const stopImpersonate = async () => {
    auth.stopImpersonation();
    setImpersonating(false);
    setUser(await api.me());
  };

  if (loading) return null;

  return (
    <Ctx.Provider value={{ user, setUser, logout, impersonating, startImpersonate, stopImpersonate }}>
      <Routes>
        {/* Öffentlich: sicheres Geheimnis abrufen (auch ohne Login) */}
        <Route path="/s/:id" element={<Reveal />} />
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={user ? <Shell><Dashboard /></Shell> : <Navigate to="/login" />} />
        <Route path="/clients/:id" element={user ? <Shell><ClientDetail /></Shell> : <Navigate to="/login" />} />
        <Route path="/settings" element={user?.role === "agency_admin" ? <Shell><Settings /></Shell> : <Navigate to="/" />} />
        <Route path="/vault" element={user ? <Shell><Vault /></Shell> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Ctx.Provider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, impersonating, stopImpersonate } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <div className="topbar">
        <span className="logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>North<b> </b>Flow</span>
        <div className="right">
          <span>{user?.email}</span>
          <button className="btn btn-ghost on-dark btn-sm" onClick={() => navigate("/vault")}>Passwort-Safe</button>
          {user?.role === "agency_admin" && (
            <button className="btn btn-ghost on-dark btn-sm" onClick={() => navigate("/settings")}>Einstellungen</button>
          )}
          <button className="btn btn-ghost on-dark btn-sm" onClick={logout}>Abmelden</button>
        </div>
      </div>
      {impersonating && (
        <div style={{
          background: "linear-gradient(120deg, rgba(20,184,166,0.9), rgba(124,58,237,0.9))",
          color: "#fff", padding: "9px 24px", display: "flex", alignItems: "center",
          justifyContent: "center", gap: 14, fontSize: 14,
        }}>
          👁️ Du siehst gerade die <strong>Kundenansicht</strong>.
          <button className="btn btn-ghost on-dark btn-sm" onClick={() => { stopImpersonate().then(() => navigate("/")); }}>
            Zurück zur Agentur
          </button>
        </div>
      )}
      <div className="container">{children}</div>
    </>
  );
}
