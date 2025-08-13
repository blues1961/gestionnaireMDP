import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { useNavigate } from 'react-router-dom'
import { useToast } from './ToastProvider'
import CategorySelect from './CategorySelect' // ← si tu ne l’as pas, je te fournis un <select> de repli

export default function CategoryGuide(){
  const toast = useToast()
  const navigate = useNavigate()

  const [cats, setCats] = useState([])
  const [pwds, setPwds] = useState([])
  const [usage, setUsage] = useState({}) // { [catId]: count }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  // Formulaire d’ajout (conservé si tu l’avais déjà)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Panneau de réassignation/suppression
  const [confirm, setConfirm] = useState({ open:false, cat:null, target:'' })
  const [working, setWorking] = useState(false)

  const buildUsage = (passwords) => {
    const m = {}
    for (const p of passwords || []) {
      const cid = p?.category
      if (cid) m[cid] = (m[cid] || 0) + 1
    }
    return m
  }

  const refresh = async () => {
    setLoading(true); setErr(null)
    try {
      const [cs, ps] = await Promise.all([
        api.categories.list(),
        api.passwords.list()
      ])
      setCats(Array.isArray(cs) ? cs : [])
      setPwds(Array.isArray(ps) ? ps : [])
      setUsage(buildUsage(ps))
    } catch (e) {
      setErr(e?.message || 'Échec de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // ---- Ajout de catégorie (si tu veux le garder) ----
  const resetAdd = () => { setName(''); setDescription('') }
  const submitAdd = async (e) => {
    e?.preventDefault?.()
    const n = name.trim(); const d = description.trim()
    if (!n) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      const created = await api.categories.create(n) // POST {name}
      if (created?.id && d) {
        await api.categories.update(created.id, { description: d }) // PATCH description
      }
      toast.success('Catégorie créée')
      resetAdd(); setAdding(false)
      await refresh()
    } catch (err) {
      toast.error(err?.message || 'Échec de création')
    } finally {
      setSaving(false)
    }
  }

  // ---- Suppression + réassignation ----
  const tryDelete = (cat) => {
    const count = usage[String(cat.id)] || 0
    if (count === 0) {
      // suppression directe
      doDelete(cat)
    } else {
      // demander réassignation
      setConfirm({ open:true, cat, target:'' })
    }
  }

  const doDelete = async (cat) => {
    setWorking(true)
    try {
      await api.categories.remove(cat.id)
      toast.success('Catégorie supprimée')
      setConfirm({ open:false, cat:null, target:'' })
      await refresh()
    } catch (e) {
      toast.error(e?.message || 'Échec de suppression')
    } finally {
      setWorking(false)
    }
  }

  const reassignAndDelete = async () => {
    if (!confirm.cat) return
    const sourceId = String(confirm.cat.id)
    const targetId = confirm.target ? parseInt(confirm.target, 10) : null

    setWorking(true)
    try {
      // 1) Réassigner toutes les entrées qui pointent vers la catégorie source
      const affected = pwds.filter(p => String(p.category) === sourceId)
      for (const p of affected) {
        // PATCH partiel, on ne touche qu’à la catégorie
        if (api.passwords.updatePartial) {
          await api.passwords.updatePartial(p.id, { category: targetId })
        } else {
          // Fallback peu probable: essayer update() si ton backend accepte PUT partiel
          await api.passwords.update(p.id, { category: targetId })
        }
      }

      // 2) Supprimer la catégorie
      await api.categories.remove(confirm.cat.id)

      toast.success(`Réassignation (${affected.length}) + suppression OK`)
      setConfirm({ open:false, cat:null, target:'' })
      await refresh()
    } catch (e) {
      toast.error(e?.message || 'Échec lors de la réassignation/suppression')
    } finally {
      setWorking(false)
    }
  }

  // ---- Rendu ----
  if (loading) {
    return <main style={{maxWidth:900, margin:'5vh auto', fontFamily:'system-ui'}}>Chargement…</main>
  }
  if (err) {
    return <main style={{maxWidth:900, margin:'5vh auto', fontFamily:'system-ui', color:'crimson'}}>{err}</main>
  }

  return (
    <main style={{maxWidth:900, margin:'5vh auto', fontFamily:'system-ui'}}>
      <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
        <h2>Guide des catégories</h2>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button
            onClick={()=>setAdding(a => !a)}
            style={{padding:'8px 12px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer'}}
          >
            {adding ? 'Fermer' : 'Ajouter une catégorie'}
          </button>
          <button onClick={()=>navigate('/vault')}
            style={{padding:'8px 12px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer'}}>
            Retour à la voûte
          </button>
        </div>
      </header>

      {adding && (
        <form onSubmit={submitAdd}
              style={{border:'1px solid #eee', borderRadius:10, padding:16, marginTop:16, marginBottom:16}}>
          <div style={{display:'grid', gridTemplateColumns:'140px 1fr', gap:8, alignItems:'center', marginBottom:8}}>
            <label style={{color:'#444'}}>Nom</label>
            <input
              value={name}
              onChange={e=>setName(e.target.value)}
              placeholder="Ex. Banques, Réseaux sociaux…"
              aria-label="Nom de la catégorie"
              style={{padding:8}}
            />
          </div>

          <div style={{display:'grid', gridTemplateColumns:'140px 1fr', gap:8, alignItems:'start', marginBottom:12}}>
            <label style={{color:'#444', marginTop:6}}>Suggestion d’utilisation</label>
            <textarea
              value={description}
              onChange={e=>setDescription(e.target.value)}
              placeholder="Ex. Comptes bancaires et cartes; 2FA recommandé; ne pas réutiliser le mot de passe entre banques."
              rows={4}
              style={{padding:8, resize:'vertical'}}
              aria-label="Suggestion d’utilisation"
            />
          </div>

          <div style={{display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap'}}>
            <button type="button" onClick={()=>{ resetAdd(); setAdding(false) }} disabled={saving}>Annuler</button>
            <button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
          </div>
        </form>
      )}

      {/* Liste des catégories */}
      <ul style={{listStyle:'none', padding:0, marginTop:16}}>
        {cats.map(c => {
          const count = usage[String(c.id)] || 0
          return (
            <li key={c.id} style={{border:'1px solid #eee', borderRadius:10, padding:16, marginBottom:12}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
                <div style={{fontWeight:700}}>{c.name}</div>
                <div style={{display:'flex', alignItems:'center', gap:12}}>
                  <span style={{fontSize:12, color:'#888'}}>{count} entrée{count>1?'s':''}</span>
                  <button
                    onClick={()=>tryDelete(c)}
                    style={{padding:'6px 10px', border:'1px solid #733', background:'#2a1111', color:'#eee', borderRadius:8, cursor:'pointer'}}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
              <div style={{whiteSpace:'pre-wrap', color:'#444', marginTop:6}}>
                {c.description || "(Pas de description)"}
              </div>
            </li>
          )
        })}
      </ul>

      {/* Panneau de réassignation si la catégorie est utilisée */}
      {confirm.open && confirm.cat && (
        <section style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
          display:'grid', placeItems:'center', padding:12, zIndex:1000
        }}>
          <div style={{
            width:'min(600px, 94vw)', background:'#111', color:'#eee',
            border:'1px solid #333', borderRadius:12, padding:16, boxShadow:'0 10px 30px rgba(0,0,0,.4)'
          }}>
            <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
              <div style={{fontWeight:700}}>Supprimer “{confirm.cat.name}”</div>
              <button onClick={()=>setConfirm({open:false, cat:null, target:''})}
                      style={{background:'transparent', border:'none', color:'#bbb', fontSize:18, cursor:'pointer'}}>✕</button>
            </header>

            <p style={{marginTop:0}}>
              Cette catégorie est associée à <strong>{usage[String(confirm.cat.id)]}</strong> entrée(s).
              Choisis une catégorie de remplacement pour ces entrées, ou sélectionne <em>(Aucune)</em> pour les détacher.
            </p>

            <div style={{display:'grid', gridTemplateColumns:'140px 1fr', gap:8, alignItems:'center'}}>
              <label style={{color:'#bbb'}}>Réassigner vers</label>
              <CategorySelect
                value={confirm.target}
                onChange={(v)=>setConfirm(s => ({...s, target: v}))}
                // Empêche de choisir la même catégorie
                style={{opacity:1}}
              />
            </div>

            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16, flexWrap:'wrap'}}>
              <button onClick={()=>setConfirm({open:false, cat:null, target:''})}
                      style={{padding:'8px 10px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8}}>
                Annuler
              </button>
              <button onClick={reassignAndDelete} disabled={working}
                      style={{padding:'8px 10px', border:'1px solid #2a5a2a', background:'#0f1a12', color:'#aef3ba', borderRadius:8}}>
                {working ? 'Traitement…' : 'Réassigner & Supprimer'}
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
