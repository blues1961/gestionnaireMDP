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
    <div style={{border:'1px solid #ddd', padding:12, borderRadius:8}}>
      <h3>Générateur</h3>
      <label>Longueur: <input type="number" min="8" max="128" value={length} onChange={e=>setLength(parseInt(e.target.value))} /></label><br/>
      <label><input type="checkbox" checked={useUpper} onChange={e=>setUseUpper(e.target.checked)} /> Majuscules</label><br/>
      <label><input type="checkbox" checked={useDigits} onChange={e=>setUseDigits(e.target.checked)} /> Chiffres</label><br/>
      <label><input type="checkbox" checked={useSymbols} onChange={e=>setUseSymbols(e.target.checked)} /> Symboles</label><br/>
      <button onClick={generate}>Générer</button>
    </div>
  )
}
