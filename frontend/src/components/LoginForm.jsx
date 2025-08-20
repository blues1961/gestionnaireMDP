import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const submit = async (e) => {
    e?.preventDefault?.()
    setError(null)
    try {
      const tokens = await api.login(username, password)
      onLogin?.(tokens)
      navigate('/vault', { replace: true })
    } catch (err) {
      setError('Échec de connexion')
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '10vh auto', fontFamily: 'system-ui' }}>
      <h1>Connexion</h1>
      {/* on bloque toute soumission native */}
      <form action="#" method="post" onSubmit={(e)=>e.preventDefault()} noValidate>
        <label>Utilisateur<br/>
          <input value={username} onChange={e=>setUsername(e.target.value)} required />
        </label>
        <br/>
        <label>Mot de passe<br/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        </label>
        <br/>
        <button type="button" onClick={submit}>Se connecter</button>
      </form>
      {error && <p style={{color:'crimson'}}>{error}</p>}
      <p style={{marginTop:24, color:'#555'}}>Créez un superuser côté serveur la première fois.</p>
    </main>
  )
}
