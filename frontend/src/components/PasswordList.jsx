import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { decryptPayload } from '../utils/crypto'
import RevealDialog from './RevealDialog'
import { useToast } from './ToastProvider'
import { useNavigate } from "react-router-dom";


export default function PasswordList(){
  const toast = useToast()
  const [list, setList] = useState([])
  const [plainIndex, setPlainIndex] = useState({}) // id -> {login,password,notes}
  const [catById, setCatById] = useState({})
  const [q, setQ] = useState('')
  const [err, setErr] = useState(null)
  const [revealItem, setRevealItem] = useState(null)
  const navigate = useNavigate();


  // Charger mots de passe + index déchiffré (pour recherche locale)
  useEffect(() => {
    api.passwords.list()
      .then(async (items) => {
        setList(items || [])
        const index = {}
        for (const it of items || []) {
          try {
            const p = await decryptPayload(it.ciphertext)
            index[it.id] = {
              login: (p.login || '').toLowerCase(),
              password: p.password || '',
              notes: (p.notes || '').toLowerCase()
            }
          } catch {/* ignore */}
        }
        setPlainIndex(index)
      })
      .catch(e => setErr(String(e)))
  }, [])

  // Charger catégories (id -> nom)
  useEffect(() => {
    api.categories.list()
      .then((cats) => {
        const map = {}
        for (const c of cats || []) map[c.id] = c.name
        setCatById(map)
      })
      .catch(e => setErr(String(e)))
  }, [])

  // Tri par nom/titre (accents FR) + filtre recherche
  const filteredSorted = useMemo(() => {
    // tri d'abord
    const sorted = [...(list || [])].sort((a, b) => {
      const an = (a.title || '').toString()
      const bn = (b.title || '').toString()
      const cmp = an.localeCompare(bn, 'fr', { sensitivity: 'base' })
      if (cmp !== 0) return cmp
      // clé secondaire pour stabilité
      return (a.id || 0) - (b.id || 0)
    })
    // puis filtre recherche
    const s = q.trim().toLowerCase()
    if (!s) return sorted
    return sorted.filter(it => {
      const inTitle = (it.title || '').toLowerCase().includes(s)
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
      <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
          <h2 style={{margin:0}}>Mes mots de passe</h2>

          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <button
              onClick={() => navigate('/new')} // ← ajuste la route si besoin (/add ?)
              style={{
              padding:"8px 12px",
              borderRadius:8,
              border:"1px solid #e5e7eb",
              background:"#1a1a1a",
              color:"#eee",
              cursor:"pointer"
              }}
              title="Créer une nouvelle entrée"
            >
            Ajouter
          </button>

          <button
            onClick={() => navigate("/key-check")}
            style={{
              padding:"8px 12px",
              borderRadius:8,
              border:"1px solid #e5e7eb",
              background:"#fff",
              cursor:"pointer"
            }}
            title="Tester que votre clé importée peut déchiffrer les entrées existantes"
            >
            Vérifier ma clé
          </button>
        </div>
      </header>


      <input
        placeholder="Recherche (titre, URL, login, notes, catégorie)…"
        value={q}
        onChange={e=>setQ(e.target.value)}
        style={{width:'100%', padding:8, margin:'12px 0'}}
      />
      


      <ul style={{listStyle:'none', padding:0}}>
        {filteredSorted.map(item => {
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
                 <button type="button" onClick={()=>navigate(`/edit/${item.id}`)}>
                    Modifier
                 </button>
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
