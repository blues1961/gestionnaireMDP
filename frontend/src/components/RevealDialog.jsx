import React, { useEffect, useState } from 'react'
import { decryptPayload } from '../utils/crypto'
import { useToast } from './ToastProvider'

async function copyToClipboard(text){
  try {
    await navigator.clipboard.writeText(text || '')
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text || ''
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
    return ok
  }
}

export default function RevealDialog({ item, onClose }) {
  const toast = useToast()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null) // 'login' | 'password' | 'notes' | null

  useEffect(() => {
    let mounted = true
    decryptPayload(item.ciphertext)
      .then(p => {
        if(!mounted) return
        setLogin(p.login || '')
        setPassword(p.password || '')
        setNotes(p.notes || '')
      })
      .catch(() => setError('Impossible de déchiffrer cette entrée.'))
    return () => { mounted = false }
  }, [item])

  const markCopied = (which, label) => {
    setCopied(which)
    toast.success(`${label} copié dans le presse-papiers`)
    setTimeout(() => setCopied(null), 1200)
  }

  const handleCopy = async (which, value, label) => {
    if (await copyToClipboard(value)) markCopied(which, label)
  }

  const openUrl = () => {
    const url = (item.url || '').trim()
    if(!url) return
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`
    window.open(withScheme, '_blank', 'noopener,noreferrer')
    toast.info('Ouverture de l’URL dans un nouvel onglet')
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e=>e.stopPropagation()}>
        <header style={styles.header}>
          <div style={{fontWeight:700}}>{item.title}</div>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Fermer">✕</button>
        </header>

        {error && <p style={{color:'crimson'}}>{error}</p>}

        <div style={styles.row}>
          <label style={styles.label}>Nom d’utilisateur</label>
          <input
            style={{...styles.input, ...(copied==='login'? styles.inputFlash : {})}}
            value={login}
            readOnly
          />
          <button
            style={{...styles.btn, ...(copied==='login'? styles.btnSuccess : {})}}
            onClick={()=>handleCopy('login', login, 'Nom d’utilisateur')}
            aria-live="polite"
          >
            {copied==='login' ? '✅ Copié !' : 'Copier'}
          </button>
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Mot de passe</label>
          <input
            style={{...styles.input, ...(copied==='password'? styles.inputFlash : {})}}
            value={password}
            readOnly
          />
          <button
            style={{...styles.btn, ...(copied==='password'? styles.btnSuccess : {})}}
            onClick={()=>handleCopy('password', password, 'Mot de passe')}
            aria-live="polite"
          >
            {copied==='password' ? '✅ Copié !' : 'Copier'}
          </button>
        </div>

        <div style={{marginTop:12}}>
          <div style={{color:'#bbb', fontSize:14, marginBottom:6}}>Notes</div>
          <textarea
            readOnly
            value={notes}
            style={{...styles.input, width:'100%', height:120, resize:'vertical'}}
          />
          <div style={{marginTop:8}}>
            <button
              style={{...styles.btn, ...(copied==='notes'? styles.btnSuccess : {})}}
              onClick={()=>handleCopy('notes', notes, 'Notes')}
            >
              {copied==='notes' ? '✅ Copié !' : 'Copier les notes'}
            </button>
          </div>
        </div>

        <div style={{display:'flex', gap:8, marginTop:12, alignItems:'center', flexWrap:'wrap'}}>
          {item.url ? (
            <>
              <span style={{color:'#666', fontSize:13}}>URL:</span>
              <a href="#" onClick={(e)=>{e.preventDefault(); openUrl()}} style={{fontSize:13}}>
                {item.url}
              </a>
              <button style={styles.btn} onClick={openUrl}>Ouvrir dans un onglet</button>
            </>
          ) : (
            <span style={{color:'#666', fontSize:13}}>(Pas d’URL)</span>
          )}
        </div>

        <div style={{marginTop:16, textAlign:'right'}}>
          <button style={styles.btn} onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
  },
  modal: {
    width:'min(720px, 92vw)', background:'#111', color:'#eee',
    border:'1px solid #333', borderRadius:12, padding:16, boxShadow:'0 10px 30px rgba(0,0,0,.4)'
  },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  closeBtn: { background:'transparent', border:'none', color:'#bbb', fontSize:18, cursor:'pointer' },
  row: { display:'grid', gridTemplateColumns:'140px 1fr auto', gap:8, alignItems:'center', margin:'8px 0' },
  label: { color:'#bbb', fontSize:14 },
  input: {
    width:'100%', padding:'8px 10px', background:'#0c0c0c',
    border:'1px solid #333', color:'#eee', borderRadius:8,
    transition:'box-shadow .25s, border-color .25s, background .25s'
  },
  inputFlash: {
    boxShadow:'0 0 0 2px rgba(34,197,94,.35)',
    borderColor:'rgba(34,197,94,.6)',
    background:'#0f1a12'
  },
  btn: { padding:'8px 10px', border:'1px solid #444', background:'#1a1a1a', color:'#eee', borderRadius:8, cursor:'pointer' },
  btnSuccess: { borderColor:'rgba(34,197,94,.7)', background:'#16351f' },
}
