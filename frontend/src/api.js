// api.js — version complète pour backend Django (sessions + CSRF)
// - BASE configurable via Vite: import.meta.env.VITE_API_BASE (défaut: http://localhost:8000)
// - Cookies toujours envoyés (credentials: 'include')
// - CSRF auto: GET /api/csrf/ si nécessaire, puis envoi X-CSRFToken sur les méthodes non-GET
// - Gestion d'erreurs homogène (lève Error avec .status, .body, .url)
// - Endpoints couverts: auth (login, logout, whoami), categories, passwords
// - Endpoints optionnels (si dispo côté Django): categories.reassign, key.export, key.import


const BASE = (import.meta.env?.VITE_API_BASE ?? '').trim(); // '' => appels en /api/... sur le même domaine


function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([$?*|{}\\^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

async function ensureCsrf() {
  if (!getCookie('csrftoken')) {
    await fetch(`${BASE}/api/csrf/`, { credentials: 'include' });
  }
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Accept': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const ct = res.headers.get('Content-Type') || '';
  const isJSON = ct.includes('application/json');
  const body = isJSON ? await res.json().catch(() => null) : await res.text().catch(() => '');
  if (!res.ok) {
    const detail = (body && (body.detail || body.message || body.error)) || res.statusText;
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status; err.body = body; err.url = url;
    throw err;
  }
  return body;
}

function withCsrf(method, headers = {}, body) {
  return (async () => {
    await ensureCsrf();
    const csrftoken = getCookie('csrftoken') || '';
    const finalHeaders = { 'X-CSRFToken': csrftoken, ...headers };
    return { method, headers: finalHeaders, body };
  })();
}

export const api = {
  // --- Auth ---
  async login(username, password) {
    const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ username, password }));
    return jsonFetch(`${BASE}/api/login/`, init);
  },
  async logout() {
    const init = await withCsrf('POST');
    return jsonFetch(`${BASE}/api/logout/`, init);
  },
  async whoami() {
    try { return await jsonFetch(`${BASE}/api/whoami/`); }
    catch (e) { if (e.status === 401) return null; throw e; }
  },

  // --- Categories ---
  categories: {
    async list() {
      return jsonFetch(`${BASE}/api/categories/`);
    },
    async create(name, extra = {}) {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ name, ...extra }));
      return jsonFetch(`${BASE}/api/categories/`, init);
    },
    async update(id, payload) {
      const init = await withCsrf('PATCH', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(`${BASE}/api/categories/${id}/`, init);
    },
    async remove(id) {
      const init = await withCsrf('DELETE');
      return jsonFetch(`${BASE}/api/categories/${id}/`, init);
    },
    // Optionnel: nécessite une action côté Django (ex: @action(detail=True, methods=['post']))
    async reassign(id, targetCategoryId) {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ target: targetCategoryId || null }));
      return jsonFetch(`${BASE}/api/categories/${id}/reassign/`, init);
    },
  },

  // --- Passwords ---
  passwords: {
    async list() {
      return jsonFetch(`${BASE}/api/passwords/`);
    },
    async create(payload) {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(`${BASE}/api/passwords/`, init);
    },
    async update(id, payload) {
      const init = await withCsrf('PATCH', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(`${BASE}/api/passwords/${id}/`, init);
    },
    async remove(id) {
      const init = await withCsrf('DELETE');
      return jsonFetch(`${BASE}/api/passwords/${id}/`, init);
    },
  },

  // --- Key (optionnel, si endpoints exposés côté Django) ---
  key: {
    async export() {
      const init = await withCsrf('POST');
      return jsonFetch(`${BASE}/api/key/export/`, init); // attend un JSON (par ex. {private_key_pem: ..., passphrase_required: ...})
    },
    async import(payload) {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(`${BASE}/api/key/import/`, init);
    },
  },
};

export default api;
