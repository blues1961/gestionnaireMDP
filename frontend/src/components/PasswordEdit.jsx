import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { decryptPayload, encryptPayload } from '../utils/crypto'
import PasswordGenerator from './PasswordGenerator'
import { useToast } from './ToastProvider'
import CategorySelect from './CategorySelect'

async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text || ''); return true } catch {
    const ta = document.createElement('textarea'); ta.value = text || ''
    document.body.appendChild(ta); ta.select(); let ok=false
    try { ok = document.execCommand('copy') } catch {}
    document.body.removeChild(ta); return ok
  }
}

export default function PasswordEdit(){
  const toast = useToast()
  const navigate = useNavigate()
  const { id } = useParams()

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')

  const [copied, setCopied] = useState(null)
  const markCopied = (which, label) => { setCopied(which); toast.success(`${label} copié dans le presse-papiers`); setTimeout(() => setCopied(null), 1200) }
  const handleCopy = async (which, value, label) => { if (await copyToClipboard(value)) markCopied(which, label) }

  useEffect(() => {
    let mounted = true
    Promise.all([api.passwords.get(id), api.categories.list()])
      .then(async ([item, cats]) => {
        if (!mounted) return
        setCategories(cats || [])
        setCategoryId(item.category ?? '')
        setTitle(item.title || '')
        setUrl(item.url || '')
        try {
          const plain = await decryptPayload(item.ciphertext)
          setLogin(plain.login || '')
          setPassword(plain.password || '')
          setNotes(plain.notes || '')
        } catch {}
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
    return () => { mounted = false }
  }, [id])

  const normalizeUrl = (u) => {
    const t = (u || '').trim(); if (!t) return ''
    if (/^https?:\/\//i.test(t)) return t
    return `https://${t}`
  }

  const openUrl = () => { const withScheme = normalizeUrl(url); if(!withScheme) return; window.open(withScheme, '_blank', 'noopener,noreferrer') }

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError(null)
    try{
      const payload = await encryptPayload({ login, password, notes })
      await api.passwords.update(id, { title, url: normalizeUrl(url), category: categoryId || null, ciphertext: payload })
      toast.success('Entrée mise à jour'); navigate('/vault')
    }catch(err){ setError(String(err)) }
    finally{ setSaving(false) }
  }

  if (loading) {
    return (
      <main className="container">
        <div className="card"><p>Chargement…</p></div>
      </main>
    )
  }

  const urlFlash = copied==='url' ? ' input--flash' : ''
  const loginFlash = copied==='login' ? ' input--flash' : ''
  const passFlash  = copied==='password' ? ' input--flash' : ''
  const notesFlash = copied==='notes' ? ' textarea--flash' : ''

  const urlBtnOK = copied==='url' ? ' btn--success' : ''
  const loginBtnOK = copied==='login' ? ' btn--success' : ''
  const passBtnOK  = copied==='password' ? ' btn--success' : ''
  const notesBtnOK = copied==='notes' ? ' btn--success' : ''

  return (
    <main className="container">
      <section className="modal" aria-labelledby="edit-title">
        <header className="card__header">
          <div id="edit-title" style={{fontWeight:700}}>Modifier l’entrée</div>
          <button onClick={()=>navigate('/vault')} className="card__close" aria-label="Retour">✕</button>
        </header>

        {error && <p className="error" style={{whiteSpace:'pre-wrap', marginTop:0}}>{error}</p>}

        <form onSubmit={submit} className="form">
          <div className="form-row">
            <label className="label">Nom / Titre</label>
            <input className="input" value={title} onChange={e=>setTitle(e.target.value)} required />
            <span />
          </div>

          <div className="form-row">
            <label className="label">URL</label>
            <input className={`input${urlFlash}`} value={url} onChange={e=>setUrl(e.target.value)} placeholder="exemple.com ou https://exemple.com" />
            <div className="row">
              <button type="button" className="btn" onClick={openUrl} disabled={!url.trim()}>Ouvrir</button>
              <button type="button" className={`btn${urlBtnOK}`} onClick={()=>handleCopy('url', normalizeUrl(url), 'URL')}>
                {copied==='url' ? '✅ Copié !' : 'Copier'}
              </button>
            </div>
          </div>

          <div className="form-row form-row--noactions">
            <label className="label">Catégorie</label>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </div>

          <div className="form-row">
            <label className="label">Nom d’utilisateur</label>
            <input className={`input${loginFlash}`} value={login} onChange={e=>setLogin(e.target.value)} />
            <button type="button" className={`btn${loginBtnOK}`} onClick={()=>handleCopy('login', login, 'Nom d’utilisateur')}>
              {copied==='login' ? '✅ Copié !' : 'Copier'}
            </button>
          </div>

          <div className="form-row">
            <label className="label">Mot de passe</label>
            <input className={`input${passFlash}`} value={password} onChange={e=>setPassword(e.target.value)} />
            <button type="button" className={`btn${passBtnOK}`} onClick={()=>handleCopy('password', password, 'Mot de passe')}>
              {copied==='password' ? '✅ Copié !' : 'Copier'}
            </button>
          </div>

          <div style={{marginTop:12}}>
            <div className="muted small" style={{marginBottom:6}}>Notes</div>
            <textarea className={`textarea${notesFlash}`} value={notes} onChange={e=>setNotes(e.target.value)} />
            <div style={{marginTop:8}}>
              <button type="button" className={`btn${notesBtnOK}`} onClick={()=>handleCopy('notes', notes, 'Notes')}>
                {copied==='notes' ? '✅ Copié !' : 'Copier les notes'}
              </button>
            </div>
          </div>

          <div className="row" style={{marginTop:16, justifyContent:'flex-end'}}>
            <button type="button" className="btn" onClick={()=>navigate('/vault')}>Annuler</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>

        <div style={{marginTop:20}}>
          <PasswordGenerator onGenerate={setPassword} />
        </div>
      </section>
    </main>
  )
}