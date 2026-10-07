import axios from "axios";
import { configureVaultAuth, checkActivity, isVaultUnlocked, lockVault, sessionGeneration } from "./utils/vaultSession";
import { jwtDecode } from "jwt-decode";

function normalizeBase(value) {
  if (!value) return "/api";
  return value.replace(/\/+$/, "");
}

export const BASE = normalizeBase(import.meta.env?.VITE_API_BASE);
export const api = axios.create({ baseURL: BASE });

// A form unmounted by locking must never submit a late vault mutation.
api.interceptors.request.use((config) => {
  checkActivity();
  if (config._authGeneration !== undefined && config._authGeneration !== authGeneration) throw new Error('Compte changé');
  if (config.vaultTicket !== undefined && config.vaultTicket !== sessionGeneration()) throw new Error('Opération interrompue');
  if (/^passwords\//.test(String(config.url)) && ['post', 'put', 'patch', 'delete'].includes(config.method) && !isVaultUnlocked()) {
    throw new Error('Voûte verrouillée');
  }
  return config;
});

const JWT_STORAGE_KEY = "mdp.jwt";
const LEGACY_ACCESS_KEY = "token";
const EXPIRY_SKEW_SECONDS = 30;

let refreshPromise = null;
let authGeneration = 0;

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
  if (current.access && tokens?.access) {
    try {
      if (jwtDecode(current.access).user_id !== jwtDecode(tokens.access).user_id) { authGeneration += 1; vaultAccount = null; lockVault(); }
    } catch { lockVault(); }
  }
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
  authGeneration += 1;
  vaultAccount = null;
  lockVault();
  localStorage.removeItem(JWT_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  setAccessToken(null);
}

export function loginJWT(username, password) {
  clearStoredAuth();
  return api.post("auth/jwt/create/", { username, password });
}

export async function logoutJWT(refresh = getStoredRefreshToken(), access = getStoredAccessToken()) {
  if (!refresh) return;
  await api.post("auth/jwt/logout/", { refresh }, access ? {headers: {Authorization: `Bearer ${access}`}} : undefined);
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
      if (getStoredRefreshToken() !== refresh) throw new Error('Compte changé pendant le refresh');
      const next = persistJWT({ access: data?.access, refresh });
      if (!next.access) throw new Error("Réponse de refresh invalide");
      return next.access;
    } catch (error) {
      if (getStoredRefreshToken() === refresh) clearStoredAuth();
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
  config._authGeneration ??= authGeneration;
  if (config._authGeneration !== authGeneration) throw new Error('Compte changé');
  if (/^passwords\//.test(String(config.url)) && ['post', 'put', 'patch', 'delete'].includes(config.method)) {
    config.vaultTicket ??= sessionGeneration();
  }
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
    if (originalRequest._authGeneration !== undefined && originalRequest._authGeneration !== authGeneration) return Promise.reject(err);

    if (status !== 401) return Promise.reject(err);
    if (isJWTAuthPath(originalRequest.url)) return Promise.reject(err);

    lockVault(); // A rejected protected session cannot retain plaintext access during refresh.
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

// No secret participates in this policy: only account identity and JWT validity.
function accountOf(token) {
  try { return jwtDecode(token)?.user_id ?? null; } catch { return null; }
}
let vaultAccount = null;
configureVaultAuth({
  valid() {
    const token = getStoredAccessToken();
    const id = accountOf(token);
    const refresh = getStoredRefreshToken();
    if (!id || (isExpired(token) && (isExpired(refresh) || accountOf(refresh) !== id))) return false;
    if (vaultAccount === null) vaultAccount = id;
    return vaultAccount === id;
  },
  needsVerification() { return isExpired(getStoredAccessToken()); },
  async verify() {
    const expected = vaultAccount;
    const refresh = getStoredRefreshToken();
    if (refresh) {
      try { await api.post('auth/jwt/verify/', {token: refresh}); }
      catch (error) {
        if ([400, 401].includes(error.response?.status) && getStoredRefreshToken() === refresh && vaultAccount === expected) clearStoredAuth();
        throw error;
      }
    }
    const {data} = await api.get('whoami/');
    if (!expected || data.id !== expected || accountOf(getStoredAccessToken()) !== expected) throw new Error('Session invalide');
  },
  sameAccount(e) {
    try {
      const access = value => e.key === 'mdp.jwt' ? JSON.parse(value)?.access : value;
      const oldId = accountOf(access(e.oldValue));
      const newToken = access(e.newValue);
      const same = oldId !== null && oldId === accountOf(newToken) && !isExpired(newToken);
      if (same) setAccessToken(getStoredAccessToken());
      return same;
    } catch { return false; }
  },
});
