import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { decryptPayload, ensureKeyPair } from '../utils/crypto'
import { useNavigate } from 'react-router-dom'

export default function KeyCheck() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [summary, setSummary] = useState(null) // { total, ok, fail }
  const [results, setResults] = useState([])   // [{id, title, ok, reason?}]
  const [sample, setSample] = useState(null)   // premier échec (pour l'exemple)

  useEffect(() => {
    (async () => {
      setLoading(true)
      setError('')
      try {
        await ensureKeyPair()
        const items = await api.passwords.list()

        const res = []
        let example = null
        for (const it of items || []) {
          try {
            await decryptPayload(it.ciphertext)
            res.push({ id: it.id, title: it.title || '', ok: true })
          } catch (e) {
            const reason = e?.message || 'Déchiffrement impossible'
            res.push({ id: it.id, title: it.title || '', ok: false, reason })
            if (!example) example = it
          }
        }

        setResults(res)
        setSummary({ total: res.length, ok: res.filter(r => r.ok).length, fail: res.filter(r => !r.ok).length })
        setSample(example)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <main className="container">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Vérification de la clé de chiffrement</h2>
        <button className="btn btn--light" onClick={() => navigate('/vault')} title="Revenir à la voûte">← Retour à la voûte</button>
      </div>

      {loading && <p>Test de déchiffrement en cours…</p>}
      {error && <p className="error">Erreur: {error}</p>}

      {!loading && !error && (
        <>
          {summary && (
            <section className="card">
              <div>Entrées totales : <strong>{summary.total}</strong></div>
              <div>Déchiffrées OK : <strong className="ok">{summary.ok}</strong></div>
              <div>Échecs : <strong className="bad">{summary.fail}</strong></div>
            </section>
          )}

          {/* Liste détaillée avec indicateur couleur */}
          {results.length > 0 && (
            <section className="card" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Détails par entrée</div>
              <ul className="list">
                {results.map((r) => (
                  <li key={r.id} className="item">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.title || '(sans titre)'}</div>
                        {!r.ok && (
                          <div className="small dim">Échec : {r.reason || '—'}</div>
                        )}
                      </div>
                      <div className={`small ${r.ok ? 'ok' : 'bad'}`}>
                        <span style={{ marginRight: 6 }}>●</span>
                        {r.ok ? 'OK' : 'Échec'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary?.fail > 0 && (
            <p className="bad" style={{ marginTop: 10 }}>
              Certaines entrées ne sont pas déchiffrables avec la clé actuelle. Vérifie que tu as importé le
              <em> même</em> fichier JSON et la même passphrase que lors de l’export précédent.
            </p>
          )}

          {sample && (
            <section className="card" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>Exemple d’entrée problématique</div>
              <div className="small dim">ID: {sample.id} — {sample.title || '(sans titre)'}</div>
              <details style={{ marginTop: 6 }}>
                <summary>Voir le ciphertext brut</summary>
                <pre className="code">{JSON.stringify(sample.ciphertext, null, 2)}</pre>
              </details>
            </section>
          )}
        </>
      )}
    </main>
  )
}
