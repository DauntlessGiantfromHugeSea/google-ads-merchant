import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, auth, User } from "./api";
import Login from "./pages/Login";
import NotificationBell from "./components/NotificationBell";

// Route-basiertes Code-Splitting: nur die tatsächlich geöffnete Seite wird geladen.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Vault = lazy(() => import("./pages/Vault"));
const Reveal = lazy(() => import("./pages/Reveal"));
const RequestSubmit = lazy(() => import("./pages/RequestSubmit"));
const Planner = lazy(() => import("./pages/Planner"));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage"));
const SeoPage = lazy(() => import("./pages/SeoPage"));
const Forms = lazy(() => import("./pages/Forms"));
const Intake = lazy(() => import("./pages/Intake"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const Angebot = lazy(() => import("./pages/Angebot"));
const Help = lazy(() => import("./pages/Help"));
const Account = lazy(() => import("./pages/Account"));
const Briefing = lazy(() => import("./pages/Briefing"));
const Vertrag = lazy(() => import("./pages/Vertrag"));
const Crm = lazy(() => import("./pages/Crm"));
const Sales = lazy(() => import("./pages/Sales"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Zeit = lazy(() => import("./pages/Zeit"));
const Dateien = lazy(() => import("./pages/Dateien"));
const Briefe = lazy(() => import("./pages/Briefe"));
const Upload = lazy(() => import("./pages/Upload"));
const AiTransparency = lazy(() => import("./pages/AiTransparency"));
const WpMonitor = lazy(() => import("./pages/WpMonitor"));

function Splash() {
  return <div className="boot-splash"><div className="boot-spinner" /></div>;
}

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

  // Sicherheits-Timeout: nach 30 Min ohne Aktivität automatisch abmelden.
  useEffect(() => {
    if (!user) return;
    const IDLE_MS = 30 * 60 * 1000;
    let timer: number;
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(logout, IDLE_MS); };
    const evts = ["mousedown", "keydown", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { window.clearTimeout(timer); evts.forEach((e) => window.removeEventListener(e, reset)); };
  }, [user]);

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

  if (loading) return <Splash />;

  return (
    <Ctx.Provider value={{ user, setUser, logout, impersonating, startImpersonate, stopImpersonate }}>
      <Suspense fallback={<Splash />}>
      <Routes>
        {/* Öffentlich (ohne Login): Geheimnis abrufen bzw. einreichen */}
        <Route path="/s/:id" element={<Reveal />} />
        <Route path="/req/:id" element={<RequestSubmit />} />
        <Route path="/intake/:id" element={<Intake />} />
        <Route path="/briefing/:id" element={<Briefing />} />
        <Route path="/einladung/:token" element={<SetPassword />} />
        <Route path="/angebot/:token" element={<Angebot />} />
        <Route path="/upload/:token" element={<Upload />} />
        <Route path="/vertrag/:token" element={<Vertrag />} />
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={user ? <Shell><Dashboard /></Shell> : <Navigate to="/login" />} />
        <Route path="/clients/:id" element={user ? <Shell><ClientDetail /></Shell> : <Navigate to="/login" />} />
        <Route path="/settings" element={user?.role === "agency_admin" ? <Shell><Settings /></Shell> : <Navigate to="/" />} />
        <Route path="/vault" element={user ? <Shell><Vault /></Shell> : <Navigate to="/login" />} />
        <Route path="/planner" element={user && user.role !== "client_user" ? <Shell><Planner /></Shell> : <Navigate to="/" />} />
        <Route path="/crm" element={user && user.role !== "client_user" ? <Shell><Crm /></Shell> : <Navigate to="/" />} />
        <Route path="/sales" element={user && user.role !== "client_user" ? <Shell><Sales /></Shell> : <Navigate to="/" />} />
        <Route path="/rechnungen" element={user && user.role !== "client_user" ? <Shell><Invoices /></Shell> : <Navigate to="/" />} />
        <Route path="/zeit" element={user && user.role !== "client_user" ? <Shell><Zeit /></Shell> : <Navigate to="/" />} />
        <Route path="/dateien" element={user && user.role !== "client_user" ? <Shell><Dateien /></Shell> : <Navigate to="/" />} />
        <Route path="/dateien/:id" element={user && user.role !== "client_user" ? <Shell><Dateien /></Shell> : <Navigate to="/" />} />
        <Route path="/briefe" element={user && user.role !== "client_user" ? <Shell><Briefe /></Shell> : <Navigate to="/" />} />
        <Route path="/briefe/:id" element={user && user.role !== "client_user" ? <Shell><Briefe /></Shell> : <Navigate to="/" />} />
        <Route path="/monitoring" element={user && user.role !== "client_user" ? <Shell><MonitoringPage /></Shell> : <Navigate to="/" />} />
        <Route path="/seo" element={user && user.role !== "client_user" ? <Shell><SeoPage /></Shell> : <Navigate to="/" />} />
        <Route path="/wp" element={user && user.role !== "client_user" ? <Shell><WpMonitor /></Shell> : <Navigate to="/" />} />
        <Route path="/projects" element={<Navigate to="/planner" />} />
        <Route path="/tasks" element={<Navigate to="/planner" />} />
        <Route path="/forms" element={user && user.role !== "client_user" ? <Shell><Forms /></Shell> : <Navigate to="/" />} />
        <Route path="/hilfe" element={user ? <Shell><Help /></Shell> : <Navigate to="/login" />} />
        <Route path="/ki-transparenz" element={user && user.role !== "client_user" ? <Shell><AiTransparency /></Shell> : <Navigate to="/" />} />
        <Route path="/konto" element={user ? <Shell><Account /></Shell> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </Suspense>
    </Ctx.Provider>
  );
}

// Gruppen-Dropdown in der Topbar – bündelt verwandte Bereiche, damit die
// Leiste schlank bleibt.
function NavGroup({ label, items, go }: { label: string; items: { label: string; path: string }[]; go: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="user-menu">
      <button className="btn btn-ghost on-dark btn-sm" onClick={() => setOpen((v) => !v)}>{label} ▾</button>
      {open && (
        <>
          <div className="user-backdrop" onClick={() => setOpen(false)} />
          <div className="user-dropdown nav-dropdown">
            {items.map((it) => (
              <button key={it.path} onClick={() => { setOpen(false); go(it.path); }}>{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout, impersonating, stopImpersonate } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const go = (path: string) => { setMenu(false); setUserMenu(false); navigate(path); };
  const isAgency = user?.role !== "client_user";
  const initials = (user?.full_name || user?.email || "?").slice(0, 2).toUpperCase();
  return (
    <>
      <div className="topbar">
        <span className="logo" onClick={() => go("/")} style={{ cursor: "pointer" }}>North<b> </b>Flow</span>
        <button className="menu-toggle" aria-label="Menü" onClick={() => setMenu((m) => !m)}>
          {menu ? "✕" : "☰"}
        </button>
        <div className={`right ${menu ? "open" : ""}`}>
          {/* Primäre Navigation – kurz gehalten */}
          <button className="btn btn-ghost on-dark btn-sm" onClick={() => go("/")}>Kunden</button>
          {isAgency && (
            <>
              <NavGroup label="Vertrieb" go={go} items={[
                { label: "CRM / Pipeline", path: "/crm" },
                { label: "Sales / Gap-Analyse", path: "/sales" },
                { label: "Rechnungen", path: "/rechnungen" },
              ]} />
              <NavGroup label="Arbeit" go={go} items={[
                { label: "Planner", path: "/planner" },
                { label: "Zeiterfassung", path: "/zeit" },
              ]} />
              <NavGroup label="Inhalte" go={go} items={[
                { label: "Dateien", path: "/dateien" },
                { label: "Briefe & Reports", path: "/briefe" },
                { label: "Formulare", path: "/forms" },
              ]} />
              <NavGroup label="Analyse" go={go} items={[
                { label: "Monitoring", path: "/monitoring" },
                { label: "SEO", path: "/seo" },
                { label: "WordPress-Updates", path: "/wp" },
              ]} />
            </>
          )}
          <NotificationBell />
          {/* Alles Sekundäre im Nutzer-Menü */}
          <div className="user-menu">
            <button className="user-btn" onClick={() => setUserMenu((v) => !v)} aria-label="Konto">
              <span className="avatar avatar-sm">{initials}</span>
              <span className="user-btn-caret">▾</span>
            </button>
            {userMenu && (
              <>
                <div className="user-backdrop" onClick={() => setUserMenu(false)} />
                <div className="user-dropdown">
                  <div className="user-dropdown-email">{user?.email}</div>
                  <button onClick={() => go("/konto")}>👤 Mein Konto &amp; 2FA</button>
                  <button onClick={() => go("/vault")}>🔑 Passwort-Safe</button>
                  <button onClick={() => go("/hilfe")}>❓ Hilfe</button>
                  {user?.role !== "client_user" && (
                    <button onClick={() => go("/ki-transparenz")}>🧾 KI-Transparenz</button>
                  )}
                  {user?.role === "agency_admin" && (
                    <button onClick={() => go("/settings")}>⚙️ Einstellungen</button>
                  )}
                  <div className="user-dropdown-sep" />
                  <button onClick={() => { setUserMenu(false); setMenu(false); logout(); }}>↩ Abmelden</button>
                </div>
              </>
            )}
          </div>
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
