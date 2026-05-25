import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ensureKeyPair, hasKeyPair, exportKeyBundle } from '../utils/crypto'
import { useToast } from './ToastProvider'
import { api } from '../api'

export default function KeyBackup(){
  const navigate = useNavigate()
  const toast = useToast()
  const [hasKey, setHasKey] = useState(false)
  const [entriesCount, setEntriesCount] = useState(null)

  const [expPass, setExpPass] = useState('')
  const [expPass2, setExpPass2] = useState('')
  const [busyExp, setBusyExp] = useState(false)

  useEffect(() => {
    (async () => {
      setHasKey(await hasKeyPair())
      try { const items = await api.passwords.list(); setEntriesCount(items?.length || 0) } catch {}
    })()
  }, [])

  const onExport = async (e)=>{
    e.preventDefault()
    if (!expPass) { toast.error('Passphrase requise'); return }
    if (expPass !== expPass2) { toast.error('Les passphrases ne correspondent pas'); return }
    setBusyExp(true)
    try{
      await ensureKeyPair()
      const bundle = await exportKeyBundle(expPass)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'vault-key.json'
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('Clé exportée')
    }catch(err){ toast.error('Échec de l\'export') }
    finally{ setBusyExp(false) }
  }

  return (
    <main className="container">
      <section className="modal modal--wide" aria-labelledby="kb-title">
        <header className="card__header">
          <div id="kb-title" className="card__title">Exporter la clé</div>
          <button onClick={()=>navigate('/vault')} className="card__close" aria-label="Retour">✕</button>
        </header>

        <div className="stack">
          <div className="box">
            <div className="box__head">
              <h3 className="box__title">Exporter la clé</h3>
              {entriesCount !== null && <div className="small dim">Entrées actuelles : {entriesCount}</div>}
            </div>
            <div className="note">
              <strong>Important :</strong> le fichier JSON contient votre <em>clé privée</em> chiffrée par passphrase.
              Conservez-le en lieu sûr (coffre chiffré, clé USB hors ligne) et <u>ne l’ajoutez jamais</u> à Git.
              L’import sera proposé automatiquement après login si aucune clé locale n’existe, ou quand une entrée devient indéchiffrable.
            </div>

            <form onSubmit={onExport} className="form">
              <div className="form-row form-row--noactions">
                <label className="label">Passphrase</label>
                <input type="password" className="input" value={expPass} onChange={e=>setExpPass(e.target.value)} />
              </div>
              <div className="form-row form-row--noactions">
                <label className="label">Confirmer</label>
                <input type="password" className="input" value={expPass2} onChange={e=>setExpPass2(e.target.value)} />
              </div>
              <div className="row row--end">
                <button type="submit" className="btn" disabled={busyExp}>{busyExp ? 'Export…' : 'Exporter'}</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
