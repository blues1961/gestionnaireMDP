// content_script.js
(() => {
  const B = typeof browser !== "undefined" ? browser : chrome;

  // ---- Utils ---------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...args) => console.debug("[MonMDP content]", ...args);

  function showStatus(message) {
    const id = "monmdp-status";
    let el = document.getElementById(id);
    if (!message) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.position = "fixed";
      el.style.top = "12px";
      el.style.right = "12px";
      el.style.zIndex = "2147483647";
      el.style.background = "rgba(34,51,102,0.88)";
      el.style.color = "#fff";
      el.style.padding = "8px 14px";
      el.style.borderRadius = "6px";
      el.style.fontSize = "13px";
      el.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
      el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.25)";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
    }
    el.textContent = message;
  }

  // Cherche une règle site-spécifique éventuellement définie en storage.local
  const DEFAULT_RULES = typeof MONMDP_DEFAULT_SITE_RULES === "object" && MONMDP_DEFAULT_SITE_RULES !== null
    ? MONMDP_DEFAULT_SITE_RULES
    : {};

  function cloneRule(rule) {
    if (!rule || typeof rule !== "object") return null;
    try {
      return JSON.parse(JSON.stringify(rule));
    } catch (_) {
      return null;
    }
  }

  function getRuleMeta(rule) {
    if (!rule || typeof rule !== "object") {
      return { version: 0, fromUser: false, isDefault: false };
    }
    const meta = rule.meta && typeof rule.meta === "object" ? rule.meta : {};
    const version = typeof meta.version === "number"
      ? meta.version
      : typeof rule.__version === "number"
        ? rule.__version
        : 0;
    const fromUser = meta.fromUser === true || rule.__fromUser === true;
    const isDefault = meta.default === true || rule.__default === true;
    return { version, fromUser, isDefault };
  }

  function withMeta(rule, { version, fromUser, isDefault }) {
    if (!rule || typeof rule !== "object") return null;
    const copy = cloneRule(rule) || {};
    const meta = copy.meta && typeof copy.meta === "object" ? { ...copy.meta } : {};
    if (typeof version === "number") {
      meta.version = version;
      copy.__version = version;
    }
    if (typeof fromUser !== "undefined") {
      meta.fromUser = !!fromUser;
      copy.__fromUser = !!fromUser;
    }
    if (typeof isDefault !== "undefined") {
      meta.default = !!isDefault;
      copy.__default = !!isDefault;
    }
    copy.meta = meta;
    return copy;
  }

  function prepareDefaultRule(rule) {
    if (!rule) return null;
    const meta = getRuleMeta(rule);
    const version = meta.version || 0;
    return withMeta(rule, {
      version,
      fromUser: false,
      isDefault: true
    });
  }

  function normalizeLoginEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const out = { ...entry };

    if (typeof out.origin === "string") {
      const normOrigin = out.origin.trim().toLowerCase();
      out.origin = normOrigin || undefined;
    } else if (typeof out.url === "string") {
      try {
        const hasScheme = out.url.includes("://");
        const urlObj = hasScheme ? new URL(out.url) : new URL(out.url, "https://placeholder.local");
        if (urlObj.origin && urlObj.origin !== "null") {
          out.origin = urlObj.origin.toLowerCase();
        }
      } catch (_) {
        // ignore invalid URLs
      }
    }

    const username = [out.username, out.login, out.user, out.identifiant, out.email]
      .map((v) => (typeof v === "string" ? v.trim() : v))
      .find((v) => typeof v === "string" && v.length > 0);
    const password = [out.password, out.pass, out.mdp, out.secret]
      .map((v) => (typeof v === "string" ? v : v))
      .find((v) => typeof v === "string" && v.length > 0);
    if (!username || !password) return null;

    out.username = username;
    out.password = password;

    const rememberRaw = out.remember ?? out.rememberMe ?? out.remember_me ?? out.keepSignedIn;
    if (typeof rememberRaw !== "undefined") {
      if (typeof rememberRaw === "boolean") {
        out.remember = rememberRaw;
      } else if (typeof rememberRaw === "string") {
        const lower = rememberRaw.toLowerCase();
        out.remember = ["1", "true", "yes", "on"].includes(lower);
      } else {
        out.remember = !!rememberRaw;
      }
    }

    const autosubmitRaw = out.autosubmit ?? out.autoSubmit ?? out.auto_submit;
    if (typeof autosubmitRaw !== "undefined") {
      if (typeof autosubmitRaw === "boolean") {
        out.autosubmit = autosubmitRaw;
      } else if (typeof autosubmitRaw === "string") {
        const lower = autosubmitRaw.toLowerCase();
        out.autosubmit = ["1", "true", "yes", "on"].includes(lower);
      } else {
        out.autosubmit = !!autosubmitRaw;
      }
    }

    return out;
  }

  function pickBestLogin(response, origin) {
    if (!response || typeof response !== "object") return null;
    const direct = normalizeLoginEntry(response);
    if (direct) return direct;

    const list = Array.isArray(response.logins) ? response.logins : [];
    if (!list.length) return null;

    let best = null;
    let bestScore = -Infinity;
    const o = typeof origin === "string" ? origin.toLowerCase() : null;
    for (const rawEntry of list) {
      const entry = normalizeLoginEntry(rawEntry);
      if (!entry) continue;
      let score = 0;
      const entryOrigin = typeof entry.origin === "string" ? entry.origin.toLowerCase() : null;

      if (typeof rawEntry.score === "number") score += rawEntry.score;
      if (typeof entry.title === "string" && o && entry.title.toLowerCase().includes(o)) score += 2;
      if (o && entryOrigin) {
        if (entryOrigin === o) score += 40;
        else if (entryOrigin.includes(o) || o.includes(entryOrigin)) score += 10;
      }
      const uname = typeof entry.username === "string" ? entry.username.trim().toLowerCase() : "";
      if (uname && ["user", "username", "utilisateur", "default", "admin"].includes(uname)) {
        score -= 10;
      }
      if (!best || score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return best;
  }

  function normalizeCreds(raw, origin) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.ok === false) return null;
    return pickBestLogin(raw, origin);
  }

  async function loadSiteRule() {
    const origin = location.origin;
    const baseDefaultRule = DEFAULT_RULES[origin] || null;
    const preparedDefaultRule = prepareDefaultRule(baseDefaultRule);
    const defaultMeta = getRuleMeta(preparedDefaultRule);

    try {
      const { monmdp_sites } = await B.storage.local.get("monmdp_sites");
      const map = { ...(monmdp_sites || {}) };
      let rule = map[origin] || null;
      const storedMeta = getRuleMeta(rule);
      const shouldRegisterDefault = preparedDefaultRule && (!rule || (!storedMeta.fromUser && storedMeta.version < defaultMeta.version));

      if (shouldRegisterDefault) {
        map[origin] = preparedDefaultRule;
        await B.storage.local.set({ monmdp_sites: map });
        rule = preparedDefaultRule;
        log(storedMeta.version ? "Default site rule upgraded for" : "Default site rule registered for", origin, rule);
      } else if (rule) {
        if (!rule.meta || typeof rule.meta !== "object") {
          const upgraded = withMeta(rule, {
            version: storedMeta.version,
            fromUser: storedMeta.fromUser,
            isDefault: storedMeta.isDefault
          });
          map[origin] = upgraded;
          await B.storage.local.set({ monmdp_sites: map });
          rule = upgraded;
          log("Site rule metadata upgraded for", origin, rule);
        } else {
          log("Site rule found for", origin, rule);
        }
      } else if (preparedDefaultRule) {
        rule = preparedDefaultRule;
      }

      return rule;
    } catch (e) {
      console.warn("storage.local.get error:", e);
      return preparedDefaultRule;
    }
  }

  // Détection robuste des champs (avec ou sans "form#loginForm")
  function detectLoginFields(root = document, rule = null) {
    // 0) Règle site-spécifique prioritaire
    if (rule && rule.fields) {
      const form    = rule.form ? root.querySelector(rule.form) : (root.querySelector("#loginForm") || root.querySelector("form"));
      const username = rule.fields.username ? root.querySelector(rule.fields.username) : null;
      const password = rule.fields.password ? root.querySelector(rule.fields.password) : null;
      const remember = rule.fields.remember ? root.querySelector(rule.fields.remember) : null;
      const submit   = rule.submit ? root.querySelector(rule.submit) : null;
      if (username || password) return { form, username, password, remember, submit, fromRule: true };
    }

    // 1) cibler le formulaire si présent, sinon fallback = premier form contenant un password
    let form = root.querySelector("#loginForm");
    if (!form) {
      const pwd = root.querySelector('input[type="password"]');
      if (pwd) form = pwd.closest("form") || root.querySelector("form");
    }

    // 2) username heuristique
    let username =
      form?.querySelector(
        '#usernameInput-input, input[data-bc="usernameInput"], input[name="usernameInput"], ' +
        'input[type="text"][id*="user" i], input[type="text"][name*="user" i], ' +
        'input[type="text"][id*="ident" i], input[type="text"][name*="ident" i], ' +
        'input[type="text"][id*="card" i], input[type="text"][name*="card" i], ' +
        'input[type="text"][id*="login" i], input[type="text"][name*="login" i], ' +
        'input:not([type])[id*="user" i], input:not([type])[name*="user" i], ' +
        'input:not([type])[id*="ident" i], input:not([type])[name*="ident" i], ' +
        'input:not([type])[id*="login" i], input:not([type])[name*="login" i], ' +
        'input:not([type])[id*="card" i], input:not([type])[name*="card" i], ' +
        'input[type="email"], input:not([type])'
      ) ||
      root.querySelector(
        '#usernameInput-input, input[data-bc="usernameInput"], input[name="usernameInput"], ' +
        'input[type="text"][name*="user" i], input[type="text"][name*="login" i], input[type="email"], ' +
        'input:not([type])[name*="user" i], input:not([type])[name*="login" i], input:not([type])'
      );

    if (!username && form) {
      username = form.querySelector('input:not([type]):not([disabled]), input[type="text"]:not([disabled]), input[type="email"]:not([disabled])');
    }

    // 3) password heuristique
    const password =
      form?.querySelector('#password-input, input[data-bc="password"], input[name="password"], input[type="password"]') ||
      root.querySelector('#password-input, input[data-bc="password"], input[name="password"], input[type="password"]');

    // 4) remember me optionnel
    const remember =
      form?.querySelector('#rememberMe, input[data-bc="rememberMe"], input[type="checkbox"][name*="remember" i]') ||
      root.querySelector('#rememberMe, input[data-bc="rememberMe"]');

    // 5) submit
    const submit =
      form?.querySelector('#signIn, button[type="submit"], input[type="submit"]') ||
      root.querySelector('#signIn, button[type="submit"], input[type="submit"]');

    return { form, username, password, remember, submit, fromRule: false };
  }

  // Demande les identifiants au background (qui lui parle au host natif)
  async function requestCredentials() {
    try {
      const response = await B.runtime.sendMessage({
        type: "MonMDP:getCredentials",
        origin: location.origin,
        url: location.href
      });
      // attendu: { ok: true, username: "...", password: "...", remember: true/false, autosubmit: false }
      if (!response || !response.ok) {
        log("Credential request rejected", response);
        return null;
      }
      return response;
    } catch (e) {
      console.warn("sendMessage error:", e);
      return null;
    }
  }

  async function requestCredentialsWithRule(rule) {
    const origin = location.origin;
    let response = await requestCredentials();
    if (!response) return null;

    const creds = normalizeCreds(response, origin);
    if (!creds) {
      log("No usable credentials returned", response);
      return null;
    }

    if (rule && typeof rule.autosubmit === "boolean" && typeof creds.autosubmit === "undefined") {
      creds.autosubmit = rule.autosubmit;
    }
    return creds;
  }

  function mark(el) {
    if (!el) return;
    el.style.outline = "2px dashed rgba(80,120,255,.7)";
    el.style.outlineOffset = "2px";
    setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, 1500);
  }

  // Setter compatible avec inputs "contrôlés" (React, etc.)
  function setInputValue(el, value) {
    try {
      const proto = Object.getPrototypeOf(el) || el.__proto__;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && typeof desc.set === "function") {
        desc.set.call(el, value); // utilise le setter natif
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur",   { bubbles: true }));
    } catch (_) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  async function fillOnce({ username, password, remember, submit }, creds) {
    let filled = false;

    const usernameValue = typeof creds?.username === "string" ? creds.username :
      (typeof creds?.login === "string" ? creds.login : typeof creds?.user === "string" ? creds.user : null);
    const passwordValue = typeof creds?.password === "string" ? creds.password :
      (typeof creds?.pass === "string" ? creds.pass : typeof creds?.mdp === "string" ? creds.mdp : null);
    const rememberValueRaw = typeof creds?.remember !== "undefined" ? creds.remember :
      (typeof creds?.rememberMe !== "undefined" ? creds.rememberMe : creds?.remember_me);
    const rememberValue = typeof rememberValueRaw === "boolean"
      ? rememberValueRaw
      : typeof rememberValueRaw === "string"
        ? ["1", "true", "yes", "on"].includes(rememberValueRaw.toLowerCase())
        : rememberValueRaw != null ? !!rememberValueRaw : undefined;

    if (username && typeof usernameValue === "string") {
      username.focus();
      //username.value = creds.username;
      setInputValue(username, usernameValue);

      username.dispatchEvent(new Event("input", { bubbles: true }));
      mark(username);
      filled = true;
    }
    if (password && typeof passwordValue === "string") {
      password.focus();
      //password.value = creds.password;
      setInputValue(password, passwordValue);
      password.dispatchEvent(new Event("input", { bubbles: true }));
      mark(password);
      filled = true;
    }
    if (remember && typeof rememberValue !== "undefined") {
      if (remember.checked !== !!rememberValue) {
        remember.click();
      }
      mark(remember);
    }

    // Par défaut: ne PAS auto-soumettre (sécurité). Active seulement si creds.autosubmit === true
    if (filled && creds.autosubmit && submit) {
      await sleep(100); // laisse le temps aux frameworks de réagir
      submit.click();
    }

    return filled;
  }

  async function main() {
    showStatus("Recherche des identifiants…");
    const rule = await loadSiteRule();
    let creds = await requestCredentialsWithRule(rule);

    // Log minimal pour diagnostiquer la chaîne background/host
    log("creds?", creds && creds.ok ? "ok" : creds);

    // 1) Essai immédiat
    let fields = detectLoginFields(document, rule);
    if (fields.username || fields.password) {
      log("Fields detected (immediate)", { fromRule: fields.fromRule });
      creds = creds || await requestCredentialsWithRule(rule);
      if (creds) {
        const ok = await fillOnce(fields, creds);
        if (ok) {
          showStatus(null);
          return; // rempli → on s'arrête
        }
      } else {
        showStatus(null);
      }
    }

    // 2) Sinon, attendre que le DOM finalise (SPA / hydratation)
    const obs = new MutationObserver(async () => {
      fields = detectLoginFields(document, rule);
      if (fields.username || fields.password) {
        log("Fields detected (observer)", { fromRule: fields.fromRule });
        creds = creds || await requestCredentialsWithRule(rule);
        if (creds) {
          const ok = await fillOnce(fields, creds);
          if (ok) {
            showStatus(null);
            obs.disconnect();
          }
        } else {
          showStatus(null);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Auto-timeout de sûreté
    setTimeout(() => {
      obs.disconnect();
      showStatus(null);
    }, 10000);
  }

  // Démarrer au chargement du document_idle (cf. manifest)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void main(), { once: true });
  } else {
    void main();
  }
})();
