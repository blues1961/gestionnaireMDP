// frontend/src/api.js
import axios from "axios";
import.meta.env?.VITE_API_BASE
//use import.meta.env?.VITE_API_BASE

function normalizeBase(s) {
  if (!s) return "/api";
  return s.replace(/\/+$/, "");
}

export const BASE = normalizeBase(import.meta.env?.VITE_API_BASE);
export const api = axios.create({ baseURL: BASE });

// --- Boot-time priming (si un JWT est déjà en storage) ---
try {
  const jwt = JSON.parse(localStorage.getItem("mdp.jwt") || "null");
  const access = jwt?.access || localStorage.getItem("token") || null;
  if (access) {
    api.defaults.headers.common.Authorization = `Bearer ${access}`;
  }
} catch { /* noop */ }

// --- Auth helpers ---
export function loginJWT(username, password) {
  // NB: endpoints SANS slash initial → "auth/jwt/create/"
  return api.post("auth/jwt/create/", { username, password });
}

export function setAccessToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

// --- Interceptor minimal : si 401 => purge et redirige vers /login ---
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      try {
        delete api.defaults.headers.common.Authorization;
        localStorage.removeItem("mdp.jwt");
        localStorage.removeItem("token");
      } catch {}
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// --- Convenience wrappers: resources (passwords, categories) ---
function unpackList(res) {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.results)) return d.results;
  return [];
}

function unpackItem(res) {
  return res?.data;
}

api.passwords = {
  async list() {
    const res = await api.get("passwords/");
    return unpackList(res);
  },
  async get(id) {
    const res = await api.get(`passwords/${id}/`);
    return unpackItem(res);
  },
  async create(payload) {
    const res = await api.post("passwords/", payload);
    return unpackItem(res);
  },
  async update(id, payload) {
    const res = await api.put(`passwords/${id}/`, payload);
    return unpackItem(res);
  },
  async patch(id, payload) {
    const res = await api.patch(`passwords/${id}/`, payload);
    return unpackItem(res);
  },
  async remove(id) {
    await api.delete(`passwords/${id}/`);
    return true;
  },
};

api.categories = {
  async list() {
    const res = await api.get("categories/");
    return unpackList(res);
  },
  async create(data) {
    const payload = typeof data === "string" ? { name: data } : data;
    const res = await api.post("categories/", payload);
    return unpackItem(res);
  },
  async update(id, payload) {
    const res = await api.patch(`categories/${id}/`, payload);
    return unpackItem(res);
  },
  async remove(id) {
    await api.delete(`categories/${id}/`);
    return true;
  },
  async reassign(sourceId, targetId) {
    // Fallback client : PATCH chaque mot de passe de sourceId vers targetId (ou null)
    const items = await api.passwords.list();
    const affected = items.filter((it) => String(it.category || "") === String(sourceId));
    for (const it of affected) {
      await api.passwords.patch(it.id, { category: targetId || null });
    }
    return { count: affected.length };
  },
};
