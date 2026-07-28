import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, auth, User } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ClientDetail from "./pages/ClientDetail";
import Settings from "./pages/Settings";
import Vault from "./pages/Vault";
import Reveal from "./pages/Reveal";
import RequestSubmit from "./pages/RequestSubmit";
import Planner from "./pages/Planner";
import Forms from "./pages/Forms";
import Intake from "./pages/Intake";
import SetPassword from "./pages/SetPassword";
import Angebot from "./pages/Angebot";
import Help from "./pages/Help";

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
        {/* Öffentlich (ohne Login): Geheimnis abrufen bzw. einreichen */}
        <Route path="/s/:id" element={<Reveal />} />
        <Route path="/req/:id" element={<RequestSubmit />} />
        <Route path="/intake/:id" element={<Intake />} />
        <Route path="/einladung/:token" element={<SetPassword />} />
        <Route path="/angebot/:token" element={<Angebot />} />
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={user ? <Shell><Dashboard /></Shell> : <Navigate to="/login" />} />
        <Route path="/clients/:id" element={user ? <Shell><ClientDetail /></Shell> : <Navigate to="/login" />} />
        <Route path="/settings" element={user?.role === "agency_admin" ? <Shell><Settings /></Shell> : <Navigate to="/" />} />
        <Route path="/vault" element={user ? <Shell><Vault /></Shell> : <Navigate to="/login" />} />
        <Route path="/planner" element={user && user.role !== "client_user" ? <Shell><Planner /></Shell> : <Navigate to="/" />} />
        <Route path="/projects" element={<Navigate to="/planner" />} />
        <Route path="/tasks" element={<Navigate to="/planner" />} />
        <Route path="/forms" element={user && user.role !== "client_user" ? <Shell><Forms /></Shell> : <Navigate to="/" />} />
        <Route path="/hilfe" element={user ? <Shell><Help /></Shell> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Ctx.Provider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, impersonating, stopImpersonate } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const go = (path: string) => { setMenu(false); navigate(path); };
  return (
    <>
      <div className="topbar">
        <span className="logo" onClick={() => go("/")} style={{ cursor: "pointer" }}>North<b> </b>Flow</span>
        <button className="menu-toggle" aria-label="Menü" onClick={() => setMenu((m) => !m)}>
          {menu ? "✕" : "☰"}
        </button>
        <div className={`right ${menu ? "open" : ""}`}>
          <span className="who">{user?.email}</span>
          <button className="btn btn-ghost on-dark btn-sm" onClick={() => go("/")}>Kunden</button>
          {user?.role !== "client_user" && (
            <>
              <button className="btn btn-ghost on-dark btn-sm" onClick={() => go("/planner")}>Planner</button>
              <button className="btn btn-ghost on-dark btn-sm" onClick={() => go("/forms")}>Formulare</button>
            </>
          )}
          <button className="btn btn-ghost on-dark btn-sm" onClick={() => go("/vault")}>Passwort-Safe</button>
          {user?.role === "agency_admin" && (
            <button className="btn btn-ghost on-dark btn-sm" onClick={() => go("/settings")}>Einstellungen</button>
          )}
          <button className="btn btn-ghost on-dark btn-sm" onClick={() => go("/hilfe")}>Hilfe</button>
          <button className="btn btn-ghost on-dark btn-sm" onClick={() => { setMenu(false); logout(); }}>Abmelden</button>
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
