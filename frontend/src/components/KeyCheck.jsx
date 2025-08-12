import React, { useEffect, useState } from "react";
import { api } from "../api";
import { decryptPayload, ensureKeyPair } from "../utils/crypto";
import { useNavigate } from "react-router-dom";

export default function KeyCheck() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [sample, setSample] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        await ensureKeyPair(); // s’assure qu’une clé est présente (importée ou existante)
        const items = await api.passwords.list(); // [{id, title, ciphertext, ...}]
        if (!items || items.length === 0) {
          setSummary({ total: 0, ok: 0, fail: 0, details: [] });
          setSample(null);
          setLoading(false);
          return;
        }

        let ok = 0, fail = 0;
        const details = [];
        for (const it of items) {
          try {
            await decryptPayload(it.ciphertext);
            ok += 1;
            details.push({ id: it.id, title: it.title, ok: true });
            if (!sample) setSample(it);
          } catch {
            fail += 1;
            details.push({ id: it.id, title: it.title, ok: false });
          }
        }
        setSummary({ total: items.length, ok, fail, details });
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main style={{maxWidth: 900, margin: "4vh auto", padding: "0 16px", fontFamily: "system-ui"}}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12}}>
        <h2 style={{margin:0, flex:1}}>Vérification de la clé de chiffrement</h2>
        <button
          onClick={() => navigate("/vault")}
          style={{padding:"8px 12px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer"}}
          title="Revenir à la voûte"
        >
          ← Retour à la voûte
        </button>
      </div>

      {loading && <p>Test de déchiffrement en cours…</p>}
      {error && <p style={{color:"crimson"}}>Erreur: {error}</p>}

      {!loading && !error && (
        <>
          {summary && (
            <section style={{border:"1px solid #eee", padding:12, borderRadius:10, marginTop:8}}>
              <div>Entrées totales : <strong>{summary.total}</strong></div>
              <div>Déchiffrées OK : <strong style={{color:"#0a7a34"}}>{summary.ok}</strong></div>
              <div>Échecs : <strong style={{color:"#b00020"}}>{summary.fail}</strong></div>
            </section>
          )}

          {summary?.fail > 0 && (
            <p style={{marginTop:10, color:"#b00020"}}>
              Certaines entrées ne sont pas déchiffrables avec la clé actuelle. Vérifie que tu as importé le
              <em> même</em> fichier JSON et la même passphrase que lors de l’export précédent.
            </p>
          )}

          {summary?.details?.length > 0 && (
            <section style={{marginTop:16}}>
              <h3>Détails</h3>
              <ul style={{listStyle:"none", padding:0}}>
                {summary.details.map(d => (
                  <li key={d.id} style={{
                    border:"1px solid #eee",
                    borderLeft:`4px solid ${d.ok ? "#0a7a34" : "#b00020"}`,
                    padding:"8px 10px",
                    borderRadius:8,
                    marginBottom:8
                  }}>
                    <strong>#{d.id}</strong> — {d.title || "(sans titre)"} — {d.ok ? "OK" : "ÉCHEC"}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sample && (
            <section style={{marginTop:16}}>
              <h3>Exemple testé</h3>
              <div style={{fontSize:14, color:"#555"}}>ID: {sample.id} — {sample.title || "(sans titre)"}</div>
              <details style={{marginTop:6}}>
                <summary>Voir le ciphertext brut</summary>
                <pre style={{background:"#f6f6f6", padding:10, borderRadius:8, overflow:"auto"}}>
{JSON.stringify(sample.ciphertext, null, 2)}
                </pre>
              </details>
            </section>
          )}
        </>
      )}
    </main>
  );
}
