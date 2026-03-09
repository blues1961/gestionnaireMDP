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
      .then(data => {
        if (!mounted) return
        const arr = Array.isArray(data) ? data.slice() : []
        const collator = new Intl.Collator('fr', { sensitivity: 'accent', numeric: true })
        arr.sort((a,b) => collator.compare(a?.name || '', b?.name || ''))
        setCats(arr)
      })
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
    <div ref={wrapRef} className="category-select" style={style}>
      {/* Affichage du champ sélectionné */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="select category-select__trigger"
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        {label || placeholder}
        <span className="category-select__chevron">▾</span>
      </button>

      {/* Panneau déroulant */}
      {open && (
        <div
          className="category-select__panel"
        >
          <div className="category-select__search-wrap">
            <input
              autoFocus
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Rechercher une catégorie…"
              className="input category-select__search"
            />
          </div>

          {/* Option Aucune */}
          <div
            role="option"
            aria-selected={String(value)===''}
            onClick={()=>choose('')}
            className={`category-select__option${String(value)==='' ? ' is-selected' : ''}`}
          >
            <div className="category-select__option-title">(Aucune)</div>
            <div className="category-select__option-description">Ne pas associer de catégorie</div>
          </div>

          {/* Liste des catégories avec suggestion (description) */}
          <div ref={listRef}>
            {loading && (
              <div className="category-select__status">Chargement…</div>
            )}
            {err && (
              <div className="category-select__status category-select__status--error">{err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div className="category-select__status">Aucun résultat</div>
            )}
            {filtered.map(c => {
              const selected = String(value) === String(c.id)
              return (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={selected}
                  onClick={()=>choose(c.id)}
                  className={`category-select__option${selected ? ' is-selected' : ''}`}
                >
                  <div className="category-select__option-title">{c.name}</div>
                  <div className="category-select__option-description">
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
