// imports en haut :
import React, { useEffect } from 'react';
import { Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { ensureKeyPair } from './utils/crypto';
import PasswordList from './components/PasswordList';
import PasswordForm from './components/PasswordForm';
import PasswordEdit from './components/PasswordEdit';
import CategoryGuide from './components/CategoryGuide';
import KeyBackup from './components/KeyBackup';
import KeyCheck from './components/KeyCheck';
import Help from './components/Help';
import LoginForm from './components/LoginForm'; // ⬅️ manquait

import './styles.css';
import { api } from './api';

function Private({ children }){
  const [ok, setOk] = React.useState(null);
  useEffect(() => {
    api.categories.list()
      .then(() => setOk(true))
      .catch(() => setOk(false));
  }, []);
  if (ok === null) return <p style={{padding:20}}>Vérification d’accès…</p>;
  if (ok === false) return <Navigate to="/login" replace />;
  return children;
}

export default function App(){
  const nav = useNavigate();
  const { pathname } = useLocation();            // ⬅️ d’abord récupérer pathname
  const showHeader = pathname !== '/login';      // ⬅️ puis l’utiliser

  useEffect(() => { ensureKeyPair().catch(() => {}) }, []);

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    nav('/login', { replace: true });
  };

  return (
    <div style={{fontFamily:'system-ui'}}>
      {showHeader && (
        <nav style={{display:'flex', gap:12, padding:'10px 16px', borderBottom:'1px solid #eee', alignItems:'center', flexWrap:'wrap'}}>
          <strong style={{marginRight:16, cursor:'pointer'}} onClick={()=>nav('/vault')}>Gestionnaire MDP</strong>
          <Link to="/category-guide">Catégories</Link>
          <Link to="/key-backup">Clé de chiffrement</Link>
          <Link to="/help">Aide</Link>
          <div style={{flex:1}} />
          <button className="btn btn--light" onClick={handleLogout} title="Fermer la session">Se déconnecter</button>
        </nav>
      )}

      <Routes>
        <Route path="/" element={<Navigate to="/vault" replace />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="/vault" element={<Private><PasswordList/></Private>} />
        <Route path="/new" element={<Private><PasswordForm/></Private>} />
        <Route path="/edit/:id" element={<Private><PasswordEdit/></Private>} />
        <Route path="/category-guide" element={<Private><CategoryGuide/></Private>} />
        <Route path="/key-backup" element={<Private><KeyBackup/></Private>} />
        <Route path="/key-check" element={<Private><KeyCheck/></Private>} />
        <Route path="/help" element={<Private><Help/></Private>} />
      </Routes>
    </div>
  );
}
