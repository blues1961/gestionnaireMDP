// App.jsx
import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';

import { ensureKeyPair } from './utils/crypto';
import PasswordList from './components/PasswordList';
import PasswordForm from './components/PasswordForm';
import PasswordEdit from './components/PasswordEdit';
import CategoryGuide from './components/CategoryGuide';
import KeyBackup from './components/KeyBackup';
import KeyCheck from './components/KeyCheck';
import Help from './components/Help';
import LoginForm from './components/LoginForm';

import './styles.css';
import { api } from './api';

/* --- Petit hook pour connaître rapidement le statut d'auth --- */
function useAuthStatus() {
  const [status, setStatus] = useState('unknown'); // 'unknown' | 'authed' | 'guest'

  useEffect(() => {
    let alive = true;
    // Appel “léger” qui nécessite d’être connecté (adapter si besoin)
    api.categories
      .list()
      .then(() => alive && setStatus('authed'))
      .catch(() => alive && setStatus('guest'));
    return () => {
      alive = false;
    };
  }, []);

  return status;
}

function Private({ children }) {
  const status = useAuthStatus();
  if (status === 'unknown') return <p style={{ padding: 20 }}>Vérification d’accès…</p>;
  if (status === 'guest') return <Navigate to="/login" replace />;
  return children;
}

/* Si l’utilisateur est déjà connecté, ne lui montre pas /login */
function RedirectIfAuthed({ children }) {
  const status = useAuthStatus();
  if (status === 'unknown') return <p style={{ padding: 20 }}>Chargement…</p>;
  if (status === 'authed') return <Navigate to="/vault" replace />;
  return children;
}

export default function App() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const showHeader = pathname !== '/login';

  useEffect(() => {
    // S’assure que la paire de clés est prête (pas bloquant)
    ensureKeyPair().catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      // Si un endpoint logout existe côté API (sinon pas grave)
      if (api.logout) await api.logout();
    } catch {}
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    nav('/login', { replace: true });
  };

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      {showHeader && (
        <nav
          style={{
            display: 'flex',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid #eee',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ marginRight: 16, cursor: 'pointer' }} onClick={() => nav('/vault')}>
            Gestionnaire MDP
          </strong>
          <Link to="/category-guide">Catégories</Link>
          <Link to="/key-backup">Clé de chiffrement</Link>
          <Link to="/help">Aide</Link>
          <div style={{ flex: 1 }} />
          <button className="btn btn--light" onClick={handleLogout} title="Fermer la session">
            Se déconnecter
          </button>
        </nav>
      )}

      <Routes>
        <Route path="/" element={<Navigate to="/vault" replace />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginForm />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/vault"
          element={
            <Private>
              <PasswordList />
            </Private>
          }
        />
        <Route
          path="/new"
          element={
            <Private>
              <PasswordForm />
            </Private>
          }
        />
        <Route
          path="/edit/:id"
          element={
            <Private>
              <PasswordEdit />
            </Private>
          }
        />
        <Route
          path="/category-guide"
          element={
            <Private>
              <CategoryGuide />
            </Private>
          }
        />
        <Route
          path="/key-backup"
          element={
            <Private>
              <KeyBackup />
            </Private>
          }
        />
        <Route
          path="/key-check"
          element={
            <Private>
              <KeyCheck />
            </Private>
          }
        />
        <Route
          path="/help"
          element={
            <Private>
              <Help />
            </Private>
          }
        />
      </Routes>
    </div>
  );
}
