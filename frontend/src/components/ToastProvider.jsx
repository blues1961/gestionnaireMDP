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
      <div className="toast-host" aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <div className="toast__message">{t.message}</div>
            <button onClick={()=>api.remove(t.id)} className="toast__close" aria-label="Fermer">✕</button>
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
