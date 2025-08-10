import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { encryptPayload } from '../utils/crypto'
import PasswordGenerator from './PasswordGenerator'
import { useToast } from './ToastProvider'

export default function PasswordForm(){
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('') // id ou ''
  const [loadingCats, setLoadingCats] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    api.categories.list()
      .then(cats => { if (mounted) { setCategories(cats); setLoadingCats(false) } })
      .catch(e => { if (mounted) { setError(String(e)); setLoadingCats(false) } })
    return () => { mounted = false }
  }, [])

  const normalizeUrl = (u) => {
    const trimmed = (u || '').trim()
    if (!trimmed) return ''            // champ optionnel
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`         // auto-préfixe
  }

  const submit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!title.trim())  { const msg = "Le titre est requis"; setError(msg); toast.error(msg); return }
    if (!login.trim())  { const msg = "Le nom d'utilisateur est requis"; setError(msg); toast.error(msg); return }

    const safeUrl = normalizeUrl(url)
    try {
      const ciphertext = await encryptPayload({ login, password, notes })
      const payload = { title, url: safeUrl, ciphertext }
      if (categoryId) payload.category = parseInt(categoryId, 10)

      await api.passwords.create(payload)
      toast.success('Entrée enregistrée')
      navigate('/vault')
    } catch (err) {
      const msg = err?.message || 'Échec de l’enregistrement'
      setError(msg)
      toast.error(msg)
    }
  }

  return (
    <main style={{maxWidth:720, margin:'5vh auto', fontFamily:'system-ui'}}>
      <h2>Nouvelle entrée</h2>

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
          <select
            value={categoryId}
            onChange={e=>setCategoryId(e.target.value)}
            disabled={loadingCats}
          >
            <option value="">(Aucune)</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label><br/>

        <label>Nom d'utilisateur<br/>
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
          <button type="submit">Enregistrer</button>
          <button type="button" onClick={()=>navigate('/vault')}>Annuler</button>
        </div>
      </form>

      <div style={{marginTop:24}}>
        <PasswordGenerator onGenerate={setPassword} />
      </div>

      <p style={{marginTop:16}}>
        Besoin d’une nouvelle catégorie ?
        {' '}<a href="/categories">Créer une catégorie</a>
      </p>
    </main>
  )
}
