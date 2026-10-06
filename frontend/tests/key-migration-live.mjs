// Actual WebCrypto code and actual dev API, no HTTP mocks. No real user credentials.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import * as keys from '../src/utils/crypto.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const id = process.env.KEY_MIGRATION_RUN_ID;
const base = process.env.MIGRATION_TEST_BASE;
if (!id || !base) throw new Error('Fixture run-id and API base required.');
const phrase = `fixture-key-passphrase-${id}`;
const replacementPhrase = `fixture-replacement-passphrase-${id}`;
const payload = {login: `fixture-login-secret-${id}`, password: `fixture-vault-secret-${id}`, notes: `fixture-notes-${id}`};
const forbidden = [phrase, replacementPhrase, ...Object.values(payload), 'privJwk', 'privateKey'];
const b64 = bytes => Buffer.from(bytes).toString('base64');
let checks = 0;
function ok(name) { checks++; console.log(`OK ${checks} : ${name}`); }
function requireTrue(value, label) { assert.equal(Boolean(value), true, label); }
function equal(a, b, label) { requireTrue(JSON.stringify(a) === JSON.stringify(b), label); }
// Fixed error labels only; never dump a request, token, decrypted key or response.
async function request(path, token, method='GET', body, expected=200) {
  if (body && path !== 'auth/jwt/create/') {
    const wire = JSON.stringify(body);
    requireTrue(forbidden.every(value => !wire.includes(value)), 'No plaintext secrets in application request');
  }
  const response = await fetch(new URL(path, base), {
    method, headers: {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})},
    ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(30000),
  });
  if (expected !== null) assert.equal(response.status, expected, `HTTP status for ${method} ${path}`);
  const data = response.status === 204 ? null : await response.json();
  return {status:response.status, data, cache:response.headers.get('cache-control')};
}
async function login(suffix) {
  return (await request('auth/jwt/create/', null, 'POST', {username:`key-migration-${id}-${suffix}`, password:`fixture-login-${id}`})).data.access;
}

