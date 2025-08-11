import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { exportKeyBundle, importKeyBundle } from '../utils/crypto'
import { useToast } from './ToastProvider'

export default function KeyBackup(){
  const toast = useToast()
  const nav = useNavigate()

  // EXPORT
  const [expPass, setExpPass] = useState('')
  const [expPass2, setExpPass2] = useState('')
  const [expBusy, setExpBusy] = useState(false)

  // IMPORT
  const [impFile, setImpFile] = useState(null)
  const [impPass, setImpPass] = useState('')
  const [impBusy, setImpBusy] = useState(false)

  const doExport = async (e) => {
    e.preventDefault()
    if (!expPass || expPass !== expPass2) {
      toast.error("Les deux passphrases ne correspondent pas.")
      return
    }
    try {
      setExpBusy(true)
      const bundle = await exportKeyBundle(expPass)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      const ts = new Date().toISOString().replace(/[:.]/g,'-')
      a.download = `zkkey-backup-${ts}.zkkey.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Clé exportée (fichier téléchargé). Conserve-le en lieu sûr.')
    } catch (e) {
      console.error(e)
      toast.error("Échec de l'export de la clé")
    } finally {
      setExpBusy(false)
    }
  }

  const doImport = async (e) => {
    e.preventDefault()
    if (!impFile) { toast.error("Sélectionne un fichier .zkkey d’abord."); return }
    if (!impPass) { toast.error("Entre la passphrase du backup."); return }
    try {
      setImpBusy(true)
      const text = await impFile.text()
      const bundle = JSON.parse(text)
      await importKeyBundle(bundle, impPass)
      toast.success('Clé importée. Vous pouvez maintenant déchiffrer vos données.')
      nav('/vault')
    } catch (e) {
      console.error(e)
      toast.error("Échec de l’import (passphrase invalide ou fichier corrompu).")
    } finally {
      setImpBusy(false)
    }
  }

  return (
    <main style={{maxWidth:720, margin:'5vh auto', fontFamily:'system-ui'}}>
      <header style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
        <h2>Importer / Exporter la clé</h2>
        <button onClick={()=>nav('/vault')} style={{padding:'8px 12px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer'}}>
          Retour à la voûte
        </button>
      </header>

      <section style={{border:'1px solid #333', borderRadius:10, padding:16, marginBottom:16}}>
        <h3>Exporter la clé privée (sauvegarde)</h3>
        <p style={{color:'#888', marginTop:6}}>
          La clé privée sera <strong>chiffrée</strong> avec la passphrase ci-dessous et téléchargée dans un fichier <code>.zkkey.json</code>.
          Conserve ce fichier <em>hors-ligne</em> et en lieu sûr.
        </p>
        <form onSubmit={doExport} style={{display:'grid', gap:8, maxWidth:520}}>
          <label>Passphrase<br/>
            <input type="password" value={expPass} onChange={e=>setExpPass(e.target.value)} required />
          </label>
          <label>Confirmer la passphrase<br/>
            <input type="password" value={expPass2} onChange={e=>setExpPass2(e.target.value)} required />
          </label>
          <button type="submit" disabled={expBusy}>{expBusy ? 'Export…' : 'Exporter'}</button>
        </form>
      </section>

      <section style={{border:'1px solid #333', borderRadius:10, padding:16}}>
        <h3>Importer une clé privée (restauration)</h3>
        <p style={{color:'#888', marginTop:6}}>
          Sélectionne le fichier <code>.zkkey.json</code> exporté précédemment, puis entre sa passphrase pour restaurer la clé.
        </p>
        <form onSubmit={doImport} style={{display:'grid', gap:8, maxWidth:520}}>
          <label>Fichier .zkkey.json<br/>
            <input type="file" accept=".json,.zkkey,.zkkey.json" onChange={e=>setImpFile(e.target.files?.[0] || null)} />
          </label>
          <label>Passphrase du backup<br/>
            <input type="password" value={impPass} onChange={e=>setImpPass(e.target.value)} required />
          </label>
          <button type="submit" disabled={impBusy}>{impBusy ? 'Import…' : 'Importer'}</button>
        </form>
      </section>
    </main>
  )
}
