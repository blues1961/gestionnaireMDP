const BASE = import.meta.env.VITE_API_BASE || window.location.origin

let ACCESS_TOKEN = null

export function setToken(t){
  ACCESS_TOKEN = t
  try { localStorage.setItem('jwt_access', t || '') } catch {}
}

export function initToken(){
  try {
    const t = localStorage.getItem('jwt_access')
    if (t && t.trim()) { ACCESS_TOKEN = t; return t }
  } catch {}
  return null
}

async function request(path, opts = {}){
  const headers = {
    'Content-Type': 'application/json',
    ...(ACCESS_TOKEN ? { 'Authorization': 'Bearer ' + ACCESS_TOKEN } : {})
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })

  const txt = await res.text()
  let data = null
  try { data = txt ? JSON.parse(txt) : null } catch {}

  if (res.status === 401) { setToken(null); throw new Error('Non autorisé (401). Connecte-toi de nouveau.') }
  if (!res.ok) {
    if (data && typeof data === 'object') {
      const msg = Object.entries(data).map(([k,v]) => `${k}: ${Array.isArray(v)?v.join(', '):v}`).join(' | ')
      throw new Error(`Erreur ${res.status}: ${msg || 'Requête invalide'}`)
    }
    throw new Error(`Erreur ${res.status}: ${txt || 'Requête invalide'}`)
  }
  return data
}

export const api = {
  login: (username, password) =>
    request('/api/token/', { method:'POST', body: JSON.stringify({ username, password }) }),

  categories: {
    list: () => request('/api/categories/'),
    create: (name) => request('/api/categories/', { method:'POST', body: JSON.stringify({ name }) }),
  },

  passwords: {
    list: () => request('/api/passwords/'),
    get: (id) => request(`/api/passwords/${id}/`),
    create: (data) => request('/api/passwords/', { method:'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/passwords/${id}/`, { method:'PATCH', body: JSON.stringify(data) }),
    remove: (id) => fetch(`${BASE}/api/passwords/${id}/`, {
      method: 'DELETE',
      headers: ACCESS_TOKEN ? { 'Authorization': 'Bearer ' + ACCESS_TOKEN } : {}
    }).then(async res => {
      if (res.status === 401) { setToken(null); throw new Error('Non autorisé (401)') }
      if (!res.ok) throw new Error(`Erreur ${res.status} lors de la suppression`)
      return null
    }),
    search: (q) => request('/api/passwords/search/?q=' + encodeURIComponent(q)),
  }
}
