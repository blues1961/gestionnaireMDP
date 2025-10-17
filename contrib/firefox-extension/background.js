'use strict';

(function initBackground() {
  const B = typeof browser !== 'undefined' ? browser : chrome;

  const STORAGE_KEYS = {
    CONFIG: 'monmdp_config',
    TOKENS: 'monmdp_tokens',
    KEYPAIR: 'monmdp_keypair'
  };

  const state = {
    config: {},
    tokens: {},
    keyPair: null,
    cache: { entries: null, fetchedAt: 0 }
  };

  const NATIVE_HOST_NAME = 'com.monapp.nativehost';

  const COMMON_SECOND_LEVEL_TLDS = new Set([
    'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
    'co.jp', 'ne.jp', 'or.jp', 'go.jp',
    'com.au', 'net.au', 'org.au', 'edu.au',
    'com.br', 'com.ar', 'com.mx', 'com.cn',
    'com.hk', 'com.sg', 'com.tr', 'com.sa',
    'com.pl', 'com.ru', 'com.za', 'co.za'
  ]);

  const GENERIC_TOKEN_PARTS = new Set([
    'www', 'web', 'login', 'logins', 'signin', 'sign', 'auth', 'secure', 'sso',
    'account', 'accounts', 'client', 'clients', 'customer', 'customers',
    'portal', 'portail', 'portals', 'portails', 'service', 'services',
    'app', 'apps', 'prod', 'stage', 'staging', 'test', 'uat', 'beta',
    'mobile', 'online', 'secure2', 'connect', 'connexion', 'identity',
    'default', 'home', 'my', 'mon', 'the', 'id', 'ids',
    'fr', 'en', 'ca', 'us', 'qc', 'uk', 'br', 'mx', 'cn',
    'com', 'net', 'org', 'gov', 'edu', 'info', 'biz', 'io',
    'bank', 'banks', 'banque', 'banques', 'compte', 'comptes',
    'group', 'groupe', 'cloud', 'api', 'apis', 'static', 'cdn'
  ]);

  const GENERIC_TOKEN_PREFIXES = new Set([
    'secure', 'login', 'signin', 'auth', 'sso', 'www', 'portal', 'portail',
    'service', 'services', 'client', 'customer', 'app', 'apps', 'prod', 'stage',
    'staging', 'test', 'uat', 'beta', 'dev', 'mobile', 'my', 'mon', 'the',
    'api', 'cdn'
  ]);

  const GENERIC_TOKEN_SUFFIXES = new Set([
    'secure', 'login', 'signin', 'auth', 'sso', 'portal', 'portail', 'service',
    'services', 'client', 'clients', 'customer', 'customers', 'app', 'apps',
    'prod', 'stage', 'staging', 'test', 'uat', 'beta', 'dev', 'mobile',
    'online', 'connect', 'connexion', 'account', 'accounts', 'compte', 'comptes',
    'bank', 'banks', 'banque', 'banques', 'group', 'groupe'
  ]);

  const TEXT_DECODER = new TextDecoder();

  function log(...args) {
    try {
      console.debug('[GestionnaireMDP background]', ...args);
    } catch (_) {
      // ignore logging failures
    }
  }

  function normalizeNativeResponse(resp) {
    if (!resp) return { ok: false, error: 'native_no_response' };
    if (resp.ok === true) return resp;
    if (resp.status && String(resp.status).toLowerCase() === 'ok') {
      return { ok: true, ...resp };
    }
    if (typeof resp.username === 'string' && typeof resp.password === 'string') {
      return { ok: true, ...resp };
    }
    const reason = resp.error || resp.reason || resp.status || 'native_invalid_response';
    return { ok: false, error: String(reason) };
  }

  async function fetchFromNativeHost(origin, url) {
    if (!B.runtime || typeof B.runtime.sendNativeMessage !== 'function') {
      return { ok: false, error: 'native_unsupported' };
    }
    try {
      const response = await B.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
        action: 'getLogins',
        origin: origin || '',
        url: url || ''
      });
      const normalized = normalizeNativeResponse(response);
      if (!normalized.ok) {
        return { ok: false, error: normalized.error || 'native_error' };
      }
      const logins = Array.isArray(normalized.logins)
        ? normalized.logins
            .filter((entry) => entry && typeof entry.username === 'string' && typeof entry.password === 'string')
            .map((entry) => ({
              id: entry.id,
              title: entry.title || '',
              username: entry.username,
              password: entry.password,
              url: entry.url || '',
              origin: entry.origin || '',
              score: typeof entry.score === 'number' ? entry.score : 0
            }))
        : [];
      let best = null;
      if (logins.length) {
        best = logins[0];
      } else if (typeof normalized.username === 'string' && typeof normalized.password === 'string') {
        best = {
          id: normalized.id,
          title: normalized.title || '',
          username: normalized.username,
          password: normalized.password,
          url: normalized.url || '',
          origin: normalized.origin || '',
          score: typeof normalized.score === 'number' ? normalized.score : 0
        };
      }
      if (!best) {
        return { ok: false, error: 'native_no_credentials' };
      }
      const remember =
        typeof normalized.remember !== 'undefined'
          ? !!normalized.remember
          : typeof best.remember !== 'undefined'
            ? !!best.remember
            : false;
      const autosubmit =
        typeof normalized.autosubmit !== 'undefined'
          ? !!normalized.autosubmit
          : typeof best.autosubmit !== 'undefined'
            ? !!best.autosubmit
            : false;
      const payloadLogins = logins.length ? logins : [best];
      return {
        ok: true,
        username: best.username,
        password: best.password,
        remember,
        autosubmit,
        logins: payloadLogins
      };
    } catch (err) {
      log('native host error', err);
      return { ok: false, error: err && err.message ? err.message : 'native_error' };
    }
  }

  function normalizeBaseUrl(input) {
    if (!input || typeof input !== 'string') return '';
    let value = input.trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) {
      value = `https://${value}`;
    }
    if (!value.endsWith('/')) {
      value += '/';
    }
    return value;
  }

  function decodeBase64Url(str) {
    if (!str) return '';
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return TEXT_DECODER.decode(bytes);
  }

  function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
      const json = decodeBase64Url(parts[1]);
      return JSON.parse(json);
    } catch (err) {
      log('decodeJwtPayload error', err);
      return null;
    }
  }

  function getExpiresAt(token) {
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  }

  function normalizeOrigin(value) {
    if (!value || typeof value !== 'string') return null;
    let candidate = value.trim();
    if (!candidate) return null;
    if (!candidate.includes('://')) {
      candidate = `https://${candidate}`;
    }
    try {
      const url = new URL(candidate);
      if (!url.protocol || !url.hostname) return null;
      const origin = url.origin.toLowerCase();
      return origin;
    } catch (_) {
      return null;
    }
  }

  function hostnameFromUrl(value) {
    if (!value || typeof value !== 'string') return null;
    let candidate = value.trim();
    if (!candidate) return null;
    if (!candidate.includes('://')) {
      candidate = `https://${candidate}`;
    }
    try {
      const url = new URL(candidate);
      return (url.hostname || '').toLowerCase() || null;
    } catch (_) {
      return null;
    }
  }

  function registrableDomain(hostname) {
    if (!hostname) return null;
    const pure = hostname.split(':', 1)[0];
    if (!pure) return null;
    const labels = pure.split('.');
    if (labels.length < 2) return pure;
    const lastTwo = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
    if (COMMON_SECOND_LEVEL_TLDS.has(lastTwo) && labels.length >= 3) {
      const lastThree = `${labels[labels.length - 3]}.${lastTwo}`;
      return lastThree;
    }
    return lastTwo;
  }

  function stripGeneric(value) {
    if (!value) return value;
    let result = value;
    let changed = true;
    while (changed && result) {
      changed = false;
      for (const prefix of GENERIC_TOKEN_PREFIXES) {
        if (result.startsWith(prefix) && result.length - prefix.length >= 3) {
          result = result.slice(prefix.length);
          changed = true;
        }
      }
      for (const suffix of GENERIC_TOKEN_SUFFIXES) {
        if (result.endsWith(suffix) && result.length - suffix.length >= 3) {
          result = result.slice(0, -suffix.length);
          changed = true;
        }
      }
    }
    return result;
  }

  function expandToken(raw) {
    const out = new Set();
    if (!raw || typeof raw !== 'string') return out;
    let cleaned = raw.toLowerCase().trim();
    if (!cleaned) return out;
    cleaned = cleaned.replace(/[-_.]+/g, ' ').replace(/[^a-z0-9]+/g, ' ');
    if (!cleaned.trim()) return out;
    const segments = cleaned.match(/[a-z0-9]+/g) || [];
    for (const seg of segments) {
      if (!seg || /^\d+$/.test(seg) || seg.length < 3) continue;
      out.add(seg);
    }
    const joined = segments.join('');
    const stripped = stripGeneric(joined);
    if (stripped && stripped.length >= 3 && !/^\d+$/.test(stripped)) {
      out.add(stripped);
    }
    const final = new Set();
    for (const candidate of out) {
      if (!candidate || candidate.length < 3) continue;
      if (/^\d+$/.test(candidate)) continue;
      if (GENERIC_TOKEN_PARTS.has(candidate)) continue;
      final.add(candidate);
    }
    return final;
  }

  function originTokens(origin) {
    const host = hostnameFromUrl(origin);
    if (!host) return [];
    const parts = host.split(/[.\-_/]+/);
    const collected = new Set();
    for (const part of parts) {
      const expanded = expandToken(part);
      for (const token of expanded) {
        collected.add(token);
      }
    }
    return Array.from(collected).sort();
  }

  function ensureConfig() {
    const base = state.config?.apiBase;
    if (!base) {
      throw new Error('config_missing');
    }
    return base;
  }

  function buildApiUrl(path, baseOverride) {
    const base = normalizeBaseUrl(baseOverride || ensureConfig());
    const trimmed = (path || '').replace(/^\/+/, '');
    return new URL(trimmed, base).toString();
  }

  async function persist(key, value) {
    await B.storage.local.set({ [key]: value });
  }

  async function removeKey(key) {
    await B.storage.local.remove(key);
  }

  function clearCache() {
    state.cache.entries = null;
    state.cache.fetchedAt = 0;
  }

  function isAccessValid() {
    const { access, expiresAt } = state.tokens || {};
    if (!access) return false;
    if (!expiresAt) return true;
    return Date.now() < expiresAt - 30_000;
  }

  async function refreshAccessToken(force = false) {
    const refresh = state.tokens?.refresh;
    if (!refresh) {
      if (force) {
        await removeKey(STORAGE_KEYS.TOKENS);
        state.tokens = {};
      }
      throw new Error('refresh_missing');
    }
    const url = buildApiUrl('auth/jwt/refresh/');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh })
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 400) {
        await removeKey(STORAGE_KEYS.TOKENS);
        state.tokens = {};
        clearCache();
      }
      throw new Error(`refresh_failed:${res.status}`);
    }
    const data = await res.json();
    const access = data.access || null;
    if (!access) {
      throw new Error('refresh_invalid_response');
    }
    const updatedTokens = {
      access,
      refresh: data.refresh || refresh,
      expiresAt: getExpiresAt(access)
    };
    state.tokens = updatedTokens;
    await persist(STORAGE_KEYS.TOKENS, updatedTokens);
    return access;
  }

  async function ensureAccessToken() {
    if (isAccessValid()) {
      return state.tokens.access;
    }
    return refreshAccessToken(true);
  }

  async function apiFetch(path, init = {}) {
    const attempt = async () => {
      const access = await ensureAccessToken();
      const headers = new Headers(init.headers || {});
      if (access) {
        headers.set('Authorization', `Bearer ${access}`);
      }
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const url = buildApiUrl(path);
      return fetch(url, { ...init, headers });
    };

    let response = await attempt();
    if (response.status === 401) {
      await refreshAccessToken(true);
      response = await attempt();
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`api_error:${response.status}:${text}`);
    }
    return response;
  }

  async function performLogin(payload) {
    const { baseUrl, username, password } = payload || {};
    if (!username || !password) {
      throw new Error('credentials_required');
    }
    const base = normalizeBaseUrl(baseUrl || state.config?.apiBase || '');
    if (!base) {
      throw new Error('base_required');
    }
    const url = buildApiUrl('auth/jwt/create/', base);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`login_failed:${res.status}:${detail}`);
    }
    const data = await res.json();
    if (!data.access || !data.refresh) {
      throw new Error('login_invalid_response');
    }
    const normalizedConfig = {
      ...(state.config || {}),
      apiBase: base,
      username
    };
    const tokens = {
      access: data.access,
      refresh: data.refresh,
      expiresAt: getExpiresAt(data.access)
    };
    state.config = normalizedConfig;
    state.tokens = tokens;
    await persist(STORAGE_KEYS.CONFIG, normalizedConfig);
    await persist(STORAGE_KEYS.TOKENS, tokens);
    clearCache();
    return { ok: true, expiresAt: tokens.expiresAt };
  }

  async function performLogout() {
    state.tokens = {};
    await removeKey(STORAGE_KEYS.TOKENS);
    clearCache();
    return { ok: true };
  }

  async function importKeyBundle(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('bundle_required');
    }
    const { bundle, passphrase } = payload;
    if (!bundle || !passphrase) {
      throw new Error('bundle_or_passphrase_missing');
    }
    const keyPair = await MonMDPCrypto.importKeyBundle(bundle, passphrase);
    state.keyPair = keyPair;
    MonMDPCrypto.clearKeyCache();
    await persist(STORAGE_KEYS.KEYPAIR, keyPair);
    clearCache();
    return { ok: true };
  }

  async function forgetKeyPair() {
    state.keyPair = null;
    MonMDPCrypto.clearKeyCache();
    await removeKey(STORAGE_KEYS.KEYPAIR);
    clearCache();
    return { ok: true };
  }

  function normalizeLoginEntry(entry, secret) {
    if (!entry || typeof entry !== 'object') return null;
    if (!secret || typeof secret !== 'object') return null;
    const username =
      secret.login || secret.username || secret.user || secret.identifiant || secret.email;
    const password =
      secret.password || secret.pass || secret.mdp || secret.secret;
    if (!username || !password) return null;
    const origin = normalizeOrigin(entry.url || entry.origin);
    return {
      id: entry.id,
      title: entry.title || '',
      url: entry.url || '',
      origin,
      username,
      password,
      notes: secret.notes || '',
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      raw: secret
    };
  }

  async function fetchEntries(force = false) {
    if (!state.keyPair || !state.keyPair.privateKeyJwk) {
      throw new Error('keypair_missing');
    }
    if (!force && state.cache.entries && Date.now() - state.cache.fetchedAt < 5000) {
      return state.cache.entries;
    }
    const res = await apiFetch('passwords/');
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('passwords_invalid_response');
    }
    const entries = [];
    for (const item of data) {
      try {
        const secret = await MonMDPCrypto.decryptCiphertext(item.ciphertext, state.keyPair);
        const normalized = normalizeLoginEntry(item, secret);
        if (normalized) {
          entries.push(normalized);
        }
      } catch (err) {
        log('decrypt failure for entry', item?.id, err);
      }
    }
    state.cache.entries = entries;
    state.cache.fetchedAt = Date.now();
    return entries;
  }

  function scoreEntries(entries, context) {
    if (!context) return [];
    const {
      origin,
      originHost,
      originDomain,
      originTokens,
      senderUrl
    } = context;
    const results = [];
    for (const entry of entries) {
      const entryHost = hostnameFromUrl(entry.origin || entry.url);
      const entryDomain = registrableDomain(entryHost);
      let sameOrigin = false;
      let sameHost = false;
      let hostOverlap = false;
      let sameDomain = false;
      let tokenMatch = false;
      let score = 0;
      if (origin) {
        const lowerOrigin = origin.toLowerCase();
        if (entry.origin) {
          const entryOrigin = entry.origin.toLowerCase();
          if (entryOrigin === lowerOrigin) {
            score += 50;
            sameOrigin = true;
          } else if (entryOrigin.includes(lowerOrigin) || lowerOrigin.includes(entryOrigin)) {
            score += 15;
          }
        }
        if (originHost && entryHost) {
          if (originHost === entryHost) {
            score += 40;
            sameHost = true;
          } else if (originHost.endsWith(`.${entryHost}`) || entryHost.endsWith(`.${originHost}`)) {
            score += 20;
            hostOverlap = true;
          }
        }
        if (originDomain && entryDomain && originDomain === entryDomain) {
          score += 35;
          sameDomain = true;
        }
        if (originTokens.length) {
          const seenTokens = new Set();
          const candidateStrings = [];
          if (typeof entry.title === 'string') {
            candidateStrings.push(entry.title.toLowerCase());
          }
          if (typeof entry.url === 'string') {
            candidateStrings.push(entry.url.toLowerCase());
          }
          if (typeof senderUrl === 'string') {
            candidateStrings.push(senderUrl.toLowerCase());
          }
          if (entry.raw && typeof entry.raw === 'object') {
            for (const value of Object.values(entry.raw)) {
              if (typeof value === 'string') {
                candidateStrings.push(value.toLowerCase());
              }
            }
          }
          for (const token of originTokens) {
            if (seenTokens.has(token)) continue;
            let hit = false;
            if (entryHost && entryHost.includes(token)) {
              hit = true;
            } else if (entryDomain && entryDomain.includes(token)) {
              hit = true;
            } else {
              for (const cand of candidateStrings) {
                if (cand.includes(token)) {
                  hit = true;
                  break;
                }
              }
            }
            if (hit) {
              seenTokens.add(token);
              score += 8;
              tokenMatch = true;
            }
          }
        }
        if (entry.raw && typeof entry.raw === 'object') {
          for (const value of Object.values(entry.raw)) {
            if (typeof value === 'string' && value.toLowerCase().includes(origin.toLowerCase())) {
              score += 2;
            }
          }
        }
      }
      if (entry.username) {
        const uname = entry.username.trim().toLowerCase();
        if (['user', 'username', 'utilisateur', 'default', 'admin'].includes(uname)) {
          score -= 5;
        }
      }
      results.push({
        id: entry.id,
        title: entry.title,
        username: entry.username,
        password: entry.password,
        url: entry.url,
        origin: entry.origin,
        notes: entry.notes,
        score,
        matchFlags: {
          same_origin: sameOrigin,
          same_host: sameHost,
          host_overlap: hostOverlap,
          same_domain: sameDomain,
          token_match: tokenMatch
        }
      });
    }
    results.sort((a, b) => b.score - a.score);
    if (!origin) {
      return results.map((entry) => {
        const clone = { ...entry };
        delete clone.matchFlags;
        return clone;
      });
    }
    const prioritizedOrder = ['same_origin', 'same_host', 'same_domain', 'token_match', 'host_overlap'];
    let prioritized = results;
    for (const flag of prioritizedOrder) {
      const subset = results.filter((entry) => entry.matchFlags[flag]);
      if (subset.length) {
        prioritized = subset;
        break;
      }
    }
    return prioritized.map((entry) => {
      const clone = { ...entry };
      delete clone.matchFlags;
      return clone;
    });
  }

  async function getCredentials(request, sender) {
    const origin = normalizeOrigin(request.origin) || normalizeOrigin(sender?.url);
    const url = request.url || sender?.url || null;
    const status = {
      hasConfig: !!state.config?.apiBase,
      hasTokens: !!state.tokens?.access || !!state.tokens?.refresh,
      hasKey: !!(state.keyPair && state.keyPair.privateKeyJwk)
    };
    let matches = [];
    let apiError = null;

    if (status.hasConfig && status.hasTokens && status.hasKey) {
      try {
        const entries = await fetchEntries(false);
        matches = scoreEntries(entries, {
          origin,
          originHost: hostnameFromUrl(origin),
          originDomain: registrableDomain(hostnameFromUrl(origin)),
          originTokens: originTokens(origin),
          senderUrl: url
        }) || [];
        if (matches.length) {
          const best = matches[0];
          return {
            ok: true,
            username: best.username,
            password: best.password,
            remember: false,
            autosubmit: false,
            logins: matches
          };
        }
      } catch (err) {
        apiError = err;
        log('getCredentials api error', err);
      }
    }

    const nativeResult = await fetchFromNativeHost(origin, url);
    if (nativeResult && nativeResult.ok) {
      return nativeResult;
    }

    if (matches && matches.length === 0) {
      return { ok: true, logins: [] };
    }

    if (!status.hasConfig) {
      return { ok: false, error: 'config_missing' };
    }
    if (!status.hasTokens) {
      return { ok: false, error: 'not_authenticated' };
    }
    if (!status.hasKey) {
      return { ok: false, error: 'key_missing' };
    }

    if (apiError) {
      return { ok: false, error: apiError && apiError.message ? apiError.message : 'api_error' };
    }

    return nativeResult && nativeResult.error
      ? { ok: false, error: nativeResult.error }
      : { ok: true, logins: [] };
  }

  async function getState() {
    return {
      ok: true,
      config: state.config || {},
      hasConfig: !!state.config?.apiBase,
      hasTokens: !!state.tokens?.access,
      hasRefresh: !!state.tokens?.refresh,
      tokenExpiresAt: state.tokens?.expiresAt || null,
      hasKeyPair: !!(state.keyPair && state.keyPair.privateKeyJwk),
      cachedEntries: state.cache.entries ? state.cache.entries.length : 0,
      cacheAgeMs: state.cache.fetchedAt ? Date.now() - state.cache.fetchedAt : null
    };
  }

  async function saveConfig(payload) {
    const next = {
      ...(state.config || {}),
      apiBase: normalizeBaseUrl(payload?.apiBase || state.config?.apiBase || ''),
      username: payload?.username || state.config?.username || ''
    };
    if (!next.apiBase) {
      throw new Error('base_required');
    }
    state.config = next;
    await persist(STORAGE_KEYS.CONFIG, next);
    clearCache();
    return { ok: true };
  }

  async function handleMessage(message, sender) {
    if (!message || typeof message !== 'object') return null;
    const { type, payload } = message;
    switch (type) {
      case 'MonMDP:getCredentials':
        return getCredentials(payload || message, sender);
      case 'MonMDP:getState':
        return getState();
      case 'MonMDP:login':
        return performLogin(payload || {});
      case 'MonMDP:logout':
        return performLogout();
      case 'MonMDP:saveConfig':
        return saveConfig(payload || {});
      case 'MonMDP:importKeyBundle':
        return importKeyBundle(payload || {});
      case 'MonMDP:forgetKeyPair':
        return forgetKeyPair();
      case 'MonMDP:refreshVault':
        await fetchEntries(true);
        return { ok: true };
      default:
        return null;
    }
  }

  async function loadInitialState() {
    try {
      const stored = await B.storage.local.get([
        STORAGE_KEYS.CONFIG,
        STORAGE_KEYS.TOKENS,
        STORAGE_KEYS.KEYPAIR
      ]);
      if (stored && stored[STORAGE_KEYS.CONFIG]) {
        state.config = stored[STORAGE_KEYS.CONFIG] || {};
      }
      if (stored && stored[STORAGE_KEYS.TOKENS]) {
        const tokens = stored[STORAGE_KEYS.TOKENS] || {};
        if (tokens.access && !tokens.expiresAt) {
          tokens.expiresAt = getExpiresAt(tokens.access);
        }
        state.tokens = tokens;
      }
      if (stored && stored[STORAGE_KEYS.KEYPAIR]) {
        state.keyPair = stored[STORAGE_KEYS.KEYPAIR];
      }
    } catch (err) {
      log('loadInitialState error', err);
    }
  }

  B.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEYS.CONFIG]) {
      state.config = changes[STORAGE_KEYS.CONFIG].newValue || {};
      clearCache();
    }
    if (changes[STORAGE_KEYS.TOKENS]) {
      state.tokens = changes[STORAGE_KEYS.TOKENS].newValue || {};
      clearCache();
    }
    if (changes[STORAGE_KEYS.KEYPAIR]) {
      state.keyPair = changes[STORAGE_KEYS.KEYPAIR].newValue || null;
      MonMDPCrypto.clearKeyCache();
      clearCache();
    }
  });

  B.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const promise = (async () => {
      try {
        const result = await handleMessage(message, sender);
        if (result && result.ok === false && result.error === 'config_missing') {
          return result;
        }
        return result || { ok: false, error: 'unknown_action' };
      } catch (err) {
        log('handleMessage error', err);
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    })();
    promise.then(sendResponse);
    promise.catch((err) => {
      log('async handler error', err);
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    });
    return true;
  });

  void loadInitialState();
})();
