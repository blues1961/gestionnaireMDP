import Dexie from 'dexie'

const db = new Dexie('zkvault')
db.version(1).stores({ keys: 'name' })

export async function ensureKeyPair(){
  const existing = await db.keys.get('rsa')
  if(existing) return existing
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1,0,1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  )
  const pub = await window.crypto.subtle.exportKey('spki', keyPair.publicKey)
  const priv = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  const obj = { name:'rsa', publicKey: arrayBufferToBase64(pub), privateKey: arrayBufferToBase64(priv) }
  await db.keys.put(obj)
  return obj
}

export async function getPrivateKey(){
  const { privateKey } = await ensureKeyPair()
  const pkcs8 = base64ToArrayBuffer(privateKey)
  return await window.crypto.subtle.importKey('pkcs8', pkcs8, { name:'RSA-OAEP', hash:'SHA-256' }, false, ['decrypt'])
}

export async function getPublicKey(){
  const { publicKey } = await ensureKeyPair()
  const spki = base64ToArrayBuffer(publicKey)
  return await window.crypto.subtle.importKey('spki', spki, { name:'RSA-OAEP', hash:'SHA-256' }, false, ['encrypt'])
}

export async function encryptPayload(plainObj){
  const pub = await getPublicKey()
  const enc = new TextEncoder()
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const aesKey = await window.crypto.subtle.generateKey({ name:'AES-GCM', length:256 }, true, ['encrypt','decrypt'])
  const rawAes = await window.crypto.subtle.exportKey('raw', aesKey)
  const data = enc.encode(JSON.stringify(plainObj))
  const ciphertext = await window.crypto.subtle.encrypt({ name:'AES-GCM', iv }, aesKey, data)
  const sealedKey = await window.crypto.subtle.encrypt({ name:'RSA-OAEP' }, pub, rawAes)
  return {
    v: 1,
    alg: 'AES-GCM-256+RSA-OAEP',
    iv: arrayBufferToBase64(iv.buffer),
    sealedKey: arrayBufferToBase64(sealedKey),
    data: arrayBufferToBase64(ciphertext)
  }
}

export async function decryptPayload(blob){
  const priv = await getPrivateKey()
  const iv = base64ToArrayBuffer(blob.iv)
  const sealedKey = base64ToArrayBuffer(blob.sealedKey)
  const rawAes = await window.crypto.subtle.decrypt({ name:'RSA-OAEP' }, priv, sealedKey)
  const aesKey = await window.crypto.subtle.importKey('raw', rawAes, { name:'AES-GCM' }, false, ['decrypt'])
  const ciphertext = base64ToArrayBuffer(blob.data)
  const plain = await window.crypto.subtle.decrypt({ name:'AES-GCM', iv:new Uint8Array(iv) }, aesKey, ciphertext)
  return JSON.parse(new TextDecoder().decode(plain))
}

function arrayBufferToBase64(buf){
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i=0;i<bytes.byteLength;i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToArrayBuffer(b64){
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// ==== Helpers binaires / base64 =========================================
function strToU8(str){ return new TextEncoder().encode(str) }
function u8ToStr(u8){ return new TextDecoder().decode(u8) }
function b64enc(u8){ return btoa(String.fromCharCode(...u8)) }
function b64dec(b64){
  const bin = atob(b64); const u8 = new Uint8Array(bin.length)
  for (let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i)
  return u8
}

// ==== Accès au keypair existant =========================================
// On suppose que ton projet a déjà ensureKeyPair(), getKeyPair() ou équiv.
// Adapte ces 3 fonctions aux noms réels si besoin.
let __cached = { privateKey: null, publicKey: null }

export async function getKeyPair(){
  if (__cached.privateKey && __cached.publicKey) return __cached
  // Essaie de recharger via ensureKeyPair() si dispo
  if (typeof ensureKeyPair === 'function') {
    await ensureKeyPair()
    if (__cached.privateKey && __cached.publicKey) return __cached
  }
  // Sinon, si tu as déjà une implémentation interne, remplace ce bloc par la tienne
  throw new Error("Keypair non initialisé. Appelle ensureKeyPair() au démarrage et/ou adapte getKeyPair().")
}

// Si ailleurs dans ton code tu crées le keypair, appelle setKeyPair(priv,pub) après création
export function setKeyPair(privateKey, publicKey){
  __cached.privateKey = privateKey
  __cached.publicKey = publicKey
}

// ==== Export PEM de la clé publique (utile pour vérifs éventuelles) =====
export async function getPublicKeyPem(){
  const { publicKey } = await getKeyPair()
  const spki = await crypto.subtle.exportKey('spki', publicKey)
  const b64 = b64enc(new Uint8Array(spki))
  const body = b64.match(/.{1,64}/g).join('\n')
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`
}

// ==== KDF (PBKDF2) + AES-GCM pour chiffrer la clé privée exportée =======
async function deriveAesKey(passphrase, salt, iterations=200000){
  const keyMat = await crypto.subtle.importKey(
    'raw', strToU8(passphrase), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', hash:'SHA-256', salt, iterations },
    keyMat,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  )
}

// ==== EXPORT : clé privée -> PKCS8 -> AES-GCM(passphrase) = bundle JSON ==
export async function exportKeyBundle(passphrase){
  if (!passphrase) throw new Error('Passphrase requise')
  const { privateKey, publicKey } = await getKeyPair()

  // exporte PKCS8 de la clé privée
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))

  // génère salt & iv
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aes = await deriveAesKey(passphrase, salt)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, aes, pkcs8))

  // exporte aussi la publique (SPKI) pour vérification/convenance
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey))

  return {
    format: 'zk-keybundle-v1',
    kdf: { name:'PBKDF2', hash:'SHA-256', iterations:200000, salt: b64enc(salt) },
    enc: { name:'AES-GCM', iv: b64enc(iv) },
    data: b64enc(data),     // PKCS8 chiffré
    pub:  b64enc(spki),     // SPKI (non sensible)
    createdAt: new Date().toISOString()
  }
}

// ==== IMPORT : bundle JSON -> déchiffrer -> importKey(pkcs8) -> setKeyPair
export async function importKeyBundle(bundle, passphrase){
  if (!bundle || bundle.format !== 'zk-keybundle-v1') throw new Error('Format invalide')
  const salt = b64dec(bundle.kdf?.salt || '')
  const iv   = b64dec(bundle.enc?.iv || '')
  const aes  = await deriveAesKey(passphrase, salt, bundle.kdf?.iterations || 200000)
  const data = b64dec(bundle.data)

  let pkcs8
  try {
    pkcs8 = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, aes, data)
  } catch {
    throw new Error('Passphrase incorrecte ou fichier corrompu')
  }

  // importe la privée (RSA-OAEP SHA-256, usage déchiffrement)
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', pkcs8, { name:'RSA-OAEP', hash:'SHA-256' }, true, ['decrypt']
  )

  // (re)importe la publique si fournie, sinon dérive-la depuis ton stockage
  let publicKey = null
  if (bundle.pub) {
    const spki = b64dec(bundle.pub)
    publicKey = await crypto.subtle.importKey(
      'spki', spki, { name:'RSA-OAEP', hash:'SHA-256' }, true, ['encrypt']
    )
  } else {
    // si non fournie, tu peux envisager d'exporter la publique depuis la privée
    // (non possible directement avec WebCrypto). Dans notre app, on inclut 'pub'.
    throw new Error('Bundle incomplet: clé publique manquante.')
  }

  // remplace la paire active
  setKeyPair(privateKey, publicKey)
  return true
}
