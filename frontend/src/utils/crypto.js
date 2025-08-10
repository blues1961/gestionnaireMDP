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
