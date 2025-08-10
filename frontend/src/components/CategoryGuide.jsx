import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { useNavigate } from 'react-router-dom'

export default function CategoryGuide(){
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true
    api.categories.list()
      .then(data => { if (mounted) setCats(data) })
      .catch(e => setErr(e?.message || 'Échec de chargement'))
      .finally(() => setLoading(false))
    return () => { mounted = false }
  }, [])

  if (loading) return <main style={{maxWidth:900, margin:'5vh auto', fontFamily:'system-ui'}}>Chargement…</main>
  if (err) return <main style={{maxWidth:900, margin:'5vh auto', fontFamily:'system-ui', color:'crimson'}}>{err}</main>

  return (
    <main style={{maxWidth:900, margin:'5vh auto', fontFamily:'system-ui'}}>
      <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
        <h2>Guide des catégories</h2>
        <button onClick={()=>navigate('/vault')} style={{padding:'8px 12px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer'}}>
          Retour à la voûte
        </button>
      </header>

      <p style={{color:'#555'}}>Liste de tes catégories, avec une suggestion d’utilisation.</p>

      <ul style={{listStyle:'none', padding:0, marginTop:16}}>
        {cats.map(c => (
          <li key={c.id} style={{border:'1px solid #eee', borderRadius:10, padding:16, marginBottom:12}}>
            <div style={{fontWeight:700, marginBottom:6}}>{c.name}</div>
            <div style={{whiteSpace:'pre-wrap', color:'#444'}}>{c.description || "(Pas de description)"}</div>
          </li>
        ))}
      </ul>
    </main>
  )
}
