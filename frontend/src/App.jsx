import React, { useEffect, useState } from "react";
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
import ThemeToggle from "./components/ThemeToggle";
import { setAccessToken } from "./api";
import monSiteLogo from "./assets/mon-site-logo.png";

// Nom d'application injecté via Vite/env
const APP_NAME = String(import.meta?.env?.APP_NAME || import.meta?.env?.VITE_APP_NAME || '').trim() || 'Gestionnaire MDP';
const THEME_KEY = "mdp_theme";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

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

function NavBar({ theme, onThemeChange }) {
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
          <img src={monSiteLogo} alt="mon-site.ca" className="brand__logo" />
          <span className="brand__name">{APP_NAME}</span>
        </Link>
        <nav className="topnav">
          <Link to="/vault/categories" className="link">Catégories</Link>
          <Link to="/vault/key-check" className="link">Vérif clé</Link>
          <Link to="/vault/key-backup" className="link">Sauvegarde clé</Link>
        </nav>
        <div className="topbar__right row">
          <ThemeToggle theme={theme} onChange={onThemeChange} />
          <button onClick={onLogout} className="btn btn--light">Se déconnecter</button>
        </div>
      </div>
    </header>
  );
}

function VaultPage({ theme, onThemeChange }) {
  return (
    <div className="app-shell">
      <NavBar theme={theme} onThemeChange={onThemeChange} />
      <PasswordList />
    </div>
  );
}

function CategoryGuidePage({ theme, onThemeChange }) {
  return (
    <div className="app-shell">
      <NavBar theme={theme} onThemeChange={onThemeChange} />
      <CategoryGuide />
    </div>
  );
}

function KeyCheckPage({ theme, onThemeChange }) {
  return (
    <div className="app-shell">
      <NavBar theme={theme} onThemeChange={onThemeChange} />
      <KeyCheck />
    </div>
  );
}

function KeyBackupPage({ theme, onThemeChange }) {
  return (
    <div className="app-shell">
      <NavBar theme={theme} onThemeChange={onThemeChange} />
      <KeyBackup />
    </div>
  );
}

function PasswordFormPage({ theme, onThemeChange }) {
  return (
    <div className="app-shell">
      <NavBar theme={theme} onThemeChange={onThemeChange} />
      <PasswordForm />
    </div>
  );
}

function PasswordEditPage({ theme, onThemeChange }) {
  return (
    <div className="app-shell">
      <NavBar theme={theme} onThemeChange={onThemeChange} />
      <PasswordEdit />
    </div>
  );
}

function LoginPage({ theme, onThemeChange }) {
  return (
    <div className="page login-page">
      <LoginForm appName={APP_NAME} theme={theme} onThemeChange={onThemeChange} />
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Arme le header Authorization si un token existe déjà
  useEffect(() => {
    const token = getStoredAccessToken();
    if (token) setAccessToken(token);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage theme={theme} onThemeChange={setTheme} />} />
        <Route
          path="/vault"
          element={
            <RequireAuth>
              <VaultPage theme={theme} onThemeChange={setTheme} />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/new"
          element={
            <RequireAuth>
              <PasswordFormPage theme={theme} onThemeChange={setTheme} />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/:id/edit"
          element={
            <RequireAuth>
              <PasswordEditPage theme={theme} onThemeChange={setTheme} />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/key-check"
          element={
            <RequireAuth>
              <KeyCheckPage theme={theme} onThemeChange={setTheme} />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/key-backup"
          element={
            <RequireAuth>
              <KeyBackupPage theme={theme} onThemeChange={setTheme} />
            </RequireAuth>
          }
        />
        <Route
          path="/vault/categories"
          element={
            <RequireAuth>
              <CategoryGuidePage theme={theme} onThemeChange={setTheme} />
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
