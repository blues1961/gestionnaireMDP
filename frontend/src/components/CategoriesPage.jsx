import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function CategoriesPage(){
  const navigate = useNavigate()
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.categories.list()
      .then(data => {
        if (!alive) return
        const arr = Array.isArray(data) ? data.slice() : []
        const collator = new Intl.Collator('fr', { sensitivity: 'accent', numeric: true })
        arr.sort((a,b) => collator.compare(a?.name || '', b?.name || ''))
        setCats(arr)
      })
      .catch(e => { if (alive) setErr(e?.message || 'Échec du chargement des catégories') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <main className="container">
      <section className="modal">
        <header className="card__header">
          <div className="card__title">Catégories</div>
          <button onClick={()=>navigate('/vault')} className="card__close" aria-label="Retour">✕</button>
        </header>

        {loading && <p>Chargement…</p>}
        {err && <p className="error">{String(err)}</p>}

        {!loading && !err && (
          cats.length === 0 ? (
            <p className="dim">Aucune catégorie définie.</p>
          ) : (
            <ul className="list">
              {cats.map(c => (
                <li key={c.id} className="item">
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  {c.description && <div className="small dim" style={{ whiteSpace:'pre-wrap' }}>{c.description}</div>}
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </main>
  )
}
