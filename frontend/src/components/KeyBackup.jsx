import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ensureKeyPair, hasKeyPair, exportKeyBundle, importKeyBundle } from '../utils/crypto'
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

  const [impFile, setImpFile] = useState(null)
  const [impPass, setImpPass] = useState('')
  const [busyImp, setBusyImp] = useState(false)

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

  const onImport = async (e)=>{
    e.preventDefault()
    if (!impFile) { toast.error('Sélectionne un fichier de sauvegarde'); return }
    if (!impPass) { toast.error('Passphrase requise'); return }
    setBusyImp(true)
    try{
      const text = await impFile.text()
      const bundle = JSON.parse(text)
      await importKeyBundle(bundle, impPass)
      toast.success('Clé importée'); navigate('/vault')
    }catch(err){ toast.error("Échec de l’import (fichier ou passphrase invalide)") }
    finally{ setBusyImp(false) }
  }

  return (
    <main className="container">
      <section className="modal modal--wide" aria-labelledby="kb-title">
        <header className="card__header">
          <div id="kb-title" style={{fontWeight:700}}>Importer / Exporter la clé</div>
          <button onClick={()=>navigate('/vault')} className="card__close" aria-label="Retour">✕</button>
        </header>

        <div className="stack">
          <div className="box">
            <div className="box__head">
              <h3 className="box__title">Exporter la clé</h3>
              {entriesCount !== null && <div className="small dim">Entrées actuelles : {entriesCount}</div>}
            </div>
            <div className="note">
              <strong>Important :</strong> le fichier JSON contient votre <em>clé privée</em>. Conservez-le en lieu sûr
                (coffre chiffré, clé USB hors ligne) et <u>ne l’ajoutez jamais</u> à Git. Utilisez une
                <u>passphrase forte</u> et, si possible, faites un <em>test d’import</em> sur un autre navigateur/appareil
              après l’export.
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
              <div className="row" style={{justifyContent:'flex-end'}}>
                <button type="submit" className="btn" disabled={busyExp}>{busyExp ? 'Export…' : 'Exporter'}</button>
              </div>
            </form>
          </div>

          <div className="box">
            <div className="box__head">
              <h3 className="box__title">Importer la clé</h3>
            </div>
            <div className="note">
              <strong>Rappel :</strong> sur tous les autres appareils/navigateurs, utilisez <u>le fichier de clé initial</u> et la <u>même passphrase</u>. Importer une clé différente rendra vos entrées existantes indéchiffrables.
            </div>
            <form onSubmit={onImport} className="form" style={{marginTop:12}}>
              <div className="form-row form-row--noactions">
                <label className="label">Fichier</label>
                <input type="file" accept=".json,.zkkey,.zkkey.json" onChange={e=>setImpFile(e.target.files?.[0]||null)} className="file" />
              </div>
              <div className="form-row form-row--noactions">
                <label className="label">Passphrase</label>
                <input type="password" className="input" value={impPass} onChange={e=>setImpPass(e.target.value)} />
              </div>
              <div className="row" style={{justifyContent:'flex-end'}}>
                <button type="submit" className="btn" disabled={busyImp}>{busyImp ? 'Import…' : 'Importer'}</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}