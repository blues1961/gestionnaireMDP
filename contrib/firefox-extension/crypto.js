(function (globalThis) {
  "use strict";

  const te = new TextEncoder();
  const td = new TextDecoder();
  const keyCache = new Map();

  function normalizeB64(str) {
    return (str || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .replace(/\s+/g, "");
  }

  function padB64(str) {
    const mod = str.length % 4;
    if (mod === 0) return str;
    return str + "=".repeat(4 - mod);
  }

  function b64ToBytes(str) {
    const normalized = padB64(normalizeB64(str));
    const bin = atob(normalized);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  function bytesToB64(bytes) {
    const bin = Array.from(bytes || [], (b) => String.fromCharCode(b)).join("");
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function deriveAesKey(passphrase, salt, iterations) {
    if (!passphrase) throw new Error("Passphrase requise");
    if (!(salt instanceof Uint8Array)) throw new Error("Salt manquant");
    const iter = typeof iterations === "number" && iterations > 0 ? iterations : 200_000;
    const material = await crypto.subtle.importKey(
      "raw",
      te.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function importPrivateKey(privateKeyJwk) {
    if (!privateKeyJwk) throw new Error("Clé privée manquante");
    const keyId = JSON.stringify(privateKeyJwk);
    if (keyCache.has(keyId)) {
      return keyCache.get(keyId);
    }
    const key = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    keyCache.set(keyId, key);
    return key;
  }

  function clearKeyCache() {
    keyCache.clear();
  }

  async function importKeyBundle(bundle, passphrase) {
    if (!bundle || typeof bundle !== "object") {
      throw new Error("Fichier de clé invalide");
    }
    if (bundle.format && bundle.format !== "zk-keybundle-v1") {
      throw new Error(`Format de clé non supporté: ${bundle.format}`);
    }
    const kdf = bundle.kdf || {};
    const enc = bundle.enc || {};

    const salt = b64ToBytes(kdf.salt);
    const iv = b64ToBytes(enc.iv);
    const encrypted = b64ToBytes(bundle.data);
    const iterations = kdf.iterations || 200_000;

    const aesKey = await deriveAesKey(passphrase, salt, iterations);
    const pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, encrypted);

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );
    const publicKey = await crypto.subtle.importKey(
      "spki",
      b64ToBytes(bundle.pub),
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    const privateKeyJwk = await crypto.subtle.exportKey("jwk", privateKey);
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", publicKey);
    clearKeyCache();
    return { privateKeyJwk, publicKeyJwk };
  }

  async function decryptCiphertext(ciphertext, keyPair) {
    if (!ciphertext || typeof ciphertext !== "object") {
      throw new Error("Payload chiffré manquant");
    }
    if (!keyPair || !keyPair.privateKeyJwk) {
      throw new Error("Clé privée non importée");
    }

    const privateKey = await importPrivateKey(keyPair.privateKeyJwk);
    const encKey = b64ToBytes(ciphertext.key);
    const iv = b64ToBytes(ciphertext.iv);
    const data = b64ToBytes(ciphertext.data);

    const rawSym = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encKey);
    const symKey = await crypto.subtle.importKey(
      "raw",
      rawSym,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, symKey, data);
    const json = td.decode(new Uint8Array(plainBuf));
    return JSON.parse(json);
  }

  globalThis.MonMDPCrypto = {
    importKeyBundle,
    decryptCiphertext,
    clearKeyCache,
    utils: {
      b64ToBytes,
      bytesToB64
    }
  };
})(typeof self !== "undefined" ? self : this);
