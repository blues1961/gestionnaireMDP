import axios from "axios";
import { jwtDecode } from "jwt-decode";

function normalizeBase(value) {
  if (!value) return "/api";
  return value.replace(/\/+$/, "");
}

export const BASE = normalizeBase(import.meta.env?.VITE_API_BASE);
export const api = axios.create({ baseURL: BASE });

const JWT_STORAGE_KEY = "mdp.jwt";
const LEGACY_ACCESS_KEY = "token";
const EXPIRY_SKEW_SECONDS = 30;

let refreshPromise = null;

function readStoredJWT() {
  try {
    const parsed = JSON.parse(localStorage.getItem(JWT_STORAGE_KEY) || "null");
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Storage corrompu : on retombera sur le fallback legacy puis sur une purge.
  }

  const legacyAccess = localStorage.getItem(LEGACY_ACCESS_KEY);
  return legacyAccess ? { access: legacyAccess, refresh: null } : null;
}

function isExpired(token) {
  if (!token) return true;
  try {
    const payload = jwtDecode(token);
    return Number(payload?.exp || 0) <= Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS;
  } catch {
    return true;
  }
}

function isJWTAuthPath(url) {
  const path = String(url || "");
  return (
    path.includes("auth/jwt/create/") ||
    path.includes("auth/jwt/refresh/") ||
    path.includes("auth/jwt/verify/")
  );
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export function setAccessToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function getStoredJWT() {
  return readStoredJWT();
}

export function getStoredAccessToken() {
  return getStoredJWT()?.access || null;
}

export function getStoredRefreshToken() {
  return getStoredJWT()?.refresh || null;
}

export function hasStoredSession() {
  const jwt = getStoredJWT();
  return Boolean(jwt?.access || jwt?.refresh);
}

export function persistJWT(tokens) {
  const current = getStoredJWT() || {};
  const next = {
    access: tokens?.access ?? current.access ?? null,
    refresh: tokens?.refresh ?? current.refresh ?? null,
  };

  if (next.access || next.refresh) {
    localStorage.setItem(JWT_STORAGE_KEY, JSON.stringify(next));
  } else {
    localStorage.removeItem(JWT_STORAGE_KEY);
  }

  if (next.access) {
    localStorage.setItem(LEGACY_ACCESS_KEY, next.access);
  } else {
    localStorage.removeItem(LEGACY_ACCESS_KEY);
  }

  setAccessToken(next.access || null);
  return next;
}

export function clearStoredAuth() {
  localStorage.removeItem(JWT_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  setAccessToken(null);
}

export function loginJWT(username, password) {
  return api.post("auth/jwt/create/", { username, password });
}

export async function refreshAccessToken(force = false) {
  const refresh = getStoredRefreshToken();
  if (!refresh) {
    clearStoredAuth();
    throw new Error("Refresh token manquant");
  }

  const currentAccess = getStoredAccessToken();
  if (!force && currentAccess && !isExpired(currentAccess)) {
    setAccessToken(currentAccess);
    return currentAccess;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { data } = await axios.post(`${BASE}/auth/jwt/refresh/`, { refresh });
      const next = persistJWT({ access: data?.access, refresh });
      if (!next.access) throw new Error("Réponse de refresh invalide");
      return next.access;
    } catch (error) {
      clearStoredAuth();
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function initializeAuth() {
  const access = getStoredAccessToken();
  if (access && !isExpired(access)) {
    setAccessToken(access);
    return true;
  }

  const refresh = getStoredRefreshToken();
  if (!refresh) {
    clearStoredAuth();
    return false;
  }

  try {
    await refreshAccessToken(true);
    return true;
  } catch {
    return false;
  }
}

api.interceptors.request.use(async (config) => {
  if (isJWTAuthPath(config?.url)) return config;

  const access = getStoredAccessToken();
  if (access && !isExpired(access)) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${access}`;
    return config;
  }

  if (getStoredRefreshToken()) {
    try {
      const freshAccess = await refreshAccessToken(true);
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${freshAccess}`;
    } catch {
      // La reponse interceptor gerera la redirection si une route protegee echoue ensuite.
    }
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err?.config || {};
    const status = err?.response?.status;

    if (status !== 401) return Promise.reject(err);
    if (isJWTAuthPath(originalRequest.url)) return Promise.reject(err);

    if (!originalRequest._retry && getStoredRefreshToken()) {
      originalRequest._retry = true;
      try {
        const freshAccess = await refreshAccessToken(true);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${freshAccess}`;
        return api.request(originalRequest);
      } catch (refreshError) {
        clearStoredAuth();
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    clearStoredAuth();
    redirectToLogin();
    return Promise.reject(err);
  }
);

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
    const items = await api.passwords.list();
    const affected = items.filter((it) => String(it.category || "") === String(sourceId));
    for (const it of affected) {
      await api.passwords.patch(it.id, { category: targetId || null });
    }
    return { count: affected.length };
  },
};
