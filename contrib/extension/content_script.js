/* content_script.js — MonMDP autofill (avec fallback si pas de login pour l'origin) */
(async function () {
  try {
    const pw = document.querySelector('input[type="password"]');
    if (!pw) return; // rien à faire
    const origin = location.origin;

    // demande au background / host pour cet origin
    let resp = await browser.runtime.sendMessage({ action: "requestLogins", origin });

    // si aucune entrée pour l'origin, fallback : demander sans origin (toutes les entrées)
    if (!resp || resp.status !== "ok" || !resp.logins || !resp.logins.length) {
      resp = await browser.runtime.sendMessage({ action: "requestLogins", origin: "" });
      if (!resp || resp.status !== "ok" || !resp.logins || !resp.logins.length) {
        console.log("MonMDP autofill : aucun login trouvé pour", origin, resp);
        return;
      }
    }

    const login = resp.logins[0]; // POC : remplir la première entrée trouvée

    // heuristique pour trouver un champ username
    const selectors = [
      'input[type="email"]',
      'input[name*=user i]',
      'input[id*=user i]',
      'input[name*=login i]',
      'input[id*=login i]',
      'input[name*=email i]',
      'input[id*=email i]',
      'input[type="text"]'
    ];
    let user = null;
    for (let s of selectors) {
      try {
        user = document.querySelector(s);
      } catch (e) {
        user = null;
      }
      if (user) break;
    }

    if (user) {
      user.focus();
      user.value = login.username || login.user || "";
      user.dispatchEvent(new Event('input', { bubbles: true }));
    }

    pw.focus();
    pw.value = login.password || login.pass || "";
    pw.dispatchEvent(new Event('input', { bubbles: true }));

    console.log("MonMDP autofill : rempli pour", origin, login.username || login.user || "(sans username)", login.title || "");
  } catch (e) {
    console.error("Erreur content_script MonMDP:", e);
  }
})();
