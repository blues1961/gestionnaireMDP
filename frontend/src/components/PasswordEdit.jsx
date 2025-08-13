import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { decryptPayload, encryptPayload } from '../utils/crypto'
import PasswordGenerator from './PasswordGenerator'
import { useToast } from './ToastProvider'
import CategorySelect from './CategorySelect'


// Utilitaire copie (reprend l’approche de RevealDialog)
async function copyToClipboard(text){
  try {
    await navigator.clipboard.writeText(text || '')
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text || ''
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
    return ok
  }
}

export default function PasswordEdit(){
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')

  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')

  // Pour feedback visuel sur la copie
  const [copied, setCopied] = useState(null) // 'login' | 'password' | 'notes' | 'url' | null
  const markCopied = (which, label) => {
    setCopied(which)
    toast.success(`${label} copié dans le presse-papiers`)
    setTimeout(() => setCopied(null), 1200)
  }
  const handleCopy = async (which, value, label) => {
    if (await copyToClipboard(value)) markCopied(which, label)
  }

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
        } catch {
          // si déchiffrement impossible, laisser vides
        }
        setLoading(false)
      })
      .catch(err => { if (mounted){ setError(String(err)); setLoading(false) }})
    return () => { mounted = false }
  }, [id])

  const normalizeUrl = (u) => {
    const trimmed = (u || '').trim()
    if (!trimmed) return ''                 // champ optionnel
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`             // auto-préfixe
  }

  const openUrl = () => {
    const withScheme = normalizeUrl(url)
    if(!withScheme) return
    window.open(withScheme, '_blank', 'noopener,noreferrer')
    toast.info('Ouverture de l’URL dans un nouvel onglet')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { const msg="Le titre est requis"; setError(msg); toast.error(msg); return }
    if (!login.trim()) { const msg="Le nom d’utilisateur est requis"; setError(msg); toast.error(msg); return }

    setSaving(true)
    try {
      const safeUrl = normalizeUrl(url)
      const newCipher = await encryptPayload({ login, password, notes })
      const payload = {
        title,
        url: safeUrl,
        ciphertext: newCipher,
        ...(categoryId ? { category: parseInt(categoryId,10) } : { category: null })
      }
      await api.passwords.update(id, payload)
      toast.success('Entrée enregistrée')
      navigate('/vault')
    } catch (err) {
      const msg = err?.message || 'Échec de l’enregistrement'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main style={pageStyles.wrap}>
        <div style={styles.modal}><p>Chargement…</p></div>
      </main>
    )
  }

  return (
    <main style={pageStyles.wrap}>
      <section style={styles.modal} aria-labelledby="edit-title">
        <header style={styles.header}>
          <div style={{fontWeight:700}} id="edit-title">Modifier l’entrée</div>
          <button onClick={()=>navigate('/vault')} style={styles.closeBtn} aria-label="Retour">✕</button>
        </header>

        {error && <p style={{color:'crimson', whiteSpace:'pre-wrap', marginTop:0}}>{error}</p>}

        <form onSubmit={submit}>
          <div style={styles.row}>
            <label style={styles.label}>Nom / Titre</label>
            <input
              style={styles.input}
              value={title}
              onChange={e=>setTitle(e.target.value)}
              required
            />
            <span />
          </div>

          <div style={styles.row}>
            <label style={styles.label}>URL</label>
            <input
              style={{...styles.input, ...(copied==='url'? styles.inputFlash : {})}}
              value={url}
              onChange={e=>setUrl(e.target.value)}
              placeholder="exemple.com ou https://exemple.com"
            />
            <div style={{display:'flex', gap:8}}>
              <button type="button" style={styles.btn} onClick={openUrl}>Ouvrir</button>
              <button type="button" style={{...styles.btn, ...(copied==='url'? styles.btnSuccess : {})}}
                onClick={()=>handleCopy('url', normalizeUrl(url), 'URL')}>
                {copied==='url' ? '✅ Copié !' : 'Copier'}
              </button>
            </div>
          </div>
          
          <div style={styles.row}>
            <label style={styles.label}>Catégorie</label>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
            <a href="/categories" style={{alignSelf:'center', fontSize:13}}>Gérer</a>
          </div>

         
          <div style={styles.row}>
            <label style={styles.label}>Nom d’utilisateur</label>
            <input
              style={{...styles.input, ...(copied==='login'? styles.inputFlash : {})}}
              value={login}
              onChange={e=>setLogin(e.target.value)}
              required
            />
            <button
              type="button"
              style={{...styles.btn, ...(copied==='login'? styles.btnSuccess : {})}}
              onClick={()=>handleCopy('login', login, 'Nom d’utilisateur')}
            >
              {copied==='login' ? '✅ Copié !' : 'Copier'}
            </button>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Mot de passe</label>
            <input
              style={{...styles.input, ...(copied==='password'? styles.inputFlash : {})}}
              value={password}
              onChange={e=>setPassword(e.target.value)}
            />
            <div style={{display:'flex', gap:8}}>
              <button
                type="button"
                style={{...styles.btn, ...(copied==='password'? styles.btnSuccess : {})}}
                onClick={()=>handleCopy('password', password, 'Mot de passe')}
              >
                {copied==='password' ? '✅ Copié !' : 'Copier'}
              </button>
            </div>
          </div>

          <div style={{marginTop:12}}>
            <div style={{color:'#bbb', fontSize:14, marginBottom:6}}>Notes (chiffrées)</div>
            <textarea
              value={notes}
              onChange={e=>setNotes(e.target.value)}
              style={{...styles.input, width:'100%', height:120, resize:'vertical', ...(copied==='notes'? styles.inputFlash : {})}}
              placeholder="Infos complémentaires…"
            />
            <div style={{marginTop:8, display:'flex', gap:8, flexWrap:'wrap'}}>
              <button
                type="button"
                style={{...styles.btn, ...(copied==='notes'? styles.btnSuccess : {})}}
                onClick={()=>handleCopy('notes', notes, 'Notes')}
              >
                {copied==='notes' ? '✅ Copié !' : 'Copier les notes'}
              </button>
            </div>
          </div>

          <div style={{display:'flex', gap:8, marginTop:16, flexWrap:'wrap', justifyContent:'flex-end'}}>
            <button type="button" style={styles.btn} onClick={()=>navigate('/vault')}>Annuler</button>
            <button
              type="button"
              style={{...styles.btn, color:'#f88', borderColor:'#5a2a2a', background:'#1c0f0f'}}
              onClick={async ()=>{
                if (!confirm('Supprimer cette entrée ?')) return
                try { await api.passwords.remove(id); toast.success('Entrée supprimée'); navigate('/vault') }
                catch(e){ toast.error(e?.message || 'Échec de la suppression') }
              }}
            >
              Supprimer
            </button>
            <button type="submit" style={styles.btn} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>

        <div style={{marginTop:20}}>
          <PasswordGenerator onGenerate={setPassword} />
        </div>
      </section>
    </main>
  )
}

const pageStyles = {
  wrap: {
    minHeight:'calc(100vh - 10vh)',
    padding:'5vh 0',
    background:'#000', // fond de page discret
    fontFamily:'system-ui'
  }
}

const styles = {
  // Styles repris/adaptés de RevealDialog
  modal: {
    width:'min(720px, 92vw)', background:'#111', color:'#eee',
    border:'1px solid #333', borderRadius:12, padding:16, margin:'0 auto',
    boxShadow:'0 10px 30px rgba(0,0,0,.4)'
  },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  closeBtn: { background:'transparent', border:'none', color:'#bbb', fontSize:18, cursor:'pointer' },
  row: { display:'grid', gridTemplateColumns:'140px 1fr auto', gap:8, alignItems:'center', margin:'8px 0' },
  label: { color:'#bbb', fontSize:14 },
  input: {
    width:'100%', padding:'8px 10px', background:'#0c0c0c',
    border:'1px solid #333', color:'#eee', borderRadius:8,
    transition:'box-shadow .25s, border-color .25s, background .25s'
  },
  inputFlash: {
    boxShadow:'0 0 0 2px rgba(34,197,94,.35)',
    borderColor:'rgba(34,197,94,.6)',
    background:'#0f1a12'
  },
  btn: { padding:'8px 10px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer' },
}
