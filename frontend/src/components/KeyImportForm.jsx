import React, { useState } from 'react'
import { importKeyBundle } from '../utils/crypto'
import { useToast } from './ToastProvider'

export default function KeyImportForm({
  onImported,
  submitLabel = 'Importer',
  successMessage = 'Clé importée',
}) {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)

  const onImport = async (e) => {
    e?.preventDefault?.()
    if (!file) { toast.error('Sélectionne un fichier de sauvegarde'); return }
    if (!passphrase) { toast.error('Passphrase requise'); return }
    setBusy(true)
    try {
      const text = await file.text()
      const bundle = JSON.parse(text)
      await importKeyBundle(bundle, passphrase)
      toast.success(successMessage)
      setFile(null)
      setPassphrase('')
      onImported?.()
    } catch {
      toast.error("Échec de l’import (fichier ou passphrase invalide)")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onImport} className="form key-import-form">
      <div className="form-row form-row--noactions">
        <label className="label">Fichier de clé</label>
        <input
          type="file"
          accept=".json,.zkkey,.zkkey.json"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="file"
        />
      </div>
      <div className="form-row form-row--noactions">
        <label className="label">Passphrase</label>
        <input
          type="password"
          className="input"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
        />
      </div>
      <div className="row row--end">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Import…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
