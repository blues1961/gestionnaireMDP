import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export default function CategorySelect({
  value = '',                 // id de la catégorie sélectionnée (string|number|'')
  onChange = () => {},        // callback(string|'')
  placeholder = '(Aucune)',
  disabled = false,
  style = {}
}) {
  const [cats, setCats] = useState([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const wrapRef = useRef(null)
  const listRef = useRef(null)

  const [label, setLabel] = useState('') // libellé visible pour la valeur sélectionnée

  // Chargement des catégories
  useEffect(() => {
    let mounted = true
    setLoading(true)
    api.categories.list()
      .then(data => { if (mounted) setCats(Array.isArray(data) ? data : []) })
      .catch(e => setErr(e?.message || 'Échec du chargement des catégories'))
      .finally(() => setLoading(false))
    return () => { mounted = false }
  }, [])

  // Met à jour le libellé lorsqu'on a les catégories ou que value change
  useEffect(() => {
    if (!cats.length) return
    const found = cats.find(c => String(c.id) === String(value))
    setLabel(found?.name || '')
  }, [cats, value])

  // Fermer en cliquant à l’extérieur
  useEffect(() => {
    function onDocClick(e){
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = !query.trim()
    ? cats
    : cats.filter(c =>
        (c.name || '').toLowerCase().includes(query.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(query.toLowerCase())
      )

  const choose = (id) => {
    const idStr = id ? String(id) : ''
    onChange(idStr)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} style={{ position:'relative', ...style }}>
      {/* Affichage du champ sélectionné */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          width:'100%', textAlign:'left', padding:'8px 10px',
          background:'#0c0c0c', border:'1px solid #333', color:'#eee',
          borderRadius:8, cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        {label || placeholder}
        <span style={{ float:'right', opacity:.7 }}>▾</span>
      </button>

      {/* Panneau déroulant */}
      {open && (
        <div
          style={{
            position:'absolute', zIndex:50, top:'calc(100% + 6px)', left:0, right:0,
            background:'#111', border:'1px solid #333', borderRadius:10,
            boxShadow:'0 10px 30px rgba(0,0,0,.45)', maxHeight:320, overflow:'auto'
          }}
        >
          <div style={{ padding:8, borderBottom:'1px solid #222' }}>
            <input
              autoFocus
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Rechercher une catégorie…"
              style={{
                width:'100%', padding:'8px 10px', borderRadius:8,
                background:'#0c0c0c', border:'1px solid #333', color:'#eee'
              }}
            />
          </div>

          {/* Option Aucune */}
          <div
            role="option"
            aria-selected={String(value)===''}
            onClick={()=>choose('')}
            style={{
              padding:'10px 12px', cursor:'pointer',
              borderBottom:'1px solid #1c1c1c',
              background: String(value)==='' ? '#0f1a12' : 'transparent'
            }}
          >
            <div style={{ fontWeight:600, color:'#ddd' }}>(Aucune)</div>
            <div style={{ fontSize:12, color:'#888' }}>Ne pas associer de catégorie</div>
          </div>

          {/* Liste des catégories avec suggestion (description) */}
          <div ref={listRef}>
            {loading && (
              <div style={{ padding:12, color:'#aaa' }}>Chargement…</div>
            )}
            {err && (
              <div style={{ padding:12, color:'crimson' }}>{err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ padding:12, color:'#aaa' }}>Aucun résultat</div>
            )}
            {filtered.map(c => {
              const selected = String(value) === String(c.id)
              return (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={selected}
                  onClick={()=>choose(c.id)}
                  style={{
                    padding:'10px 12px', cursor:'pointer',
                    borderBottom:'1px solid #1c1c1c',
                    background: selected ? '#0f1a12' : 'transparent'
                  }}
                >
                  <div style={{ fontWeight:700, color:'#eee' }}>{c.name}</div>
                  <div style={{ fontSize:12, color:'#bbb', whiteSpace:'pre-wrap' }}>
                    {c.description || '(Pas de suggestion)'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
