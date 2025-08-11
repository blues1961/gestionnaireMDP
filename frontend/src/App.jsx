import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import LoginForm from './components/LoginForm'
import PasswordList from './components/PasswordList'
import PasswordForm from './components/PasswordForm'
import PasswordEdit from './components/PasswordEdit'
import CategoryManager from './components/CategoryManager'
import CategoryGuide from './components/CategoryGuide'
import { setToken, initToken } from './api'
import { ensureKeyPair } from './utils/crypto'
import KeyBackup from './components/KeyBackup'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [booted, setBooted] = useState(false) // on attend le rechargement du token
  const navigate = useNavigate()

  useEffect(() => {
    // Génère/charge la paire RSA et restaure le JWT si présent
    ensureKeyPair().catch(console.error)
    const t = initToken()
    if (t) setAuthed(true)
    setBooted(true)
  }, [])

  const onLogin = async (tokens) => {
    setToken(tokens.access)
    setAuthed(true)
    navigate('/vault')
  }

  const Private = ({ children }) => {
    if (!booted) return null           // évite une redirection prématurée
    return authed ? children : <Navigate to="/" />
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LoginForm onLogin={onLogin} />} />

      {/* Protégées */}
      <Route path="/vault" element={<Private><PasswordList /></Private>} />
      <Route path="/new" element={<Private><PasswordForm /></Private>} />
      <Route path="/edit/:id" element={<Private><PasswordEdit /></Private>} />
      <Route path="/categories" element={<Private><CategoryManager /></Private>} />
      <Route path="/category-guide" element={<Private><CategoryGuide /></Private>} />
      <Route path="/key-backup" element={<Private><KeyBackup /></Private>} />

      {/* Divers */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
