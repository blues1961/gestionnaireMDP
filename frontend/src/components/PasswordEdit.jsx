import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { encryptPayload, decryptPayload } from '../utils/crypto';
import PasswordGenerator from './PasswordGenerator';
import { useToast } from './ToastProvider';
import CategorySelect from './CategorySelect';

function classFlash(active, base) {
  return active ? `${base} ${base}--flash` : base;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text || '');
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text || '';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

export default function PasswordEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Métadonnées
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');

  // Secret (toujours visibles)
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');

  // Feedback “copié”
  const [copied, setCopied] = useState(null);
  const markCopied = (which, label) => {
    setCopied(which);
    toast.success(`${label} copié dans le presse-papiers`);
    setTimeout(() => setCopied(null), 1200);
  };
  const handleCopy = async (which, value, label) => {
    if (await copyToClipboard(value)) markCopied(which, label);
  };

  const numericId = Number(id);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id || Number.isNaN(numericId)) {
        setErr('Identifiant invalide');
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        // Récupère l’entrée (on s’appuie sur list() pour rester compatible)
        const all = await api.passwords.list();
        const item = Array.isArray(all) ? all.find(x => Number(x?.id) === numericId) : null;
        if (!item) throw new Error('Entrée introuvable');

        if (!alive) return;

        // Métadonnées
        setTitle(item.title || '');
        setUrl(item.url || '');
        setCategoryId(item.category ?? '');

        // Déchiffrement du secret (login/password/notes)
        try {
          if (item.ciphertext) {
            const secret = await decryptPayload(item.ciphertext); // gère { iv, salt, data }
            setLogin(secret?.login || '');
            setPassword(secret?.password || '');
            setNotes(secret?.notes || '');
          } else {
            setLogin('');
            setPassword('');
            setNotes('');
          }
        } catch (e) {
          console.warn('Déchiffrement impossible:', e);
          setLogin('');
          setPassword('');
          setNotes('');
        }
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || 'Erreur de chargement');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const normalizeUrl = (u) => {
    const trimmed = (u || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const openUrl = () => {
    const withScheme = normalizeUrl(url);
    if (!withScheme) return;
    window.open(withScheme, '_blank', 'noopener,noreferrer');
    toast.info('Ouverture de l’URL dans un nouvel onglet');
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!id || Number.isNaN(numericId)) {
      setErr('Identifiant invalide');
      return;
    }
    setErr(null);
    try {
      // On chiffre toujours login/password/notes
      const cipher = await encryptPayload({ login, password, notes });
      const payload = {
        title,
        url: normalizeUrl(url),
        category: categoryId || null,
        ciphertext: cipher
      };
      await api.passwords.update(numericId, payload);
      toast.success('Entrée mise à jour');
      navigate('/vault', { replace: true });
    } catch (e2) {
      setErr(e2?.body?.detail || e2?.message || 'Échec de la sauvegarde');
    }
  };

  if (loading) {
    return (
      <main className="container">
        <section className="modal">
          <div className="card">Chargement…</div>
        </section>
      </main>
    );
  }

  if (err) {
    return (
      <main className="container">
        <section className="modal">
          <p className="error">{String(err)}</p>
          <div className="row">
            <button className="btn btn--light" onClick={() => navigate('/vault')}>← Retour</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="modal" aria-labelledby="edit-title">
        <header className="card__header">
          <div id="edit-title" className="card__title">Modifier l’entrée</div>
          <button onClick={() => navigate('/vault')} className="card__close" aria-label="Retour">✕</button>
        </header>

        <form onSubmit={submit} className="form">
          {/* Titre */}
          <div className="form-row">
            <label className="label">Nom / Titre</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>

          {/* URL + actions */}
          <div className="form-row">
            <label className="label">URL</label>
            <input className={classFlash(copied === 'url', 'input')} value={url} onChange={e => setUrl(e.target.value)} placeholder="exemple.com ou https://exemple.com" />
            <div className="row">
              <button type="button" className="btn" onClick={openUrl} disabled={!url.trim()}>Ouvrir</button>
              <button type="button" className={`btn${copied === 'url' ? ' btn--success' : ''}`} onClick={() => handleCopy('url', normalizeUrl(url), 'URL')}>
                {copied === 'url' ? '✅ Copié !' : 'Copier'}
              </button>
            </div>
          </div>

          {/* Catégorie */}
          <div className="form-row form-row--noactions">
            <label className="label">Catégorie</label>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </div>

          {/* Login */}
          <div className="form-row">
            <label className="label">Nom d’utilisateur</label>
            <input className={classFlash(copied === 'login', 'input')} value={login} onChange={e => setLogin(e.target.value)} />
            <button type="button" className={`btn${copied === 'login' ? ' btn--success' : ''}`} onClick={() => handleCopy('login', login, 'Nom d’utilisateur')}>
              {copied === 'login' ? '✅ Copié !' : 'Copier'}
            </button>
          </div>

          {/* Mot de passe */}
          <div className="form-row">
            <label className="label">Mot de passe</label>
            <input className={classFlash(copied === 'password', 'input')} value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" className={`btn${copied === 'password' ? ' btn--success' : ''}`} onClick={() => handleCopy('password', password, 'Mot de passe')}>
              {copied === 'password' ? '✅ Copié !' : 'Copier'}
            </button>
          </div>

          {/* Notes */}
          <div className="form-row">
            <label className="label">Notes</label>
            <textarea className={classFlash(copied === 'notes', 'textarea')} value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
          
          </div>
          {/* Actions sous Notes */}
          <div className="notes-actions">
            <div className="left">
              <button
              type="button"
              className={`btn${copied === 'notes' ? ' btn--success' : ''}`}
              onClick={() => handleCopy('notes', notes, 'Notes')}
              >
                {copied === 'notes' ? '✅ Copié !' : 'Copier les notes'}
              </button>
            </div>
            <div className="right">
              <button
                type="button"
                className="btn btn--light"
                onClick={() => navigate('/vault')}
              >
                Annuler
             </button>
             <button type="submit" className="btn">
              Enregistrer
             </button>
            </div>
          </div>

        </form>

        {/* Générateur */}
        <div className="spacer">
          <PasswordGenerator onGenerate={setPassword} />
        </div>
      </section>
    </main>
  );
}
