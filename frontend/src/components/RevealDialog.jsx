import React, { useEffect, useState } from 'react'
import { decryptPayload } from '../utils/crypto'
import { useToast } from './ToastProvider'

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

  useEffect(() => {
    let mounted = true
    decryptPayload(item.ciphertext)
      .then(p => { if(!mounted) return; setLogin(p.login || ''); setPassword(p.password || ''); setNotes(p.notes || '') })
      .catch(() => setError("Impossible de déchiffrer cette entrée."))
    return () => { mounted = false }
  }, [item])

  const markCopied = (which, label) => { setCopied(which); toast.success(`${label} copié dans le presse-papiers`); setTimeout(()=>setCopied(null), 1200) }
  const handleCopy = async (which, value, label) => { if (await copyToClipboard(value)) markCopied(which, label) }

  const openUrl = () => {
    const url = (item.url || '').trim(); if(!url) return
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`
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
          <div style={{fontWeight:700}}>{item.title}</div>
          <button onClick={onClose} className="card__close" aria-label="Fermer">✕</button>
        </header>

        {error && <p className="error">{error}</p>}

        <div className="form-row">
          <label className="label">Nom d’utilisateur</label>
          <input className={`input${loginFlash}`} value={login} readOnly />
          <button className={`btn${loginBtnOK}`} onClick={()=>handleCopy('login', login, 'Nom d’utilisateur')} aria-live="polite">
            {copied==='login' ? '✅ Copié !' : 'Copier'}
          </button>
        </div>

        <div className="form-row">
          <label className="label">Mot de passe</label>
          <input className={`input${passFlash}`} value={password} readOnly />
          <button className={`btn${passBtnOK}`} onClick={()=>handleCopy('password', password, 'Mot de passe')} aria-live="polite">
            {copied==='password' ? '✅ Copié !' : 'Copier'}
          </button>
        </div>

        <div style={{marginTop:12}}>
          <div className="muted small" style={{marginBottom:6}}>Notes</div>
          <textarea readOnly value={notes} className={`textarea${notesFlash}`} />
          <div style={{marginTop:8}}>
            <button className={`btn${notesBtnOK}`} onClick={()=>handleCopy('notes', notes, 'Notes')}>
              {copied==='notes' ? '✅ Copié !' : 'Copier les notes'}
            </button>
          </div>
        </div>

        <div className="row" style={{marginTop:12}}>
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

        <div className="right" style={{marginTop:16}}>
          <button className="btn" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}