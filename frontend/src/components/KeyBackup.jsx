import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ensureKeyPair, hasKeyPair, exportKeyBundle, importKeyBundle } from '../utils/crypto'

export default function KeyBackup(){
  const nav = useNavigate()
  const [expPass, setExpPass] = useState('')
  const [expPass2, setExpPass2] = useState('')
  const [impFile, setImpFile] = useState(null)
  const [impPass, setImpPass] = useState('')
  const [hasKey, setHasKey] = useState(false)

  useEffect(()=>{ hasKeyPair().then(setHasKey) }, [])

  const onExport = async (e)=>{
    e.preventDefault()
    if (!expPass || expPass !== expPass2) { alert("Passphrases différentes"); return }
    try{
      await ensureKeyPair()
      const bundle = await exportKeyBundle(expPass)
      const blob = new Blob([JSON.stringify(bundle,null,2)], {type:'application/json'})
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href:url, download:`zkkey-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json` })
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      alert("Clé exportée. Garde le fichier en lieu sûr.")
    }catch(err){ console.error(err); alert("Échec export. Génère la clé d'abord.") }
  }

  const onImport = async (e)=>{
    e.preventDefault()
    if (!impFile || !impPass) { alert("Fichier et passphrase requis"); return }
    try{
      const text = await impFile.text()
      const bundle = JSON.parse(text)
      await importKeyBundle(bundle, impPass)
      alert("Clé importée"); nav('/vault')
    }catch(err){ console.error(err); alert("Échec import (fichier/passphrase)") }
  }

  return (
    <main style={{maxWidth:720, margin:'5vh auto', fontFamily:'system-ui'}}>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Importer / Exporter la clé</h2>
        <button onClick={()=>nav('/vault')}>Retour à la voûte</button>
      </header>

      {!hasKey && <p style={{color:'#a00'}}>Aucune clé détectée. Générez-en une (en enregistrant un mot de passe) ou importez un backup.</p>}

      <section style={{border:'1px solid #333', padding:16, borderRadius:8, marginTop:12}}>
        <h3>Exporter</h3>
        <form onSubmit={onExport} style={{display:'grid', gap:8, maxWidth:480}}>
          <label>Passphrase
            <input type="password" value={expPass} onChange={e=>setExpPass(e.target.value)} required />
          </label>
          <label>Confirmer
            <input type="password" value={expPass2} onChange={e=>setExpPass2(e.target.value)} required />
          </label>
          <button type="submit">Exporter la clé</button>
        </form>
      </section>

      <section style={{border:'1px solid #333', padding:16, borderRadius:8, marginTop:12}}>
        <h3>Importer</h3>
        <form onSubmit={onImport} style={{display:'grid', gap:8, maxWidth:480}}>
          <label>Fichier
            <input type="file" accept=".json,.zkkey,.zkkey.json" onChange={e=>setImpFile(e.target.files?.[0]||null)} />
          </label>
          <label>Passphrase
            <input type="password" value={impPass} onChange={e=>setImpPass(e.target.value)} required />
          </label>
          <button type="submit">Importer la clé</button>
        </form>
      </section>
    </main>
  )
}
