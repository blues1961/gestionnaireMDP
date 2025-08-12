const te = new TextEncoder(), td = new TextDecoder()
const b64e = u8 => btoa(String.fromCharCode(...u8))
const b64d = b => { const bin = atob(b); const u=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u }

let __pair = { privateKey:null, publicKey:null }
const STORAGE = 'zk_keypair_v1'

export function setKeyPair(privateKey, publicKey){ __pair = { privateKey, publicKey } }

export async function getKeyPair(){
  if (__pair.privateKey && __pair.publicKey) return __pair
  const raw = localStorage.getItem(STORAGE)
  if (raw){
    const { privJwk, pubJwk } = JSON.parse(raw)
    const privateKey = await crypto.subtle.importKey('jwk', privJwk, {name:'RSA-OAEP', hash:'SHA-256'}, true, ['decrypt'])
    const publicKey  = await crypto.subtle.importKey('jwk', pubJwk,  {name:'RSA-OAEP', hash:'SHA-256'}, true, ['encrypt'])
    setKeyPair(privateKey, publicKey); return __pair
  }
  throw new Error('Keypair non initialisé')
}

async function generateExportablePair(){
  const pair = await crypto.subtle.generateKey(
    { name:'RSA-OAEP', modulusLength:4096, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' },
    true, ['encrypt','decrypt']
  )
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const pubJwk  = await crypto.subtle.exportKey('jwk', pair.publicKey)
  localStorage.setItem(STORAGE, JSON.stringify({ privJwk, pubJwk }))
  setKeyPair(pair.privateKey, pair.publicKey)
  return __pair
}

export async function ensureKeyPair(){ try { return await getKeyPair() } catch { return generateExportablePair() } }
export async function hasKeyPair(){ try { await getKeyPair(); return true } catch { return false } }

// payload: {login,password,notes}
export async function encryptPayload(payload){
  const { publicKey } = await ensureKeyPair()
  const data = new TextEncoder().encode(JSON.stringify(payload))
  // clé symétrique
  const sym = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt','decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, sym, data))
  // exporter la clé AES brute et chiffrer avec RSA
  const rawSym = new Uint8Array(await crypto.subtle.exportKey('raw', sym))
  const encKey = new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'}, publicKey, rawSym))
  return { iv: b64e(iv), salt: b64e(salt), data: b64e(ciphertext), key: b64e(encKey) }
}

export async function decryptPayload(bundle){
  const { privateKey } = await getKeyPair()
  const iv = b64d(bundle.iv), data = b64d(bundle.data), encKey = b64d(bundle.key)
  const rawSym = await crypto.subtle.decrypt({name:'RSA-OAEP'}, privateKey, encKey)
  const sym = await crypto.subtle.importKey('raw', rawSym, {name:'AES-GCM', length:256}, false, ['decrypt'])
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv}, sym, data)
  return JSON.parse(td.decode(new Uint8Array(plain)))
}

// backup clé privée (PKCS8 chiffré PBKDF2 + AES-GCM)
async function deriveAesKey(passphrase, salt, iterations=200000){
  const keyMat = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations}, keyMat, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])
}

export async function exportKeyBundle(passphrase){
  const { privateKey, publicKey } = await ensureKeyPair()
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const spki  = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aes = await deriveAesKey(passphrase, salt)
  const data = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, aes, pkcs8))
  return { format:'zk-keybundle-v1', kdf:{name:'PBKDF2',hash:'SHA-256',iterations:200000,salt:b64e(salt)}, enc:{name:'AES-GCM',iv:b64e(iv)}, data:b64e(data), pub:b64e(spki), createdAt:new Date().toISOString() }
}

export async function importKeyBundle(bundle, passphrase){
  const salt = b64d(bundle.kdf.salt), iv = b64d(bundle.enc.iv), data = b64d(bundle.data)
  const aes = await deriveAesKey(passphrase, salt, bundle.kdf.iterations || 200000)
  const pkcs8 = await crypto.subtle.decrypt({name:'AES-GCM', iv}, aes, data)
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, {name:'RSA-OAEP', hash:'SHA-256'}, true, ['decrypt'])
  const publicKey  = await crypto.subtle.importKey('spki', b64d(bundle.pub), {name:'RSA-OAEP', hash:'SHA-256'}, true, ['encrypt'])
  const privJwk = await crypto.subtle.exportKey('jwk', privateKey)
  const pubJwk  = await crypto.subtle.exportKey('jwk', publicKey)
  localStorage.setItem(STORAGE, JSON.stringify({ privJwk, pubJwk }))
  setKeyPair(privateKey, publicKey)
  return true
}
