const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"

async function jfetch(path, opts={}){
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type":"application/json", ...(opts.headers||{}) },
    ...opts
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  if (r.status === 204) return null
  return r.json()
}

export const api = {
  categories: {
    list: () => jfetch("/api/categories/"),
    create: (name) => jfetch("/api/categories/", { method:"POST", body: JSON.stringify({name}) }),
  },
  passwords: {
    list: () => jfetch("/api/passwords/"),
    create: (payload) => jfetch("/api/passwords/", { method:"POST", body: JSON.stringify(payload) }),
    get: (id) => jfetch(`/api/passwords/${id}/`),
    update: (id, payload) => jfetch(`/api/passwords/${id}/`, { method:"PUT", body: JSON.stringify(payload) }),
    remove: (id) => jfetch(`/api/passwords/${id}/`, { method:"DELETE" }),
  }
}
