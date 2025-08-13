// frontend/src/api.js

/** Utilitaires fetch JSON + CSRF (compat Django) **/
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
  return m ? decodeURIComponent(m.pop()) : ''
}

async function jfetch(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase()
  const hasBody = !!opts.body
  const headers = new Headers(opts.headers || {})
  const isJSON = !(opts.rawBody === true)

  if (isJSON && hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // CSRF pour requêtes non-GET
  if (method !== 'GET' && method !== 'HEAD' && !headers.has('X-CSRFToken')) {
    const csrftoken = getCookie('csrftoken')
    if (csrftoken) headers.set('X-CSRFToken', csrftoken)
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers
  })

  // Pas de contenu
  if (res.status === 204) return true

  // Tente de parser JSON si disponible
  const ctype = res.headers.get('content-type') || ''
  const isJson = ctype.includes('application/json')
  const data = isJson ? await res.json().catch(() => ({})) : await res.text()

  if (!res.ok) {
    // Message d’erreur utile (DRF: detail / errors)
    let msg = 'Requête échouée'
    if (data && typeof data === 'object') {
      msg = data.detail || data.message || JSON.stringify(data)
    } else if (typeof data === 'string' && data.trim()) {
      msg = data
    } else {
      msg = `${res.status} ${res.statusText}`
    }
    const err = new Error(msg)
    err.status = res.status
    err.payload = data
    throw err
  }

  return data
}

/** API publique */
export const api = {
  /** Auth (à adapter si besoin) */
  auth: {
    me:    () => jfetch('/api/auth/me/'),
    login: (body) => jfetch('/api/auth/login/', { method: 'POST', body: JSON.stringify(body) }),
    logout: () => jfetch('/api/auth/logout/', { method: 'POST' }),
  },

  /** Catégories */
  categories: {
    // Récupère toutes les catégories
    list: () => jfetch('/api/categories/'),

    // Détail
    get: (id) => jfetch(`/api/categories/${id}/`),

    // Création : accepte "Banques" ou { name: "Banques", description: "..." }
    // → Poste UNIQUEMENT {name} pour éviter le 400, la description doit être
    //   mise à jour ensuite via update(id, {description}).
    create: (payload) => {
      const name = typeof payload === 'string' ? payload : payload?.name
      return jfetch('/api/categories/', {
        method: 'POST',
        body: JSON.stringify({ name })
      })
    },

    // Mise à jour partielle (DRF: PATCH)
    update: (id, patch) => jfetch(`/api/categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),

    // Suppression
    remove: (id) => jfetch(`/api/categories/${id}/`, { method: 'DELETE' }),
  },

  /** Passwords / Entrées de la voûte */
  passwords: {
    list:   () => jfetch('/api/passwords/'),
    get:    (id) => jfetch(`/api/passwords/${id}/`),
    create: (payload) => jfetch('/api/passwords/', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
    update: (id, payload) => jfetch(`/api/passwords/${id}/`, {
      method: 'PUT', // ou 'PATCH' si ton backend le préfère
      body: JSON.stringify(payload)
    }),
    remove: (id) => jfetch(`/api/passwords/${id}/`, { method: 'DELETE' }),
    updatePartial: (id, patch) => jfetch(`/api/passwords/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
  },

  /** (Facultatif) Catégories ↔ Passwords association si tu en as besoin plus tard */
  // passwordCategories: {
  //   add: (passwordId, categoryId) => jfetch(`/api/passwords/${passwordId}/category/`, {
  //     method: 'POST',
  //     body: JSON.stringify({ category: categoryId })
  //   }),
  // }
}

export default api
