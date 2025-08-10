// frontend/src/components/CategoryManager.jsx
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useToast } from './ToastProvider'

export default function CategoryManager(){
  const toast = useToast()
  const navigate = useNavigate()
  const [cats, setCats] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const inputRef = useRef(null)

  const refresh = async () => {
    setErr(null)
    try {
      const data = await api.categories.list()
      setCats(data)
    } catch (e) {
      const msg = e?.message || 'Échec de chargement des catégories'
      setErr(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const add = async (e) => {
    e?.preventDefault?.()
    const n = (name || '').trim()
    if (!n) { toast.error('Nom de catégorie requis'); inputRef.current?.focus(); return }
    try {
      await api.categories.create(n)
      setName('')
      toast.success('Catégorie créée')
      await refresh()
      inputRef.current?.focus()
    } catch (e) {
      toast.error(e?.message || 'Échec de création')
    }
  }

  const cancel = () => {
    setName('')
    inputRef.current?.focus()
    toast.info('Saisie annulée')
  }

  return (
    <main style={{maxWidth:640, margin:'5vh auto', fontFamily:'system-ui'}}>
      <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
        <h2>Catégories</h2>
        <button
          onClick={()=>navigate('/vault')}
          style={{padding:'8px 12px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer'}}
        >
          Retour à la voûte
        </button>
      </header>

      {err && <p style={{color:'crimson', whiteSpace:'pre-wrap'}}>{err}</p>}

      <form onSubmit={add} style={{display:'flex', gap:8, marginBottom:12, flexWrap:'wrap'}}>
        <input
          ref={inputRef}
          value={name}
          onChange={e=>setName(e.target.value)}
          placeholder="Nouvelle catégorie"
          aria-label="Nom de la catégorie"
          style={{flex:'1 1 260px', padding:8}}
        />
        <div style={{display:'flex', gap:8}}>
          <button type="submit">Ajouter</button>
          <button type="button" onClick={cancel}>Annuler</button>
        </div>
      </form>

      {loading ? (
        <p>Chargement…</p>
      ) : (
        <ul style={{paddingLeft:18}}>
          {cats.map(c => <li key={c.id}>{c.name}</li>)}
          {cats.length === 0 && <li style={{color:'#666'}}>Aucune catégorie pour le moment.</li>}
        </ul>
      )}
    </main>
  )
}
