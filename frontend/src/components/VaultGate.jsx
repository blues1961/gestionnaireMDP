import React, { useEffect, useState } from 'react';
import { api, clearStoredAuth } from '../api';
import { exportKeyBundle, generateExportablePair, purgeLegacyPair, readLegacyPair, sameKeyEnvelope, unlockKeyBundle, validateKeyBundle, verifyVault } from '../utils/crypto';
import { activateVault, isVaultUnlocked, lockVault, sessionGeneration, subscribeVault } from '../utils/vaultSession';

export function downloadEnvelope(bundle) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'vault-key.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function VaultGate({children}) {
  const [unlocked, setUnlocked] = useState(isVaultUnlocked);
  const [record, setRecord] = useState(undefined);
  const [pass, setPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('file');
  const [cleanupNotice, setCleanupNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  useEffect(() => subscribeVault(() => {
    setUnlocked(isVaultUnlocked()); setPass(''); setNewPass(''); setNewPassConfirm(''); setFile(null); setMode('file'); setPrepared(null); setDownloaded(false); setBackup(false); setBusy(false); setConfirmEmpty(false);
  }), []);
  const load = async () => {
    const ticket = sessionGeneration();
    setError(''); setRecord(undefined); setPrepared(null); setDownloaded(false); setBackup(false);
    try {
      await api.get('whoami/');
      const {data} = await api.get('key-envelope/');
      validateKeyBundle(data.envelope);
      if (ticket === sessionGeneration()) setRecord(data);
    } catch (e) {
      if (ticket !== sessionGeneration()) return;
      if (e.response?.status === 404) setRecord(null);
      else setError('Récupération impossible (réseau, session ou enveloppe invalide). Réessayez ou utilisez un fichier de secours.');
    }
  };
  useEffect(() => { if (!unlocked) load(); }, [unlocked]);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    const ticket = sessionGeneration();
    try {
      // Fetch the current account's entries, never accept a cached global local pair automatically.
      const entries = await api.passwords.list();
      let pair, envelope;
      const protectionPass = newPass || pass;
      if (newPass && newPass !== newPassConfirm) throw new Error('Les nouvelles phrases de passe ne correspondent pas.');
      const migration = prepared || !record || file || mode === 'legacy' || mode === 'new';
      if (!migration) {
        pair = await unlockKeyBundle(record.envelope, pass);
        await verifyVault(pair, entries);
        activateVault(pair, ticket);
        return;
      }
      if (prepared) {
        if (!downloaded || !backup) throw new Error('Téléchargez et confirmez la sauvegarde indépendante avant de continuer.');
        envelope = prepared;
        pair = await unlockKeyBundle(envelope, protectionPass);
        await verifyVault(pair, entries);
        if (ticket !== sessionGeneration()) throw new Error('Opération interrompue');
        const {data} = await api.put('key-envelope/', {envelope, expected_revision: record?.revision || 0}, {vaultTicket: ticket});
        const retrieved = (await api.get('key-envelope/')).data;
        if (retrieved.revision !== data.revision || !sameKeyEnvelope(retrieved.envelope, envelope)) throw new Error('Enveloppe modifiée : reprenez le déverrouillage.');
        const checked = await unlockKeyBundle(retrieved.envelope, protectionPass);
        await verifyVault(checked, await api.passwords.list());
        if (ticket !== sessionGeneration()) throw new Error('Opération interrompue');
        // Cleanup only after upload, readback, local unlock, vault verification and backup acknowledgement.
        // The legacy global pair must match this account's candidate before removal.
        try {
          const {retained} = await purgeLegacyPair(checked);
          if (retained) setCleanupNotice('Une ancienne clé locale différente ou illisible a été conservée. Migrez son compte avant d’effacer les données de ce navigateur.');
        } catch {
          setCleanupNotice('La récupération est validée, mais le nettoyage de l’ancienne clé locale a échoué. Conservez la sauvegarde et reprenez la finalisation.');
        }
        activateVault(checked, ticket);
        return;
      }
      if (mode === 'legacy') {
        if (!entries.length && !record) throw new Error('Ancienne clé globale non attribuable à une voûte vide : utilisez votre fichier de sauvegarde.');
        pair = await readLegacyPair();
      } else if (mode === 'new') {
        if (entries.length || record || (await api.get('secrets/')).data.length) throw new Error('Création interdite : une voûte ou des bundles existent.');
        if (!confirmEmpty) throw new Error('Confirmez explicitement la création d’une nouvelle voûte vide.');
        pair = await generateExportablePair();
      } else {
        if (!file || file.size > 32768) throw new Error('Sélectionnez un fichier de clé de moins de 32 Kio.');
        pair = await unlockKeyBundle(JSON.parse(await file.text()), pass);
      }
      await verifyVault(pair, entries);
      if (record) {
        const pub = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
        const encoded = btoa(String.fromCharCode(...pub));
        if (encoded !== record.envelope.pub) throw new Error('Le fichier ne correspond pas à la clé associée au compte.');
      }
      // Empty vault: pair consistency challenge, plus explicit provenance acknowledgement.
      if (!entries.length && !confirmEmpty) throw new Error('Confirmez la provenance de cette clé pour la voûte vide.');
      envelope = await exportKeyBundle(protectionPass, pair);
      await unlockKeyBundle(envelope, protectionPass);
      if (ticket !== sessionGeneration()) throw new Error('Opération interrompue');
      setPrepared(envelope);
    } catch (e) {
      if (ticket !== sessionGeneration()) return;
      if (e.response?.status === 409) { setPrepared(null); setError('Conflit : un autre appareil a modifié l’enveloppe. Rechargez avant de reprendre.'); }
      else if (e.response || e.isAxiosError) setError('Erreur API ou réseau : aucune clé active. Réessayez sans modifier votre sauvegarde.');
      else setError(e.name === 'OperationError' ? 'Mot de passe incorrect, fichier corrompu ou clé incompatible avec la voûte.' : e.message);
    } finally { if (ticket === sessionGeneration()) setBusy(false); }
  };
  if (unlocked) return <div className="vault-content">{cleanupNotice && <p role="status" className="status-banner">{cleanupNotice}</p>}{children}</div>;
  return <main className="container"><section className="card stack">
    <h1>Déverrouiller la voûte</h1>
    <p>Le mot de passe de la clé est distinct du mot de passe de connexion. Il reste sur cet appareil. La clé déchiffrée reste en mémoire.</p>
    {error && <p role="alert" className="status-banner error">{error}</p>}
    <button className="btn" onClick={load} disabled={busy}>Récupérer l’enveloppe du compte</button>
    <form onSubmit={submit} className="stack"><fieldset disabled={busy} className="stack">
      <label>Mot de passe de la clé de chiffrement<input type="password" autoComplete="off" required className="input" value={pass} onChange={e => {setPass(e.target.value); setPrepared(null); setDownloaded(false); setBackup(false);}} /></label>
      {!record && <p>Migration initiale : importez votre sauvegarde ou protégez la même paire locale. Une phrase de passe forte de 16 caractères minimum est requise pour l’enregistrement.</p>}
      <label>Fichier existant ou import de secours<input type="file" accept=".json,.zkkey" disabled={busy || !!prepared} onChange={e => {setFile(e.target.files?.[0] || null); setMode('file');}} /></label>
      {!record && <label>Source<select value={mode} disabled={!!prepared} onChange={e => setMode(e.target.value)}><option value="file">Fichier de sauvegarde</option><option value="legacy">Ancienne paire locale (migration explicite)</option><option value="new">Créer une paire pour une nouvelle voûte vide</option></select></label>}
      {(!record || file || prepared) && <>
        <label>Nouvelle phrase de passe de clé (optionnelle ; requise si l’ancienne a moins de 16 caractères)<input type="password" autoComplete="off" className="input" value={newPass} onChange={e => {setNewPass(e.target.value); setPrepared(null); setDownloaded(false); setBackup(false);}} /></label>
        <label>Confirmer la nouvelle phrase de passe<input type="password" autoComplete="off" className="input" value={newPassConfirm} onChange={e => setNewPassConfirm(e.target.value)} /></label>
      </>}
      <label><input type="checkbox" checked={confirmEmpty} onChange={e => setConfirmEmpty(e.target.checked)} /> Si la voûte est vide, je confirme la provenance de la clé ou la création explicite d’une nouvelle voûte.</label>
      {prepared && <><p>Clé vérifiée localement. Sauvegardez l’enveloppe avant son envoi ; la paire et les entrées restent inchangées.</p><button type="button" className="btn" onClick={() => {downloadEnvelope(prepared); setDownloaded(true);}}>Télécharger la sauvegarde chiffrée</button><label><input type="checkbox" checked={backup} onChange={e => setBackup(e.target.checked)} /> J’ai conservé cette sauvegarde hors du serveur et sa phrase de passe séparément.</label></>}
      <button className="btn" disabled={busy || (!record && record !== null && !file)}>{busy ? 'Vérification…' : prepared ? 'Enregistrer et vérifier la récupération' : record && !file ? 'Déverrouiller' : 'Vérifier et préparer la migration'}</button>
    </fieldset></form>
    <button className="btn" onClick={() => {lockVault(); clearStoredAuth(); window.location.assign('/login');}}>Se déconnecter</button>
  </section></main>;
}
