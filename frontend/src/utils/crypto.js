import Dexie from "dexie";

const te = new TextEncoder();
const td = new TextDecoder();
const b64e = (u8) => btoa(String.fromCharCode(...u8));
const b64d = (b) => {
  const bin = atob(b);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
  return u;
};

let keyEpoch = 0;
let accessGuard = null;
let guardedPair = false;
export function setKeyAccessGuard(guard) { accessGuard = guard; }
function checkKeyAccess() {
  // Application pairs require the registered session policy; isolated crypto
  // fixtures may explicitly bypass it without activating an application vault.
  if (guardedPair) accessGuard?.();
}
let __pair = { privateKey: null, publicKey: null };
const LEGACY_STORAGE = "zk_keypair_v1";
const DB_NAME = "gestionnaire-mdp-crypto";
const KEYRING_TABLE = "keyring";
const ACTIVE_KEY_ID = "active";

const db = new Dexie(DB_NAME);
db.version(1).stores({
  [KEYRING_TABLE]: "&id",
});

export function setKeyPair(privateKey, publicKey, guarded = true) {
  guardedPair = guarded;
  keyEpoch += 1;
  __pair = { privateKey, publicKey };
}

async function loadStoredPair() {
  const record = await db.table(KEYRING_TABLE).get(ACTIVE_KEY_ID);
  if (!record?.privateKey || !record?.publicKey) return null;
  return { privateKey: record.privateKey, publicKey: record.publicKey };
}

// Legacy storage is read only through the explicit migration procedure.
async function readLegacyLocalStoragePair() {
  const raw = localStorage.getItem(LEGACY_STORAGE);
  if (!raw) throw new Error("Aucune ancienne clé locale");
  const { privJwk, pubJwk } = JSON.parse(raw);
  return {
    privateKey: await crypto.subtle.importKey("jwk", privJwk, {name: "RSA-OAEP", hash: "SHA-256"}, true, ["decrypt"]),
    publicKey: await crypto.subtle.importKey("jwk", pubJwk, {name: "RSA-OAEP", hash: "SHA-256"}, true, ["encrypt"]),
  };
}

export async function readLegacyPair() {
  return await loadStoredPair() || await readLegacyLocalStoragePair();
}

export async function purgeLegacyPair(verifiedPair) {
  if (!verifiedPair) throw new Error("Paire vérifiée requise pour le nettoyage");
  const expected = new Uint8Array(await crypto.subtle.exportKey("spki", verifiedPair.publicKey)).toString();
  const matches = async pair => {
    if (!pair) return false;
    await verifyPair(pair);
    return new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)).toString() === expected;
  };
  let retained = false;
  // Both legacy locations can contain different account keys: inspect them independently.
  const stored = await db.table(KEYRING_TABLE).get(ACTIVE_KEY_ID);
  if (stored) {
    if (stored.privateKey && stored.publicKey && await matches(stored)) await db.table(KEYRING_TABLE).delete(ACTIVE_KEY_ID);
    else retained = true;
  }
  if (localStorage.getItem(LEGACY_STORAGE)) {
    try {
      if (await matches(await readLegacyLocalStoragePair())) localStorage.removeItem(LEGACY_STORAGE);
      else retained = true;
    } catch { retained = true; }
  }
  return {retained};
}

export async function getKeyPair() {
  checkKeyAccess();
  if (!__pair.privateKey || !__pair.publicKey) throw new Error("Voûte verrouillée");
  return __pair;
}

export async function generateExportablePair() {
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

  return pair;
}

export async function ensureKeyPair() {
  return getKeyPair();
}

export async function hasKeyPair() {
  try {
    await getKeyPair();
    return true;
  } catch {
    return false;
  }
}

export async function encryptPayload(payload) {
  const epoch = keyEpoch;
  const { publicKey } = await ensureKeyPair();
  const data = te.encode(JSON.stringify(payload));
  const sym = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sym, data)
  );
  const rawSym = new Uint8Array(await crypto.subtle.exportKey("raw", sym));
  const encKey = new Uint8Array(
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawSym)
  );
  checkKeyAccess();
  if (epoch !== keyEpoch) throw new Error("Voûte verrouillée pendant le chiffrement");
  return { iv: b64e(iv), salt: b64e(salt), data: b64e(ciphertext), key: b64e(encKey) };
}

export async function decryptPayload(bundle) {
  const epoch = keyEpoch;
  const { privateKey } = await getKeyPair();
  const iv = b64d(bundle.iv);
  const data = b64d(bundle.data);
  const encKey = b64d(bundle.key);
  const rawSym = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encKey);
  const sym = await crypto.subtle.importKey(
    "raw",
    rawSym,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sym, data);
  checkKeyAccess();
  if (epoch !== keyEpoch) throw new Error("Voûte verrouillée pendant le déchiffrement");
  return JSON.parse(td.decode(new Uint8Array(plain)));
}

