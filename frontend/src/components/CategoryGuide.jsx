import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';
import { useToast } from './ToastProvider';
import CategorySelect from './CategorySelect';

export default function CategoryGuide(){
  const toast = useToast?.() ?? { success:()=>{}, error:()=>{} };
  const navigate = useNavigate();

  const [cats, setCats] = useState([]);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Formulaire d’ajout
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Modale suppression/réassignation
  const [confirm, setConfirm] = useState({ open:false, cat:null, target:'' });
  const [reassigning, setReassigning] = useState(false);

  // Modale édition
  const [editing, setEditing] = useState({ open:false, cat:null });
  const [editSaving, setEditSaving] = useState(false);

  // Chargement initial
  const refresh = async () => {
    try {
      setLoading(true);
      setErr(null);
      const [c = [], p = []] = await Promise.all([
        api?.categories?.list?.() ?? Promise.resolve([]),
        api?.passwords?.list?.() ?? Promise.resolve([]),
      ]);
      setCats(Array.isArray(c) ? c : []);
      const u = {};
      for (const it of (Array.isArray(p) ? p : [])) {
        const cid = String(it?.category ?? '');
        u[cid] = (u[cid] || 0) + 1;
      }
      setUsage(u);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Ajout catégorie
  const resetAdd = () => { setName(''); setDescription(''); };
  const submitAdd = async (e) => {
    e?.preventDefault?.();
    const n = name.trim();
    const d = description.trim();
    if (!n) { toast.error('Nom requis'); return; }
    setSaving(true);
    try {
      const created = await (api?.categories?.create?.(n) ?? Promise.reject(new Error('API indisponible')));
      if (created?.id && d) await (api?.categories?.update?.(created.id, { description: d }) ?? Promise.resolve());
      toast.success('Catégorie créée');
      resetAdd(); setAdding(false);
      await refresh();
    } catch (error) {
      toast.error(error?.message || 'Échec de création');
    } finally {
      setSaving(false);
    }
  };

  // Suppression / Réassignation
  const tryDelete = (cat) => setConfirm({ open:true, cat, target:'' });

  const performDelete = async (e) => {
    e?.preventDefault?.();
    const cat = confirm?.cat;
    if (!cat) return;
    setReassigning(true);
    try {
      const hasLinks = (usage[String(cat.id)] || 0) > 0;
      if (hasLinks && api?.categories?.reassign) {
        const target = confirm?.target || null;
        await api.categories.reassign(cat.id, target);
      }
      await (api?.categories?.remove?.(cat.id) ?? Promise.reject(new Error('API indisponible')));
      toast.success('Catégorie supprimée');
      setConfirm({ open:false, cat:null, target:'' });
      await refresh();
    } catch (error) {
      toast.error(error?.message || 'Échec de la suppression');
    } finally {
      setReassigning(false);
    }
  };

  // Édition
  const openEdit = (cat) => setEditing({ open:true, cat:{ ...cat } });

  const submitEdit = async (e) => {
    e?.preventDefault?.();
    const cat = editing?.cat;
    if (!cat) return;
    setEditSaving(true);
    try {
      await (api?.categories?.update?.(cat.id, { name:cat.name, description:cat.description || '' }) ?? Promise.reject(new Error('API indisponible')));
      toast.success('Catégorie mise à jour');
      setEditing({ open:false, cat:null });
      await refresh();
    } catch (error) {
      toast.error(error?.message || 'Échec de la mise à jour');
    } finally {
      setEditSaving(false);
    }
  };

  // États simples
  if (loading) return (
    <main className="container">
      <div className="card"><p>Chargement…</p></div>
    </main>
  );
  if (err) return (
    <main className="container">
      <div className="card error" style={{whiteSpace:'pre-wrap'}}>{err}</div>
    </main>
  );

  return (
    <main className="container">
      <header className="row" style={{justifyContent:'space-between', marginBottom:12}}>
        <h2 style={{margin:0}}>Guide des catégories</h2>
        <div className="row">
          <button className="btn" onClick={()=>setAdding(a => !a)}>{adding ? 'Fermer' : 'Ajouter une catégorie'}</button>
          <button className="btn btn--light" onClick={()=>navigate('/vault')}>Retour à la voûte</button>
        </div>
      </header>

      {adding && (
        <form onSubmit={submitAdd} className="item" style={{marginBottom:16}}>
          <div className="form-row form-row--noactions">
            <label className="label">Nom</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} className="input" placeholder="Nom de la catégorie" />
          </div>
          <div className="form-row form-row--noactions">
            <label className="label">Description</label>
            <input value={description} onChange={(e)=>setDescription(e.target.value)} className="input" placeholder="(optionnel)" />
          </div>
          <div className="row" style={{justifyContent:'flex-end'}}>
            <button type="button" className="btn" onClick={()=>{ resetAdd(); setAdding(false); }}>Annuler</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Création…' : 'Créer'}</button>
          </div>
        </form>
      )}

      <ul className="list">
        {cats.map((c)=> (
          <li key={c.id} className="item">
            <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:600}}>{c?.name ?? '(sans nom)'}</div>
                {c?.description ? <div className="small dim">{c.description}</div> : null}
                <div className="small dim">Éléments: {usage[String(c?.id ?? '')] || 0}</div>
              </div>
              <div className="row">
                <button className="btn" onClick={()=>openEdit(c)}>Éditer</button>
                <button className="btn btn--danger" onClick={()=>tryDelete(c)}>Supprimer</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Modale suppression/réassignation */}
      {confirm?.open && confirm?.cat && (
        <div className="backdrop" onClick={()=>setConfirm({open:false, cat:null, target:''})}>
          <section className="modal" onClick={(e)=>e.stopPropagation()}>
            <header className="card__header">
              <div style={{fontWeight:700}}>Supprimer “{confirm.cat?.name ?? '(sans nom)'}”</div>
              <button className="card__close" onClick={()=>setConfirm({open:false, cat:null, target:''})}>✕</button>
            </header>

            <p className="small" style={{marginTop:0}}>
              Cette catégorie est associée à <strong>{usage[String(confirm.cat?.id ?? '')] || 0}</strong> entrée(s).
              Choisis une catégorie de remplacement pour ces entrées, ou sélectionne <em>(Aucune)</em> pour les détacher.
            </p>

            <div className="form-row form-row--noactions">
              <label className="label">Réassigner vers</label>
              <CategorySelect value={confirm.target} onChange={(v)=>setConfirm(s => ({...s, target: v}))} />
            </div>

            <div className="row" style={{justifyContent:'flex-end', marginTop:16}}>
              <button className="btn" onClick={()=>setConfirm({open:false, cat:null, target:''})}>Annuler</button>
              <button className="btn btn--danger" onClick={performDelete} disabled={reassigning}>
                {reassigning ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modale édition */}
      {editing?.open && editing?.cat && (
        <div className="backdrop" onClick={()=>setEditing({open:false, cat:null})}>
          <section className="modal" onClick={(e)=>e.stopPropagation()}>
            <header className="card__header">
              <div style={{fontWeight:700}}>Modifier la catégorie</div>
              <button className="card__close" onClick={()=>setEditing({open:false, cat:null})}>✕</button>
            </header>
            <form onSubmit={submitEdit} className="form">
              <div className="form-row form-row--noactions">
                <label className="label">Nom</label>
                <input className="input"
                  value={editing.cat?.name ?? ''}
                  onChange={(e)=>setEditing(s=>({ ...s, cat:{...s.cat, name:e.target.value} }))}
                />
              </div>
              <div className="form-row form-row--noactions">
                <label className="label">Description</label>
                <input className="input"
                  value={editing.cat?.description ?? ''}
                  onChange={(e)=>setEditing(s=>({ ...s, cat:{...s.cat, description:e.target.value} }))}
                />
              </div>
              <div className="row" style={{justifyContent:'flex-end', marginTop:12}}>
                <button type="button" className="btn" onClick={()=>setEditing({open:false, cat:null})}>Annuler</button>
                <button type="submit" className="btn" disabled={editSaving}>
                  {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
