import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, auth, User } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ClientDetail from "./pages/ClientDetail";

interface AuthCtx {
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => void;
}
const Ctx = createContext<AuthCtx>({ user: null, setUser: () => {}, logout: () => {} });
export const useAuth = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.token) {
      setLoading(false);
      return;
    }
    api.me().then(setUser).catch(() => auth.clear()).finally(() => setLoading(false));
  }, []);

  const logout = () => {
    auth.clear();
    setUser(null);
  };

  if (loading) return null;

  return (
    <Ctx.Provider value={{ user, setUser, logout }}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={user ? <Shell><Dashboard /></Shell> : <Navigate to="/login" />} />
        <Route
          path="/clients/:id"
          element={user ? <Shell><ClientDetail /></Shell> : <Navigate to="/login" />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Ctx.Provider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <div className="topbar">
        <span className="logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
          North<b>·</b>Lab Reporting
        </span>
        <div className="right">
          <span>{user?.email}</span>
          <button className="btn btn-ghost on-dark btn-sm" onClick={logout}>Abmelden</button>
        </div>
      </div>
      <div className="container">{children}</div>
    </>
  );
}