async function deriveAesKey(passphrase, salt, iterations = 200000) {
  const keyMat = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMat,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyBundle(passphrase, pair = null) {
  const { privateKey, publicKey } = pair || await getKeyPair();
  if (passphrase.length < 16) throw new Error("Utilisez une phrase de passe forte de 16 caractères minimum");
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await deriveAesKey(passphrase, salt, 600000);
  const bundle = {
    format: "zk-keybundle-v2",
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt: b64e(salt) },
    enc: { name: "AES-GCM", iv: b64e(iv) },
    pub: b64e(spki),
    createdAt: new Date().toISOString(),
  };
  bundle.data = b64e(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: envelopeAAD(bundle) }, aes, pkcs8)));
  return bundle;
}

export async function unlockKeyBundle(bundle, passphrase) {
  validateKeyBundle(bundle);
  const salt = b64d(bundle.kdf.salt);
  const iv = b64d(bundle.enc.iv);
  const data = b64d(bundle.data);
  const aes = await deriveAesKey(passphrase, salt, bundle.kdf.iterations || 200000);
  const pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv, ...(bundle.format === "zk-keybundle-v2" ? {additionalData: envelopeAAD(bundle)} : {}) }, aes, data);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
  const publicKey = await crypto.subtle.importKey(
    "spki",
    b64d(bundle.pub),
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const pair = { privateKey, publicKey };
  await verifyPair(pair);
  return pair;
}

export function envelopeAAD(b) {
  return te.encode(JSON.stringify([b.format, b.kdf.name, b.kdf.hash, b.kdf.iterations, b.kdf.salt, b.enc.name, b.enc.iv, b.pub, b.createdAt]));
}

export function sameKeyEnvelope(a, b) {
  validateKeyBundle(a); validateKeyBundle(b);
  // PostgreSQL JSONB can reorder fields. Compare every validated value instead.
  return a.data === b.data && td.decode(envelopeAAD(a)) === td.decode(envelopeAAD(b));
}

export function validateKeyBundle(b) {
  const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).sort().join() === keys.sort().join();
  const bytes = (s, min, max) => {
    if (typeof s !== "string" || s.length > 22000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("Format de clé invalide");
    const v = b64d(s);
    if (b64e(v) !== s || v.length < min || v.length > max) throw new Error("Taille de clé invalide");
  };
  if (!exact(b, ["format", "kdf", "enc", "pub", "data", "createdAt"]) || !["zk-keybundle-v1", "zk-keybundle-v2"].includes(b.format) ||
      !exact(b.kdf, ["name", "hash", "iterations", "salt"]) || !exact(b.enc, ["name", "iv"]) ||
      b.kdf.name !== "PBKDF2" || b.kdf.hash !== "SHA-256" || b.enc.name !== "AES-GCM" ||
      !Number.isInteger(b.kdf.iterations) || b.kdf.iterations < (b.format === "zk-keybundle-v2" ? 600000 : 200000) || b.kdf.iterations > 1000000 ||
      typeof b.createdAt !== "string" || b.createdAt.length > 40 || !Number.isFinite(Date.parse(b.createdAt))) throw new Error("Format ou paramètres de clé non supportés");
  bytes(b.kdf.salt, 16, 16); bytes(b.enc.iv, 12, 12); bytes(b.pub, 256, 1024); bytes(b.data, 1024, 16384);
  return b;
}

export async function verifyPair(pair) {
  if (pair.privateKey.algorithm.modulusLength < 2048 || pair.privateKey.algorithm.modulusLength > 4096) throw new Error("Taille RSA non supportée");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const encrypted = await crypto.subtle.encrypt({name: "RSA-OAEP"}, pair.publicKey, challenge);
  const plain = new Uint8Array(await crypto.subtle.decrypt({name: "RSA-OAEP"}, pair.privateKey, encrypted));
  if (!plain.every((v, i) => v === challenge[i])) throw new Error("Paire incohérente");
}

export async function verifyVault(pair, entries) {
  await verifyPair(pair);
  // Never install an unverified candidate as the active key.
  for (const entry of entries) {
    const b = entry.ciphertext;
    const raw = await crypto.subtle.decrypt({name: "RSA-OAEP"}, pair.privateKey, b64d(b.key));
    const sym = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({name: "AES-GCM", iv: b64d(b.iv)}, sym, b64d(b.data));
    JSON.parse(td.decode(plain));
  }
}

// Legacy exported name: import is now a pure local reader, never persistence or activation.
// VaultGate performs account/vault verification, backup and session activation.
export async function importKeyBundle(bundle, passphrase) {
  return unlockKeyBundle(bundle, passphrase);
}
