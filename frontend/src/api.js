// api.js — backend Django (sessions + CSRF), 100% relative par défaut
// - BASE configurable via Vite: import.meta.env.VITE_API_BASE (défaut: '/api')
// - Cookies envoyés (credentials: 'include')
// - CSRF auto: GET `${BASE}/csrf/` si nécessaire, envoi X-CSRFToken ensuite
// - Erreurs homogènes (.status, .body, .url)
// - Endpoints: auth (login/logout/whoami), categories, passwords, key (optionnel)

function normalizeBase(b) {
  let x = (b ?? '').trim();
  if (!x) x = '/api';
  // si ce n'est pas http(s):// et ne commence pas par '/', on préfixe
  if (!/^https?:\/\//i.test(x) && !x.startsWith('/')) x = '/' + x;
  // retire trailing slash (on joindra avec "/xxx/")
  if (x.length > 1 && x.endsWith('/')) x = x.slice(0, -1);
  return x;
}

const BASE = normalizeBase(import.meta.env?.VITE_API_BASE);

function u(path) {
  // jointure sûre: BASE + "/xxx/"
  const p = path.startsWith('/') ? path : '/' + path;
  return BASE + p;
}

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([$?*|{}\\^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

async function ensureCsrf() {
  if (!getCookie('csrftoken')) {
    await fetch(u('/csrf/'), { credentials: 'include' });
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
  // --- Auth (sessions) ---
  async login(username, password) {
    const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ username, password }));
    return jsonFetch(u('/login/'), init);
  },
  async logout() {
    const init = await withCsrf('POST');
    return jsonFetch(u('/logout/'), init);
  },
  async whoami() {
    try { return await jsonFetch(u('/whoami/')); }
    catch (e) { if (e.status === 401) return null; throw e; }
  },

  // --- Categories ---
  categories: {
    list:   () => jsonFetch(u('/categories/')),
    create: async (name, extra = {}) => {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ name, ...extra }));
      return jsonFetch(u('/categories/'), init);
    },
    update: async (id, payload) => {
      const init = await withCsrf('PATCH', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(u(`/categories/${id}/`), init);
    },
    remove: async (id) => {
      const init = await withCsrf('DELETE');
      return jsonFetch(u(`/categories/${id}/`), init);
    },
    // Optionnel: action custom côté Django
    reassign: async (id, targetCategoryId) => {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify({ target: targetCategoryId || null }));
      return jsonFetch(u(`/categories/${id}/reassign/`), init);
    },
  },

  // --- Passwords ---
  passwords: {
    list:   () => jsonFetch(u('/passwords/')),
    create: async (payload) => {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(u('/passwords/'), init);
    },
    update: async (id, payload) => {
      const init = await withCsrf('PATCH', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(u(`/passwords/${id}/`), init);
    },
    remove: async (id) => {
      const init = await withCsrf('DELETE');
      return jsonFetch(u(`/passwords/${id}/`), init);
    },
  },

  // --- Key (optionnel) ---
  key: {
    export: async () => {
      const init = await withCsrf('POST');
      return jsonFetch(u('/key/export/'), init);
    },
    import: async (payload) => {
      const init = await withCsrf('POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload || {}));
      return jsonFetch(u('/key/import/'), init);
    },
  },
};

export default api;
