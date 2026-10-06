import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createdApis = [];
const axiosPost = vi.fn();

vi.mock("axios", () => {
  return {
    default: {
      create: vi.fn(() => {
        const instance = {
          defaults: { headers: { common: {} } },
          interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
          },
          post: vi.fn(),
          request: vi.fn(),
          get: vi.fn(),
          put: vi.fn(),
          patch: vi.fn(),
          delete: vi.fn(),
        };
        createdApis.push(instance);
        return instance;
      }),
      post: axiosPost,
    },
  };
});

function b64url(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function makeToken(expOffsetSeconds) {
  return `header.${b64url({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds })}.signature`;
}

async function loadApiModule() {
  vi.resetModules();
  return import("./api.js");
}

describe("frontend auth helpers", () => {
  beforeEach(() => {
    createdApis.length = 0;
    axiosPost.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("persists and clears JWT storage coherently", async () => {
    const mod = await loadApiModule();

    mod.persistJWT({ access: makeToken(300), refresh: "refresh-token" });

    expect(mod.getStoredAccessToken()).toBeTruthy();
    expect(mod.getStoredRefreshToken()).toBe("refresh-token");
    expect(mod.hasStoredSession()).toBe(true);
    expect(localStorage.getItem("token")).toBe(mod.getStoredAccessToken());

    mod.clearStoredAuth();

    expect(mod.getStoredJWT()).toEqual(null);
    expect(mod.hasStoredSession()).toBe(false);
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("refreshes an expired access token during initializeAuth", async () => {
    const expiredAccess = makeToken(-300);
    const freshAccess = makeToken(300);
    localStorage.setItem("mdp.jwt", JSON.stringify({ access: expiredAccess, refresh: "refresh-token" }));

    axiosPost.mockResolvedValueOnce({ data: { access: freshAccess } });

    const mod = await loadApiModule();
    const ok = await mod.initializeAuth();

    expect(ok).toBe(true);
    expect(axiosPost).toHaveBeenCalledWith("/api/auth/jwt/refresh/", { refresh: "refresh-token" });
    expect(mod.getStoredAccessToken()).toBe(freshAccess);
    expect(createdApis.at(-1).defaults.headers.common.Authorization).toBe(`Bearer ${freshAccess}`);
  });

  it("sends the stored refresh token to jwt logout", async () => {
    const mod = await loadApiModule();
    const apiInstance = createdApis.at(-1);
    apiInstance.post.mockResolvedValueOnce({ status: 204 });
    mod.persistJWT({ access: makeToken(300), refresh: "refresh-token" });

    await mod.logoutJWT();

    expect(apiInstance.post).toHaveBeenCalledWith("auth/jwt/logout/", { refresh: "refresh-token" });
  });
  it("does not resurrect a previous account from a late refresh", async () => {
    const mod = await loadApiModule();
    mod.persistJWT({access: makeToken(-300),refresh:'old-account-refresh'});
    let resolve;
    axiosPost.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const result=mod.refreshAccessToken(true);
    mod.clearStoredAuth();
    mod.persistJWT({access:makeToken(300),refresh:'new-account-refresh'});
    resolve({data:{access:makeToken(300)}});
    await expect(result).rejects.toThrow('Compte changé');
    expect(mod.getStoredRefreshToken()).toBe('new-account-refresh');
  });
  it("blocks vault writes while locked and after the captured session changes", async () => {
    const mod=await loadApiModule();
    const instance=createdApis.at(-1);
    const validate=instance.interceptors.request.use.mock.calls[0][0];
    expect(()=>validate({url:'passwords/',method:'post'})).toThrow('verrouillée');
    const session=await import('./utils/vaultSession');
    const oldTicket=session.sessionGeneration();
    session.lockVault(false);
    expect(()=>validate({url:'key-envelope/',method:'put',vaultTicket:oldTicket})).toThrow('interrompue');
  });

});
