import React, { useState } from 'react'

function randomChar(pool){ return pool[Math.floor(Math.random() * pool.length)] }

export default function PasswordGenerator({ onGenerate }){
  const [length, setLength] = useState(20)
  const [useSymbols, setUseSymbols] = useState(true)
  const [useDigits, setUseDigits] = useState(true)
  const [useUpper, setUseUpper] = useState(true)

  const generate = () => {
    const lowers = 'abcdefghijklmnopqrstuvwxyz'
    const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const digits = '0123456789'
    const symbols = '!@#$%^&*()-_=+[]{};:,.?/'
    let pool = lowers
    if (useUpper) pool += uppers
    if (useDigits) pool += digits
    if (useSymbols) pool += symbols
    let out = ''
    for (let i=0;i<length;i++) out += randomChar(pool)
    onGenerate?.(out)
  }

  return (
    <div className="password-generator">
      <h3 className="password-generator__title">Générateur</h3>
      <label className="password-generator__field">Longueur: <input type="number" min="8" max="128" value={length} onChange={e=>setLength(parseInt(e.target.value))} /></label>
      <label className="password-generator__field"><input type="checkbox" checked={useUpper} onChange={e=>setUseUpper(e.target.checked)} /> Majuscules</label>
      <label className="password-generator__field"><input type="checkbox" checked={useDigits} onChange={e=>setUseDigits(e.target.checked)} /> Chiffres</label>
      <label className="password-generator__field"><input type="checkbox" checked={useSymbols} onChange={e=>setUseSymbols(e.target.checked)} /> Symboles</label>
      <button className="btn" onClick={generate}>Générer</button>
    </div>
  )
}
