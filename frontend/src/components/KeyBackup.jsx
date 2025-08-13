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

  // Export
  const [expPass, setExpPass] = useState('')
  const [expPass2, setExpPass2] = useState('')
  const [busyExp, setBusyExp] = useState(false)

  // Import
  const [impFile, setImpFile] = useState(null)
  const [impPass, setImpPass] = useState('')
  const [busyImp, setBusyImp] = useState(false)

  useEffect(() => {
    hasKeyPair().then(setHasKey)
    api.passwords.list()
      .then(d => setEntriesCount(Array.isArray(d) ? d.length : 0))
      .catch(() => setEntriesCount(null))
  }, [])

  const onExport = async (e)=>{
    e.preventDefault()
    if (!expPass || !expPass2) { toast.error('Passphrase requise'); return }
    if (expPass !== expPass2) { toast.error('Les passphrases ne correspondent pas'); return }

    setBusyExp(true)
    try{
      await ensureKeyPair()
      const bundle = await exportKeyBundle(expPass)
      const blob = new Blob([JSON.stringify(bundle,null,2)], {type:'application/json'})
      const fname = `zkkey-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href:url, download: fname })
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toast.success('Clé exportée — garde le fichier en lieu sûr')
      setExpPass(''); setExpPass2('')
    }catch(err){
      console.error(err)
      toast.error("Échec de l'export — génère/importe d'abord une clé")
    } finally {
      setBusyExp(false)
    }
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
      toast.success('Clé importée')
      navigate('/vault')
    }catch(err){
      console.error(err)
      toast.error("Échec de l’import (fichier ou passphrase invalide)")
    } finally {
      setBusyImp(false)
    }
  }

  return (
    <main style={pageStyles.wrap}>
      <section style={styles.modal} aria-labelledby="kb-title">
        <header style={styles.header}>
          <div style={{fontWeight:700}} id="kb-title">Importer / Exporter la clé</div>
          <button onClick={()=>navigate('/vault')} style={styles.closeBtn} aria-label="Retour">✕</button>
        </header>

        {!hasKey && (
          <p style={{marginTop:0, color:'#eab308'}}>
            Aucune clé détectée. Générez-en une (en enregistrant un mot de passe) ou importez un backup.
          </p>
        )}
         <div style={styles.stack}>
          <div style={styles.box}>
            <div style={styles.boxHead}>
              <h3 style={styles.boxTitle}>Exporter la clé</h3>
              <span style={styles.smallInfo}>
                Entrées en base : {entriesCount === null ? '—' : entriesCount}
              </span>
            </div>

            <div style={styles.note}>
              <strong>Important :</strong> l’<u>export</u> de la clé se fait <u>une seule fois</u>,
              et uniquement lorsque la base est <u>vide (0 entrée)</u>. Conserve ce fichier en lieu sûr.
              Ensuit​e, <u>tous les autres appareils</u> doivent utiliser <u>l’import</u> avec ce
              <u> même fichier de clé</u> et la <u>même passphrase</u>.
            </div>

            <form onSubmit={onExport} style={{marginTop:12}}>
              <div style={styles.row}>
                <label style={styles.label}>Passphrase</label>
                <input
                  type="password"
                  style={styles.input}
                  value={expPass}
                  onChange={e=>setExpPass(e.target.value)}
                  required
                />
                <span />
              </div>

              <div style={styles.row}>
                <label style={styles.label}>Confirmer</label>
                <input
                  type="password"
                  style={styles.input}
                  value={expPass2}
                  onChange={e=>setExpPass2(e.target.value)}
                  required
                />
                <div style={{display:'flex', gap:8}}>
                  <button type="submit" style={styles.btn} disabled={busyExp}
                    title="Recommandé : à effectuer une seule fois quand la base est vide">
                    {busyExp ? 'Export…' : 'Exporter la clé'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* ENCADRÉ IMPORT */}
          <div style={styles.box}>
            <div style={styles.boxHead}>
              <h3 style={styles.boxTitle}>Importer la clé</h3>
            </div>

            <div style={styles.note}>
              <strong>Rappel :</strong> sur tous les autres appareils/navigateurs,
              utilisez <u>le fichier de clé initial</u> et la <u>même passphrase</u>.
              Importer une clé différente rendra vos entrées existantes indéchiffrables.
            </div>

            <form onSubmit={onImport} style={{marginTop:12}}>
              <div style={styles.row}>
                <label style={styles.label}>Fichier</label>
                <input
                 type="file"
                 accept=".json,.zkkey,.zkkey.json"
                 onChange={e=>setImpFile(e.target.files?.[0]||null)}
                 style={styles.input}
                />
               <span />
              </div>

              <div style={styles.row}>
               <label style={styles.label}>Passphrase</label>
               <input
                 type="password"
                 style={styles.input}
                 value={impPass}
                 onChange={e=>setImpPass(e.target.value)}
                 required
               />
                <div style={{display:'flex', gap:8}}>
                  <button type="submit" style={styles.btn} disabled={busyImp}>
                    {busyImp ? 'Import…' : 'Importer la clé'}
                 </button>
                </div>
              </div>
           </form>
          </div>
        </div>
      </section>
    </main>
  )
}

const pageStyles = {
  wrap: {
    minHeight:'calc(100vh - 10vh)',
    padding:'5vh 0',
    background:'#000',
    fontFamily:'system-ui'
  }
}

const styles = {
  modal: {
    width:'min(820px, 96vw)', background:'#111', color:'#eee',
    border:'1px solid #333', borderRadius:12, padding:16, margin:'0 auto',
    boxShadow:'0 10px 30px rgba(0,0,0,.4)'
  },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  closeBtn: { background:'transparent', border:'none', color:'#bbb', fontSize:18, cursor:'pointer' },

  // Mise en page héritée de PasswordForm
  row: { display:'grid', gridTemplateColumns:'140px 1fr auto', gap:8, alignItems:'center', margin:'8px 0' },
  label: { color:'#bbb', fontSize:14 },
  input: {
    width:'100%', padding:'8px 10px', background:'#0c0c0c',
    border:'1px solid #333', color:'#eee', borderRadius:8,
    transition:'box-shadow .25s, border-color .25s, background .25s'
  },
  btn: { padding:'8px 10px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer' },

  // Encadrés
// Conteneur vertical avec un bel espacement entre les encadrés
  stack: {
    display:'grid',
    gap: 36,            // ← augmente ici si tu veux encore plus (ex. 32 ou 36)
    marginTop: 16
  },
  // Chaque encadré
  box: {
    border:'1px solid #222',
    borderRadius:12,
    padding:30,         // un chouia plus d’air à l’intérieur
    background:'#0f0f0f'
  },
  boxHead: {
    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:6
  },
  boxTitle: { margin:0, fontSize:16, fontWeight:700 },

  // Notes (avertissements)
  note: {
    marginTop:6, padding:'10px 12px',
    border:'1px solid #5a4a1a',
    background:'#1d1706',
    color:'#facc15',
    borderRadius:8,
    lineHeight:1.35
  },

  smallInfo: { fontSize:12, color:'#bbb' }
}
