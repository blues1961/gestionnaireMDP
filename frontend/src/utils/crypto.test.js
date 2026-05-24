import Dexie from "dexie";
import { describe, expect, it, vi } from "vitest";

const DB_NAME = "gestionnaire-mdp-crypto";
const LEGACY_STORAGE = "zk_keypair_v1";

async function loadCryptoModule() {
  vi.resetModules();
  return import("./crypto.js");
}

async function readStoredKeyRecord() {
  const db = new Dexie(DB_NAME);
  db.version(1).stores({ keyring: "&id" });
  const record = await db.table("keyring").get("active");
  await db.close();
  return record;
}

async function createLegacyJWKPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  return {
    privJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    pubJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
}

describe("crypto key storage", () => {
  it("migrates a legacy localStorage keypair into IndexedDB", async () => {
    const legacyPair = await createLegacyJWKPair();
    localStorage.setItem(LEGACY_STORAGE, JSON.stringify(legacyPair));

    const mod = await loadCryptoModule();
    const pair = await mod.getKeyPair();
    const storedRecord = await readStoredKeyRecord();

    expect(pair.privateKey).toBeTruthy();
    expect(pair.publicKey).toBeTruthy();
    expect(localStorage.getItem(LEGACY_STORAGE)).toBeNull();
    expect(storedRecord?.id).toBe("active");
    expect(storedRecord?.privateKey).toBeTruthy();
    expect(storedRecord?.publicKey).toBeTruthy();
  });

  it("decrypts legacy-encrypted payloads after export/import on a fresh module", async () => {
    const mod1 = await loadCryptoModule();
    const payload = { login: "alice", password: "s3cret", notes: "vault" };
    const ciphertext = await mod1.encryptPayload(payload);
    const bundle = await mod1.exportKeyBundle("correct horse battery staple");

    await Dexie.delete(DB_NAME);
    localStorage.removeItem(LEGACY_STORAGE);

    const mod2 = await loadCryptoModule();
    await mod2.importKeyBundle(bundle, "correct horse battery staple");
    const decrypted = await mod2.decryptPayload(ciphertext);

    expect(decrypted).toEqual(payload);
  });
});
