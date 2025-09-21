/* content_script.js */
(async function () {
  try {
    const pw = document.querySelector('input[type="password"]');
    if (!pw) return; // rien à faire
    const origin = location.origin;

    // demande au background -> host natif
    const resp = await browser.runtime.sendMessage({ action: "requestLogins", origin });

    if (!resp || resp.status !== "ok" || !resp.logins || !resp.logins.length) {
      // pas de resultats — on peut afficher une petite icone ou log pour debug
      console.log("MonMDP autofill : aucun login trouvé pour", origin, resp);
      return;
    }

    const login = resp.logins[0];

    // heuristique pour trouver un champ username
    const selectors = [
      'input[type="email"]',
      'input[name*=user i]',
      'input[id*=user i]',
      'input[name*=login i]',
      'input[id*=login i]',
      'input[type="text"]'
    ];
    let user = null;
    for (let s of selectors) {
      user = document.querySelector(s);
      if (user) break;
    }
    if (user) user.focus(), user.value = login.username;

    pw.focus();
    pw.value = login.password;

    // Optionnel : déclencher un évènement input pour que les frameworks JS reçoivent la valeur
    const ev = new Event('input', { bubbles: true });
    pw.dispatchEvent(ev);
    if (user) user.dispatchEvent(ev);

    console.log("MonMDP autofill : rempli pour", origin, login.username);

    // Optionnel : ne pas submit automatiquement pour un POC. Pour submit, décommenter :
    // const form = pw.form || pw.closest('form');
    // if (form) form.submit();
  } catch (e) {
    console.error("Erreur content_script MonMDP:", e);
  }
})();
