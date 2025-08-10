import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { decryptPayload } from '../utils/crypto'
import RevealDialog from './RevealDialog'
import { useToast } from './ToastProvider'

export default function PasswordList(){
  const toast = useToast()
  const [list, setList] = useState([])
  const [plainIndex, setPlainIndex] = useState({}) // id -> {login,password,notes}
  const [catById, setCatById] = useState({})
  const [q, setQ] = useState('')
  const [err, setErr] = useState(null)
  const [revealItem, setRevealItem] = useState(null)

  useEffect(() => {
    api.passwords.list().then(async (items) => {
      setList(items)
      const index = {}
      for (const it of items) {
        try {
          const p = await decryptPayload(it.ciphertext)
          index[it.id] = {
            login: (p.login || '').toLowerCase(),
            password: p.password || '',
            notes: (p.notes || '').toLowerCase()
          }
        } catch {}
      }
      setPlainIndex(index)
    }).catch(e => setErr(String(e)))
  }, [])

  useEffect(() => {
    api.categories.list().then((cats) => {
      const map = {}
      for (const c of cats) map[c.id] = c.name
      setCatById(map)
    }).catch(e => setErr(String(e)))
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return list
    return list.filter(it => {
      const inTitle = it.title.toLowerCase().includes(s)
      const inUrl = (it.url || '').toLowerCase().includes(s)
      const inLogin = plainIndex[it.id]?.login?.includes(s)
      const inNotes = plainIndex[it.id]?.notes?.includes(s)
      const inCategory = (catById[it.category] || '').toLowerCase().includes(s)
      return inTitle || inUrl || inLogin || inNotes || inCategory
    })
  }, [list, q, plainIndex, catById])

  const remove = async (id) => {
    if (!confirm('Supprimer cette entrée ? Cette action est définitive.')) return
    try {
      await api.passwords.remove(id)
      setList(prev => prev.filter(x => x.id !== id))
      setPlainIndex(prev => { const p = { ...prev }; delete p[id]; return p })
      toast.success('Entrée supprimée')
    } catch (e) {
      toast.error(e?.message || 'Échec de la suppression')
    }
  }

  return (
    <main style={{maxWidth:960, margin:'5vh auto', fontFamily:'system-ui'}}>
      <header style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
        <h2 style={{flex:1, minWidth:200}}>Mes mots de passe</h2>
        <Link to="/category-guide">Guide des catégories</Link>
        <Link to="/new">Ajouter</Link>
      </header>

      {err && <p style={{color:'crimson', whiteSpace:'pre-wrap'}}>{err}</p>}

      <input
        placeholder="Recherche (titre, URL, login, notes, catégorie)…"
        value={q}
        onChange={e=>setQ(e.target.value)}
        style={{width:'100%', padding:8, margin:'12px 0'}}
      />

      <ul style={{listStyle:'none', padding:0}}>
        {filtered.map(item => {
          const catName = catById[item.category] || '(Aucune)'
          return (
            <li key={item.id} style={{border:'1px solid #eee', padding:12, borderRadius:8, marginBottom:8}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600}}>{item.title}</div>
                  <div style={{display:'flex', gap:8, alignItems:'center', color:'#555', flexWrap:'wrap'}}>
                    {item.url && <small>{item.url}</small>}
                    <small>• Catégorie: {catName}</small>
                  </div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <Link to={`/edit/${item.id}`}>Modifier</Link>
                  <button onClick={()=>setRevealItem(item)}>Révéler</button>
                  <button onClick={()=>remove(item.id)} style={{color:'#a00'}}>Supprimer</button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {revealItem && (
        <RevealDialog item={revealItem} onClose={()=>setRevealItem(null)} />
      )}
    </main>
  )
}
