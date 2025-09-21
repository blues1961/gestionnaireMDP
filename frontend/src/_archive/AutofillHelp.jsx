import React from 'react'

export default function AutofillHelp(){
  return (
    <main style={{maxWidth:720, margin:'5vh auto', fontFamily:'system-ui'}}>
      <h2>Autofill — aide rapide</h2>
      <ol>
        <li>Installez/chargez l'extension (dossier <code>contrib/extension/</code>) en mode développeur dans votre navigateur.</li>
        <li>Sur une page de connexion, l’extension détecte les champs et propose un remplissage.</li>
        <li>Alternative: utilisez le bouton "Copier" pour transférer le mot de passe depuis le coffre.</li>
      </ol>
      <p>Version MVP — à améliorer avec un service worker et communication avec l’app web.</p>
    </main>
  )
}
