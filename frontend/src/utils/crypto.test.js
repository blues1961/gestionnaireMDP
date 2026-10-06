import Dexie from 'dexie';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as c from './crypto';

const pass = 'correct horse battery staple';
let pair, bundle, ciphertext;
beforeAll(async () => {
  pair = await c.generateExportablePair();
  c.setKeyPair(pair.privateKey, pair.publicKey);
  ciphertext = await c.encryptPayload({login: 'fixture-login', password: 'fixture-secret', notes: 'fixture'});
  bundle = await c.exportKeyBundle(pass);
}, 20000);

describe('encrypted envelope and memory-only keys', () => {
  it('compares readback independently of JSON field order but detects changed values', () => {
    const reordered = Object.fromEntries(Object.entries(bundle).reverse());
    reordered.kdf = Object.fromEntries(Object.entries(bundle.kdf).reverse());
    reordered.enc = Object.fromEntries(Object.entries(bundle.enc).reverse());
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(bundle));
    expect(c.sameKeyEnvelope(bundle, reordered)).toBe(true);
    expect(c.sameKeyEnvelope(bundle, {...reordered, createdAt:'2026-01-01T00:00:00.000Z'})).toBe(false);
    expect(c.sameKeyEnvelope(bundle, {...reordered, data:bundle.data.slice(0,-4)+'AAAA'})).toBe(false);
    expect(() => c.sameKeyEnvelope(bundle, {...reordered, extra:true})).toThrow();
  });
  it('never generates or reloads a key implicitly, even with legacy storage', async () => {
    const jwk = {privJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', pair.publicKey)};
    localStorage.setItem('zk_keypair_v1', JSON.stringify(jwk));
    c.setKeyPair(null, null);
    await expect(c.getKeyPair()).rejects.toThrow('verrouillée');
    await expect(c.encryptPayload({password: 'fixture'})).rejects.toThrow('verrouillée');
    expect(await c.hasKeyPair()).toBe(false);
    expect((await c.readLegacyPair()).privateKey).toBeTruthy();
    expect(localStorage.getItem('zk_keypair_v1')).toBeTruthy();
  });
  it('roundtrips the same pair and old entries without persistent writes', async () => {
    c.setKeyPair(null, null);
    const candidate = await c.unlockKeyBundle(bundle, pass);
    await c.verifyVault(candidate, [{ciphertext}]);
    expect(await c.hasKeyPair()).toBe(false);
    c.setKeyPair(candidate.privateKey, candidate.publicKey);
    expect(await c.decryptPayload(ciphertext)).toEqual({login: 'fixture-login', password: 'fixture-secret', notes: 'fixture'});
    const db = new Dexie('gestionnaire-mdp-crypto'); db.version(1).stores({keyring: '&id'});
    expect(await db.table('keyring').count()).toBe(0); db.close();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('rejects wrong password, corruption and public metadata substitution', async () => {
    await expect(c.unlockKeyBundle(bundle, 'wrong')).rejects.toThrow();
    await expect(c.unlockKeyBundle({...bundle, createdAt: '2026-01-01T00:00:00.000Z'}, pass)).rejects.toThrow();
    const damaged = {...bundle, data: bundle.data.slice(0, -4) + 'AAAA'};
    await expect(c.unlockKeyBundle(damaged, pass)).rejects.toThrow();
  });
  it('bounds parameters before any derivation, rejects unknown fields and formats', () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    for (const bad of [{...bundle, format: 'unknown'}, {...bundle, password: pass}, {...bundle, kdf: {...bundle.kdf, iterations: 1000001}}, {...bundle, enc: {...bundle.enc, iv: 'AA=='}}]) {
      expect(() => c.validateKeyBundle(bad)).toThrow();
    }
    expect(derive).not.toHaveBeenCalled();
  });
  it('rejects a different vault key and preserves entries', async () => {
    const other = await c.generateExportablePair();
    await expect(c.verifyVault(other, [{ciphertext}])).rejects.toThrow();
    await c.verifyVault(pair, [{ciphertext}]);
  }, 20000);
  it('keeps legacy storage after interrupted migration and purges only explicitly', async () => {
    const db = new Dexie('gestionnaire-mdp-crypto'); db.version(1).stores({keyring: '&id'});
    await db.table('keyring').put({id: 'active', ...pair}); db.close();
    c.setKeyPair(null, null);
    await expect(c.getKeyPair()).rejects.toThrow();
    const candidate = await c.readLegacyPair();
    const envelope = await c.exportKeyBundle(pass, candidate);
    await c.verifyVault(await c.unlockKeyBundle(envelope, pass), [{ciphertext}]);
    expect((await c.readLegacyPair()).privateKey).toBeTruthy();
    await c.purgeLegacyPair(pair);
    await expect(c.readLegacyPair()).rejects.toThrow();
  });
  it('does not delete a different account key in the other legacy location', async () => {
    const other = await c.generateExportablePair();
    localStorage.setItem('zk_keypair_v1', JSON.stringify({privJwk: await crypto.subtle.exportKey('jwk',other.privateKey), pubJwk: await crypto.subtle.exportKey('jwk',other.publicKey)}));
    const db = new Dexie('gestionnaire-mdp-crypto'); db.version(1).stores({keyring:'&id'});
    await db.table('keyring').put({id:'active',...pair}); db.close();
    expect((await c.purgeLegacyPair(pair)).retained).toBe(true);
    expect(localStorage.getItem('zk_keypair_v1')).toBeTruthy();
    const remaining = await c.readLegacyPair();
    expect(await crypto.subtle.exportKey('jwk',remaining.publicKey)).toEqual(await crypto.subtle.exportKey('jwk',other.publicKey));
  },20000);
  it('reads v1 exports and checks private/public pair coherence', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const aes = await crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', iterations:200000, salt}, material, {name:'AES-GCM',length:256}, false, ['encrypt']);
    const data = await crypto.subtle.encrypt({name:'AES-GCM',iv}, aes, await crypto.subtle.exportKey('pkcs8',pair.privateKey));
    const b64 = v => btoa(String.fromCharCode(...new Uint8Array(v)));
    const legacy = {...bundle, format:'zk-keybundle-v1', kdf:{...bundle.kdf, iterations:200000,salt:b64(salt)},enc:{name:'AES-GCM',iv:b64(iv)},data:b64(data)};
    await c.verifyVault(await c.unlockKeyBundle(legacy,pass),[{ciphertext}]);
    const other = await c.generateExportablePair();
    await expect(c.unlockKeyBundle({...legacy,pub:b64(await crypto.subtle.exportKey('spki',other.publicKey))},pass)).rejects.toThrow();
  },20000);
  it('invalidates in-flight decryption after locking', async () => {
    c.setKeyPair(pair.privateKey,pair.publicKey);
    const result = c.decryptPayload(ciphertext);
    c.setKeyPair(null,null);
    await expect(result).rejects.toThrow('verrouillée');
  });
});
