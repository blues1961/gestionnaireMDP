import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ensureKeyPair, hasKeyPair, exportKeyBundle } from '../utils/crypto'
import { useToast } from './ToastProvider'
import { api } from '../api'
import { sessionGeneration } from '../utils/vaultSession'
import { sameKeyEnvelope, unlockKeyBundle, verifyVault } from '../utils/crypto'

export default function KeyBackup(){
  const navigate = useNavigate()
  const toast = useToast()
  const [hasKey, setHasKey] = useState(false)
  const [entriesCount, setEntriesCount] = useState(null)

  const [expPass, setExpPass] = useState('')
  const [expPass2, setExpPass2] = useState('')
  const [busyExp, setBusyExp] = useState(false)
  const [revision, setRevision] = useState(null)
  const [pending, setPending] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      setHasKey(await hasKeyPair())
      try { setRevision((await api.get("key-envelope/")).data.revision) } catch {}
      try { const items = await api.passwords.list(); setEntriesCount(items?.length || 0) } catch {}
    })()
  }, [])

  const onExport = async (e)=>{
    e.preventDefault()
    if (!expPass) { toast.error('Passphrase requise'); return }
    if (expPass !== expPass2) { toast.error('Les passphrases ne correspondent pas'); return }
    setBusyExp(true)
    const ticket = sessionGeneration()
    try{
      await ensureKeyPair()
      const bundle = await exportKeyBundle(expPass)
      if (ticket !== sessionGeneration()) return
      setPending(bundle)
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

  const onReplace = async () => {
    if (!pending || !saved || revision === null) return
    const ticket = sessionGeneration()
    setBusyExp(true)
    try {
      const pair = await unlockKeyBundle(pending, expPass)
      await verifyVault(pair, await api.passwords.list())
      if (ticket !== sessionGeneration()) return
      const {data} = await api.put('key-envelope/', {envelope: pending, expected_revision: revision}, {vaultTicket: ticket})
      const retrieved = (await api.get('key-envelope/')).data
      if (retrieved.revision !== data.revision || !sameKeyEnvelope(retrieved.envelope, pending)) throw new Error('changed')
      await unlockKeyBundle(retrieved.envelope, expPass)
      if (ticket !== sessionGeneration()) return
      setRevision(retrieved.revision); setPending(null); setExpPass(''); setExpPass2(''); setSaved(false)
      toast.success('Mot de passe de clé modifié ; paire conservée')
    } catch (e) {
      toast.error(e.response?.status === 409 ? 'Conflit entre appareils : rechargez la page avant de reprendre' : 'Échec : conservez votre sauvegarde et vérifiez l’enveloppe du compte')
      setPending(null)
    } finally { setBusyExp(false) }
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
              L’enveloppe du compte est récupérée automatiquement. Cet export reste une sauvegarde indépendante.
            </div>

            <form onSubmit={onExport} className="form"><fieldset disabled={busyExp}>
              <div className="form-row form-row--noactions">
                <label className="label">Passphrase</label>
                <input type="password" className="input" value={expPass} onChange={e=>{setExpPass(e.target.value); setPending(null); setSaved(false)}} />
              </div>
              <div className="form-row form-row--noactions">
                <label className="label">Confirmer</label>
                <input type="password" className="input" value={expPass2} onChange={e=>setExpPass2(e.target.value)} />
              </div>
              <div className="row row--end">
                <button type="submit" className="btn" disabled={busyExp}>{busyExp ? 'Export…' : 'Exporter'}</button>
              </div>
            </fieldset></form>
            {pending && <div className="stack"><label><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)} /> J’ai conservé la sauvegarde téléchargée et sa phrase de passe séparément.</label><p>Remplacer l’enveloppe du compte change son mot de passe de chiffrement et conserve la même paire. Les anciens exports restent utilisables avec leur ancien mot de passe.</p><button className="btn" disabled={!saved || busyExp || revision === null} onClick={onReplace}>Utiliser ce mot de passe pour l’enveloppe du compte</button></div>}

          </div>
        </div>
      </section>
    </main>
  )
}
