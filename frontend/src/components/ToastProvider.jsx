import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastCtx = createContext(null)

let idSeq = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]) // {id, message, type}
  const timersRef = useRef({})

  const remove = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id))
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id])
      delete timersRef.current[id]
    }
  }, [])

  const add = useCallback((message, opts = {}) => {
    const id = idSeq++
    const type = opts.type || 'info' // 'success' | 'error' | 'info'
    const duration = opts.duration ?? 1800
    setToasts(list => [...list, { id, message, type }])
    timersRef.current[id] = setTimeout(() => remove(id), duration)
    return id
  }, [remove])

  const api = useMemo(() => ({
    add,
    success: (msg, o) => add(msg, { ...(o||{}), type: 'success' }),
    error: (msg, o) => add(msg, { ...(o||{}), type: 'error' }),
    info: (msg, o) => add(msg, { ...(o||{}), type: 'info' }),
    remove
  }), [add, remove])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={styles.host} aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} style={{...styles.toast, ...byType[t.type]}}>
            <div style={{flex:1}}>{t.message}</div>
            <button onClick={()=>api.remove(t.id)} style={styles.closeBtn} aria-label="Fermer">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(){
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>')
  return ctx
}

const styles = {
  host: {
    position:'fixed', right:16, bottom:16, zIndex:9999,
    display:'flex', flexDirection:'column', gap:10, maxWidth:'min(420px, 90vw)'
  },
  toast: {
    display:'flex', alignItems:'center', gap:10,
    padding:'10px 12px', borderRadius:10, border:'1px solid #333',
    background:'#121212', color:'#eee', boxShadow:'0 8px 20px rgba(0,0,0,.35)'
  },
  closeBtn: {
    border:'none', background:'transparent', color:'#bbb',
    cursor:'pointer', fontSize:16, lineHeight:1
  }
}

const byType = {
  success: { borderColor:'rgba(34,197,94,.55)', background:'#0d1a12' },
  error:   { borderColor:'rgba(239,68,68,.55)', background:'#1a0f10' },
  info:    { borderColor:'#333', background:'#121212' }
}
