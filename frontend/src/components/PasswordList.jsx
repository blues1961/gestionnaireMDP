import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { decryptPayload } from '../utils/crypto'
import RevealDialog from './RevealDialog'
import { useToast } from './ToastProvider'
import { useNavigate } from 'react-router-dom'

export default function PasswordList(){
  const toast = useToast()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [plainIndex, setPlainIndex] = useState({})
  const [catById, setCatById] = useState({})
  const [q, setQ] = useState('')
  const [err, setErr] = useState(null)
  const [revealItem, setRevealItem] = useState(null)

  useEffect(() => {
    api.passwords.list()
      .then(async (items) => {
        setList(items || [])
        const index = {}
        for (const it of items || []) {
          try {
            const p = await decryptPayload(it.ciphertext)
            index[it.id] = { login: p.login||'', password: p.password||'', notes: p.notes||'' }
          } catch {}
        }
        setPlainIndex(index)
      })
      .catch(e => setErr(String(e)))
  }, [])

  useEffect(() => {
    api.categories.list()
      .then((cats) => {
        const map = {}
        for (const c of cats || []) map[c.id] = c.name
        setCatById(map)
      })
      .catch(e => setErr(String(e)))
  }, [])

  // --- RECHERCHE élargie: titre, url, username, catégorie, notes (décryptées)
  const filteredSorted = useMemo(() => {
    const normalize = (s) =>
      (s ?? '').toString()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()

    const sorted = [...(list || [])].sort((a, b) => {
      const an = (a.title || '').toString()
      const bn = (b.title || '').toString()
      const cmp = an.localeCompare(bn, 'fr', { sensitivity: 'base' })
      if (cmp !== 0) return cmp
      return (a.id || 0) - (b.id || 0)
    })

    const needle = normalize(q || '')
    if (!needle) return sorted

    return sorted.filter((it) => {
      const categoryName = catById[it.category] || ''
      const notes = plainIndex[it.id]?.notes || ''
      const haystack = [
        it.title,
        it.url,
        it.username,
        categoryName,
        notes,
      ].map(normalize).join(' ')
      return haystack.includes(needle)
    })
  }, [list, q, catById, plainIndex])
  // ----------------------

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette entrée ?')) return
    try {
      await api.passwords.remove(id)
      setList((prev) => prev.filter((x) => x.id !== id))
    } catch (e) {
      toast.error(e?.message || 'Échec de la suppression')
    }
  }

  return (
    <main className="container">
      <header className="row" style={{justifyContent:'space-between'}}>
        <h2 style={{margin:0}}>Mes mots de passe</h2>
        <div className="row">
          <button className="btn" onClick={() => navigate('/new')}>Ajouter</button>
          <button className="btn btn--light" onClick={() => navigate('/key-check')}>Vérifier la clé</button>
        </div>
      </header>

      {err && <p className="error">{err}</p>}

      <div className="row" style={{marginTop:8}}>
        <input className="input" placeholder="Rechercher…" value={q} onChange={(e)=>setQ(e.target.value)} />
      </div>

      <ul className="list" style={{marginTop:12}}>
        {filteredSorted.map((item) => (
          <li key={item.id} className="item">
            <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:600}}>{item.title}</div>
                <div className="small dim">Catégorie : {catById[item.category] || '(Aucune)'}</div>
              </div>
              <div className="row">
                <button className="btn" onClick={()=>setRevealItem(item)}>Révéler</button>
                <button className="btn" onClick={()=>navigate(`/edit/${item.id}`)}>Éditer</button>
                <button className="btn btn--danger" onClick={()=>remove(item.id)}>Supprimer</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {revealItem && (
        <RevealDialog item={revealItem} onClose={()=>setRevealItem(null)} />
      )}
    </main>
  )
}
