// background.js — pont content_script <-> host natif (Firefox & Chrome, MV2)
(() => {
  'use strict';

  const B = typeof browser !== 'undefined' ? browser : chrome;

  const DEFAULT_RULES = typeof MONMDP_DEFAULT_SITE_RULES === 'object' && MONMDP_DEFAULT_SITE_RULES !== null
    ? MONMDP_DEFAULT_SITE_RULES
    : {};

  function cloneRule(rule) {
    if (!rule || typeof rule !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(rule));
    } catch (_) {
      return null;
    }
  }

  function getRuleMeta(rule) {
    if (!rule || typeof rule !== 'object') {
      return { version: 0, fromUser: false, isDefault: false };
    }
    const meta = rule.meta && typeof rule.meta === 'object' ? rule.meta : {};
    const version = typeof meta.version === 'number'
      ? meta.version
      : typeof rule.__version === 'number'
        ? rule.__version
        : 0;
    const fromUser = meta.fromUser === true || rule.__fromUser === true;
    const isDefault = meta.default === true || rule.__default === true;
    return { version, fromUser, isDefault };
  }

  function withMeta(rule, { version, fromUser, isDefault }) {
    if (!rule || typeof rule !== 'object') return null;
    const copy = cloneRule(rule) || {};
    const meta = copy.meta && typeof copy.meta === 'object' ? { ...copy.meta } : {};
    if (typeof version === 'number') {
      meta.version = version;
      copy.__version = version;
    }
    if (typeof fromUser !== 'undefined') {
      meta.fromUser = !!fromUser;
      copy.__fromUser = !!fromUser;
    }
    if (typeof isDefault !== 'undefined') {
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

  // Adapte ce nom si besoin (doit correspondre au host natif déclaré côté système)
  const NATIVE_HOST_NAME = 'com.monapp.nativehost';

  // Option de secours pour tests locaux (mettre à null en prod)
  const FALLBACK_CREDS = null;
  // Exemple de test (à commenter/supprimer) :
  // const FALLBACK_CREDS = { ok: true, username: 'sylvain', password: 'test', remember: true, autosubmit: false };

  B.runtime.onInstalled.addListener(async () => {
    try {
      const { monmdp_sites } = await B.storage.local.get('monmdp_sites');
      const existing = monmdp_sites || {};
      const map = { ...existing };
      let changed = false;

      for (const [origin, baseRule] of Object.entries(DEFAULT_RULES)) {
        const preparedDefaultRule = prepareDefaultRule(baseRule);
        const defaultMeta = getRuleMeta(preparedDefaultRule);
        const stored = map[origin];
        const storedMeta = getRuleMeta(stored);

        if (!stored || (!storedMeta.fromUser && storedMeta.version < defaultMeta.version)) {
          map[origin] = preparedDefaultRule;
          changed = true;
        } else if (stored && (!stored.meta || typeof stored.meta !== 'object')) {
          map[origin] = withMeta(stored, {
            version: storedMeta.version,
            fromUser: storedMeta.fromUser,
            isDefault: storedMeta.isDefault
          });
          changed = true;
        }
      }

      if (changed) {
        await B.storage.local.set({ monmdp_sites: map });
        console.debug('[MonMDP background] Default autofill rules registered/updated');
      }
    } catch (e) {
      console.warn('[MonMDP background] Unable to register default rules:', e);
    }
  });

  function normalizeNativeResponse(resp) {
    // Objectif: toujours renvoyer { ok: true, username, password, remember?, autosubmit? } si possible
    if (!resp) return { ok: false, error: 'no_response' };
    if (resp.ok === true) return resp;

    // Certains hosts renvoient { status: "ok", ... }
    if (resp.status && String(resp.status).toLowerCase() === 'ok') {
      return { ok: true, ...resp };
    }

    // Tolérance: si username & password existent, on considère ok
    if (typeof resp.username === 'string' && typeof resp.password === 'string') {
      return { ok: true, ...resp };
    }

    // Erreurs possibles
    const reason = resp.error || resp.reason || 'invalid_response';
    return { ok: false, error: reason };
  }

  async function fetchFromNative(payload) {
    try {
      const resp = await B.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
        action: 'getLogins',   // conserve l’API actuelle de ton host
        origin: payload.origin,
        url: payload.url
      });
      return normalizeNativeResponse(resp);
    } catch (e) {
      console.warn('[MonMDP background] Native host error:', e);
      return { ok: false, error: String(e) };
    }
  }

  // Unifie les anciens et nouveaux messages
  B.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      const isNew = msg && msg.type === 'MonMDP:getCredentials';
      const isOld = msg && msg.action === 'requestLogins';
      if (!isNew && !isOld) return; // ignore le reste

      // Déduire origin/url si non fournis par le message
      const senderUrl = sender && sender.url ? sender.url : null;
      const origin = msg.origin || (senderUrl ? new URL(senderUrl).origin : null) || null;
      const url    = msg.url    || senderUrl || null;

      // 1) interroger le host natif
      let creds = await fetchFromNative({ origin, url });

      // 2) fallback éventuel pour tests
      if (!creds.ok && FALLBACK_CREDS) {
        creds = normalizeNativeResponse(FALLBACK_CREDS);
      }

      // 3) répondre au content script
      sendResponse(creds.ok ? creds : { ok: false, error: creds.error || 'unavailable' });
    })();

    // Indique qu’on répondra de façon asynchrone (Chrome MV2)
    return true;
  });
})();