try {
  const [a,b] = await Promise.all([login('a'),login('b')]);
  await request('key-envelope/', a, 'GET', undefined, 404);
  await request('key-envelope/', null, 'GET', undefined, 401);
  ok('Compte de test sans enveloppe, authentification requise');

  const original = await keys.generateExportablePair();
  keys.setKeyPair(original.privateKey, original.publicKey);
  const ciphertext = await keys.encryptPayload(payload);
  const created = (await request('passwords/', a, 'POST', {title:'Migration fixture only',ciphertext},201)).data;
  const snapshot = (await request('passwords/',a)).data;
  requireTrue(snapshot.length === 1, 'Only fixture entry in test account');

  // Reproduce the historical exported v1 file, entirely in memory.
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(phrase),'PBKDF2',false,['deriveKey']);
  const aes=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:200000},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const v1={format:'zk-keybundle-v1',kdf:{name:'PBKDF2',hash:'SHA-256',iterations:200000,salt:b64(salt)},enc:{name:'AES-GCM',iv:b64(iv)},pub:b64(await crypto.subtle.exportKey('spki',original.publicKey)),createdAt:new Date().toISOString(),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,await crypto.subtle.exportKey('pkcs8',original.privateKey)))};
  keys.setKeyPair(null,null);
  await assert.rejects(()=>keys.getKeyPair());
  const imported=await keys.importKeyBundle(JSON.parse(JSON.stringify(v1)),phrase);
  await keys.verifyVault(imported,snapshot);
  const envelope=await keys.exportKeyBundle(phrase,imported);
  equal(envelope.pub,v1.pub,'Same public key after migration');
  const backup=JSON.parse(JSON.stringify(envelope));
  await keys.verifyVault(await keys.unlockKeyBundle(backup,phrase),snapshot);
  ok('Fichier v1 lu, sauvegarde v2 vérifiée, même paire et anciennes entrées lisibles');

  // Simultaneous first creation, including the previously absent-row race.
  const creation=await Promise.all([request('key-envelope/',a,'PUT',{envelope,expected_revision:0},null),request('key-envelope/',a,'PUT',{envelope,expected_revision:0},null)]);
  equal(creation.map(r=>r.status).sort(),[201,409],'Concurrent creation must not overwrite');
  keys.setKeyPair(null,null); // Interrupted before readback: start again from server only.
  const recovered=await request('key-envelope/',a);
  requireTrue(recovered.cache === 'no-store','Envelope must not be cached');
  const resumed=await keys.unlockKeyBundle(recovered.data.envelope,phrase);
  await keys.verifyVault(resumed,(await request('passwords/',a)).data);
  await assert.rejects(()=>keys.getKeyPair()); // JWT + fetch + candidate do not activate automatically.
  keys.setKeyPair(resumed.privateKey,resumed.publicKey);
  equal(await keys.decryptPayload(created.ciphertext),payload,'Original entry after server readback');
  ok('Reprise après téléversement interrompu et récupération serveur ; concurrence de création 201/409');

  await assert.rejects(()=>keys.unlockKeyBundle(envelope,'wrong-fixture-password'));
  await assert.rejects(()=>keys.unlockKeyBundle({...envelope,data:envelope.data.slice(0,-4)+'AAAA'},phrase));
  await request('key-envelope/',b,'GET',undefined,404);
  equal((await request('passwords/',b)).data,[],'Other account has no fixture entries');
  const other=await keys.generateExportablePair();
  await assert.rejects(()=>keys.verifyVault(other,snapshot));
  await request('key-envelope/',a,'PUT',{envelope:await keys.exportKeyBundle(phrase,other),expected_revision:1},400);
  ok('Mauvais mot de passe, corruption, autre compte et substitution de paire refusés');

  const replacement=await keys.exportKeyBundle(replacementPhrase,resumed);
  const concurrent=await Promise.all([request('key-envelope/',a,'PUT',{envelope:replacement,expected_revision:1},null),request('key-envelope/',a,'PUT',{envelope:replacement,expected_revision:1},null)]);
  equal(concurrent.map(r=>r.status).sort(),[200,409],'Concurrent replacement must conflict');
  const current=(await request('key-envelope/',a)).data;
  requireTrue(current.revision===2,'Exactly one revision increment');
  await keys.verifyVault(await keys.unlockKeyBundle(current.envelope,replacementPhrase),snapshot);
  await assert.rejects(()=>keys.unlockKeyBundle(current.envelope,phrase));
  equal((await request('passwords/',a)).data,snapshot,'No vault entries modified by migration or rewrap');
  await keys.verifyVault(await keys.unlockKeyBundle(backup,phrase),snapshot);
  ok('Changement de phrase sans rotation, conflit de remplacement 200/409, sauvegarde indépendante lisible');

  // Rescue import of original backup, preserving the same pair and all records.
  await request('key-envelope/',a,'PUT',{envelope:backup,expected_revision:2});
  const restored=(await request('key-envelope/',a)).data;
  await keys.verifyVault(await keys.unlockKeyBundle(restored.envelope,phrase),snapshot);
  equal((await request('passwords/',a)).data,snapshot,'Rescue preserves ciphertext and metadata');
  keys.setKeyPair(null,null);
  await assert.rejects(()=>keys.decryptPayload(ciphertext));
  ok('Import de secours et verrouillage, aucune génération implicite ni secret dans les requêtes applicatives');
  console.log(`PASS : ${checks} groupes de vérification HTTP et WebCrypto réels. Fixtures supprimées par le lanceur.`);
} catch {
  console.error('FAIL : test de migration interrompu. Aucun contenu sensible imprimé ; vérifier les services et les migrations.');
  process.exitCode=1;
} finally { keys.setKeyPair(null,null); }
