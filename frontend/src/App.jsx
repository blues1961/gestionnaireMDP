import React, { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
} from "react-router-dom";
import LoginForm from "./components/LoginForm";
import PasswordList from "./components/PasswordList";
import PasswordForm from "./components/PasswordForm";
import PasswordEdit from "./components/PasswordEdit";
import KeyCheck from "./components/KeyCheck";
import KeyBackup from "./components/KeyBackup";
import CategoryGuide from "./components/CategoryGuide";
import { setAccessToken } from "./api";
import monSiteSymbol from "./assets/mon-site-symbol.png";

// Nom d'application injecté via Vite/env
const APP_NAME = String(import.meta?.env?.APP_NAME || import.meta?.env?.VITE_APP_NAME || '').trim() || 'Gestionnaire MDP';

// Source unique de vérité pour l'access token
function getStoredAccessToken() {
  try {
    const jwt = JSON.parse(localStorage.getItem("mdp.jwt") || "null");
    return jwt?.access || localStorage.getItem("token") || null; // compat fallback
  } catch {
    return localStorage.getItem("token") || null; // compat fallback
  }
}

// Garde d'auth simple (token en localStorage)
function RequireAuth({ children }) {
  const token = getStoredAccessToken();
  useEffect(() => {
    setAccessToken(token || null);
  }, [token]);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function NavBar() {
  const navigate = useNavigate();
  const onLogout = () => {
    localStorage.removeItem("mdp.jwt");
    localStorage.removeItem("token"); // compat: purge ancienne clé
    setAccessToken(null);
    navigate("/login", { replace: true });
  };
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link
          to="/vault"
          className="brand"
          aria-label={`Accueil ${APP_NAME}`}
        >
          <img src={monSiteSymbol} alt="mon-site.ca" className="brand__logo" />
          <span className="brand__name">{APP_NAME}</span>
        </Link>
        <nav className="topnav">
          <Link to="/vault/categories" className="link">Catégories</Link>
          <Link to="/vault/key-check" className="link">Vérif clé</Link>
          <Link to="/vault/key-backup" className="link">Sauvegarde clé</Link>
        </nav>
        <div className="topbar__right">
          <button onClick={onLogout} className="btn btn--light">Se déconnecter</button>
        </div>
      </div>
    </header>
  );
}

function VaultPage() {
  return (
    <div className="app-shell">
      <NavBar />
      <PasswordList />
    </div>
  );
}

function CategoryGuidePage() {
  return (
    <div className="app-shell">
      <NavBar />
      <CategoryGuide />
    </div>
  );
}

function KeyCheckPage() {
  return (
    <div className="app-shell">
      <NavBar />
      <KeyCheck />
    </div>
  );
}

function KeyBackupPage() {
  return (
    <div className="app-shell">
      <NavBar />
      <KeyBackup />
    </div>
  );
}

function PasswordFormPage() {
  return (
    <div className="app-shell">
      <NavBar />
      <PasswordForm />
    </div>
  );
}

function PasswordEditPage() {
  return (
    <div className="app-shell">
      <NavBar />
      <PasswordEdit />
    </div>
  );
}

function LoginPage() {
  return (
    <div className="page login-page">
      <LoginForm appName={APP_NAME} />
    </div>
  );
}

export default function App() {
  // Arme le header Authorization si un token existe déjà
  useEffect(() => {
    const token = getStoredAccessToken();
    if (token) setAccessToken(token);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/vault"
          element={
            <RequireAuth>
              <VaultPage />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/new"
          element={
            <RequireAuth>
              <PasswordFormPage />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/:id/edit"
          element={
            <RequireAuth>
              <PasswordEditPage />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/key-check"
          element={
            <RequireAuth>
              <KeyCheckPage />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/key-backup"
          element={
            <RequireAuth>
              <KeyBackupPage />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/categories"
          element={
            <RequireAuth>
              <CategoryGuidePage />
            </RequireAuth>
          }
        />
        {/* défaut -> /vault si connecté, sinon /login */}
        <Route
          path="*"
          element={
            getStoredAccessToken()
              ? <Navigate to="/vault" replace />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
