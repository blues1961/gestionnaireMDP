// background.js
// Ecoute les messages des content scripts et interroge le host natif
browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.action === "requestLogins") {
    const hostName = "com.monapp.nativehost";
    // sendNativeMessage retourne une Promise
    return browser.runtime.sendNativeMessage(hostName, {
      action: "getLogins",
      origin: msg.origin
    }).then(response => {
      // response est un objet JSON renvoyé par le host
      return response;
    }).catch(err => {
      console.error("Erreur native messaging:", err);
      return { status: "error", reason: String(err) };
    });
  }
});
