import React, { useEffect, useState } from 'react'
import { decryptPayload } from '../utils/crypto'
import { normalizeExternalUrl } from '../utils/url'
import { useToast } from './ToastProvider'
import KeyImportForm from './KeyImportForm'

async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text || ''); return true } catch {
    const ta = document.createElement('textarea'); ta.value = text || ''
    document.body.appendChild(ta); ta.select(); let ok=false
    try { ok = document.execCommand('copy') } catch {}
    document.body.removeChild(ta); return ok
  }
}

export default function RevealDialog({ item, onClose }) {
  const toast = useToast()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  const loadSecret = () => {
    let mounted = true
    setError(null)
    decryptPayload(item.ciphertext)
      .then(p => { if(!mounted) return; setLogin(p.login || ''); setPassword(p.password || ''); setNotes(p.notes || '') })
      .catch(() => { if (mounted) setError("Impossible de déchiffrer cette entrée avec la clé locale actuelle.") })
    return () => { mounted = false }
  }

  useEffect(() => {
    return loadSecret()
  }, [item])

  const markCopied = (which, label) => { setCopied(which); toast.success(`${label} copié dans le presse-papiers`); setTimeout(()=>setCopied(null), 1200) }
  const handleCopy = async (which, value, label) => { if (await copyToClipboard(value)) markCopied(which, label) }

  const openUrl = () => {
    const withScheme = normalizeExternalUrl(item.url)
    if (!withScheme) { toast.error('URL invalide'); return }
    window.open(withScheme, '_blank', 'noopener,noreferrer')
    toast.info('Ouverture de l’URL dans un nouvel onglet')
  }

  const loginFlash = copied==='login' ? ' input--flash' : ''
  const passFlash  = copied==='password' ? ' input--flash' : ''
  const notesFlash = copied==='notes' ? ' textarea--flash' : ''
  const loginBtnOK = copied==='login' ? ' btn--success' : ''
  const passBtnOK  = copied==='password' ? ' btn--success' : ''
  const notesBtnOK = copied==='notes' ? ' btn--success' : ''

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <header className="card__header">
          <div className="card__title">{item.title}</div>
          <button onClick={onClose} className="card__close" aria-label="Fermer">✕</button>
        </header>

        {error && (
          <div className="note">
            <p className="m-0">{error}</p>
            <p className="small mt-2">
              Réimporte le fichier de clé JSON correspondant, puis la lecture sera retentée automatiquement.
            </p>
            <KeyImportForm submitLabel="Réimporter la clé" onImported={loadSecret} />
          </div>
        )}

        <div className="form-row">
          <label className="label">Nom d’utilisateur</label>
          <input
            className={`input${loginFlash}`}
            value={login}
            readOnly
            aria-readonly="true"
            title="Lecture seule — utilisez le bouton Copier"
          />
          <button className={`btn${loginBtnOK}`} onClick={()=>handleCopy('login', login, 'Nom d’utilisateur')} aria-live="polite">
            {copied==='login' ? '✅ Copié !' : 'Copier'}
          </button>
        </div>

        <div className="form-row">
          <label className="label">Mot de passe</label>
          <input
            className={`input${passFlash}`}
            value={password}
            readOnly
            aria-readonly="true"
            title="Lecture seule — utilisez le bouton Copier"
          />
          <button className={`btn${passBtnOK}`} onClick={()=>handleCopy('password', password, 'Mot de passe')} aria-live="polite">
            {copied==='password' ? '✅ Copié !' : 'Copier'}
          </button>
        </div>

        <div className="mt-3">
          <div className="muted small mb-1">Notes</div>
          <textarea
            readOnly
            aria-readonly="true"
            title="Lecture seule — utilisez le bouton Copier"
            value={notes}
            className={`textarea${notesFlash}`}
          />
          <div className="mt-2">
            <button className={`btn${notesBtnOK}`} onClick={()=>handleCopy('notes', notes, 'Notes')}>
              {copied==='notes' ? '✅ Copié !' : 'Copier les notes'}
            </button>
          </div>
        </div>

        <div className="row mt-3">
          {item.url ? (
            <>
              <span className="dim small">URL:</span>
              <a href="#" onClick={(e)=>{e.preventDefault(); openUrl()}} className="link">{item.url}</a>
              <button className="btn" onClick={openUrl}>Ouvrir dans un onglet</button>
            </>
          ) : (
            <span className="dim small">(Pas d’URL)</span>
          )}
        </div>

        <div className="right mt-4">
          <button className="btn" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
