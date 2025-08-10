(function(){
  // MVP: détecte les champs password et propose un bouton inline
  const pass = document.querySelector('input[type="password"]')
  if(!pass) return
  const btn = document.createElement('button')
  btn.textContent = 'Remplir (MVP)'
  btn.style.marginLeft = '8px'
  btn.onclick = () => {
    // Dans une version plus aboutie, on récupère depuis l'app les credentials pour l'URL courante.
    // Ici on montre juste le hook.
    alert('Connectez l’extension à l’app pour remplir automatiquement.')
  }
  pass.parentElement?.appendChild(btn)
})()
