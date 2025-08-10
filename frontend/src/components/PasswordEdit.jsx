import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { decryptPayload, encryptPayload } from '../utils/crypto'
import PasswordGenerator from './PasswordGenerator'
import { useToast } from './ToastProvider'

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

  const submit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { const msg="Le titre est requis"; setError(msg); toast.error(msg); return }
    if (!login.trim()) { const msg="Le nom d'utilisateur est requis"; setError(msg); toast.error(msg); return }

    setSaving(true)
    try {
      const safeUrl = normalizeUrl(url)
      // rechiffrage (login/password/notes)
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

  if (loading) return <main style={{maxWidth:720, margin:'5vh auto', fontFamily:'system-ui'}}>Chargement…</main>

  return (
    <main style={{maxWidth:720, margin:'5vh auto', fontFamily:'system-ui'}}>
      <h2>Modifier l’entrée</h2>

      {error && <p style={{color:'crimson', whiteSpace:'pre-wrap'}}>{error}</p>}

      <form onSubmit={submit}>
        <label>Nom / Titre<br/>
          <input value={title} onChange={e=>setTitle(e.target.value)} required />
        </label><br/>

        <label>URL<br/>
          <input
            value={url}
            onChange={e=>setUrl(e.target.value)}
            placeholder="https://exemple.com"
          />
        </label><br/>

        <label>Catégorie<br/>
          <select value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
            <option value="">(Aucune)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label><br/>

        <label>Nom d’utilisateur<br/>
          <input value={login} onChange={e=>setLogin(e.target.value)} required />
        </label><br/>

        <label>Mot de passe<br/>
          <input value={password} onChange={e=>setPassword(e.target.value)} />
        </label><br/>

        <label>Notes (chiffrées)<br/>
          <textarea
            value={notes}
            onChange={e=>setNotes(e.target.value)}
            rows={5}
            placeholder="Infos complémentaires…"
            style={{width:'100%'}}
          />
        </label><br/>

        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          <button type="button" onClick={()=>navigate('/vault')}>Annuler</button>
          <button
            type="button"
            onClick={async ()=>{
              if (!confirm('Supprimer cette entrée ?')) return
              try { await api.passwords.remove(id); toast.success('Entrée supprimée'); navigate('/vault') }
              catch(e){ toast.error(e?.message || 'Échec de la suppression') }
            }}
            style={{color:'#a00'}}
          >
            Supprimer
          </button>
        </div>
      </form>

      <div style={{marginTop:24}}>
        <PasswordGenerator onGenerate={setPassword} />
      </div>
    </main>
  )
}
