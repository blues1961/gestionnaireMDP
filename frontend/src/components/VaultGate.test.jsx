import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import VaultGate from './VaultGate';
import KeyBackup from './KeyBackup';
import PasswordList from './PasswordList';
import { MemoryRouter } from 'react-router-dom';
vi.mock('./ToastProvider', () => ({useToast: () => ({success: vi.fn(), error: vi.fn(), info: vi.fn()})}));
import * as c from '../utils/crypto';
import * as session from '../utils/vaultSession';
const http = vi.hoisted(() => ({get: vi.fn(), put: vi.fn(), passwords: {list: vi.fn()}, clearStoredAuth: vi.fn()}));
vi.mock('../api', () => ({api: http, clearStoredAuth: http.clearStoredAuth}));
let pair, envelope, legacyShort, ciphertext, root, host, serverRecord, failReadback, entries;
const pass = 'fixture encryption passphrase';
const reorderFields = value => value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderFields(item)])) : value;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function settle() { await act(async () => {await new Promise(r => setTimeout(r, 10));}); }
async function waitFor(fn) { for(let i=0;i<400;i++) {await settle(); if(fn()) return;} throw new Error('UI timeout'); }
async function submit() { await act(async () => {host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}); }
async function mount() { await act(async () => {root.render(<VaultGate><div data-secret>fixture plaintext visible</div></VaultGate>);}); await waitFor(()=>host.querySelector('form')); }
async function file(bundle=envelope) {
  await act(async () => {
    Object.defineProperty(host.querySelector('input[type=file]'),'files',{configurable:true,value:[{size:JSON.stringify(bundle).length,text:async()=>JSON.stringify(bundle)}]});
    host.querySelector('input[type=file]').dispatchEvent(new Event('change',{bubbles:true}));
  });
}
async function password(value=pass) {
  await act(async()=>{
    const input=host.querySelector('input[type=password]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
async function acknowledgeBackup() {
  await act(async()=>host.querySelector('button[type=button]').click());
  await act(async()=>host.querySelectorAll('input[type=checkbox]')[1].click());
}
async function storeLegacy() {
  const db=new Dexie('gestionnaire-mdp-crypto');db.version(1).stores({keyring:'&id'});
  await db.table('keyring').put({id:'active',...pair});db.close();
}
beforeAll(async()=>{
  pair=await c.generateExportablePair();c.setKeyPair(pair.privateKey,pair.publicKey);
  ciphertext=await c.encryptPayload({login:'fixture login',password:'fixture vault secret',notes:'fixture'});
  envelope=await c.exportKeyBundle(pass);
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('old'), 'PBKDF2',false,['deriveKey']);
  const aes=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:200000,salt},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,await crypto.subtle.exportKey('pkcs8',pair.privateKey));
  const b64=v=>btoa(String.fromCharCode(...new Uint8Array(v)));
  legacyShort={...envelope,format:'zk-keybundle-v1', kdf:{...envelope.kdf,iterations:200000,salt:b64(salt)},enc:{name:'AES-GCM',iv:b64(iv)},data:b64(data)};
},20000);
beforeEach(()=>{
  session.lockVault(false);serverRecord={envelope,revision:1};failReadback=false;entries=[{ciphertext}];
  http.get.mockReset();http.put.mockReset();http.passwords.list.mockReset();
  http.passwords.list.mockImplementation(async()=>entries);
  http.get.mockImplementation(async(url)=>{
    if(url==='whoami/') return {data:{id:1}};
    if(url==='secrets/') return {data:[]};
    if(failReadback) throw {response:{status:503}};
    if(!serverRecord) throw {response:{status:404}};
    return {data:serverRecord};
  });
  http.put.mockImplementation(async(url,body)=>{
    if(body.expected_revision!==(serverRecord?.revision||0)) throw {response:{status:409}};
    serverRecord={envelope:reorderFields(body.envelope),revision:body.expected_revision+1};return {data:serverRecord};
  });
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:fixture');
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();session.lockVault(false);});
describe('account envelope UI acceptance',()=>{
  it('fetches automatically and requires the key password even with a JWT',async()=>{
    localStorage.setItem('mdp.jwt','fixture valid auth');await mount();expect(http.get).toHaveBeenCalledWith('key-envelope/');
    expect(host.querySelector('[data-secret]')).toBeNull();
    await password('wrong password');await submit();await waitFor(()=>host.querySelector('[role=alert]'));
    expect(session.isVaultUnlocked()).toBe(false);expect(http.put).not.toHaveBeenCalled();
    await password();await submit();await waitFor(()=>host.querySelector('[data-secret]'));
    await act(async()=>session.lockVault(false));await waitFor(()=>host.querySelector('input[type=password]'));
    expect(host.querySelector('[data-secret]')).toBeNull();expect(host.querySelector('input[type=password]').value).toBe('');
  });
  it('migrates the same pair, uploads only ciphertext and cleans up after readback',async()=>{
    serverRecord=null;await storeLegacy();await mount();await file();await password();await submit();
    await waitFor(()=>host.textContent.includes('Clé vérifiée localement'));
    expect(http.put).not.toHaveBeenCalled();expect((await c.readLegacyPair()).privateKey).toBeTruthy();
    await acknowledgeBackup();await submit();await waitFor(()=>host.querySelector('[data-secret]'));
    const body=http.put.mock.calls[0][1];expect(Object.keys(body).sort()).toEqual(['envelope','expected_revision']);
    for(const secret of [pass,'fixture login','fixture vault secret','privateKey','privJwk']) expect(JSON.stringify(body)).not.toContain(secret);
    expect(body.envelope.pub).toBe(envelope.pub);await expect(c.readLegacyPair()).rejects.toThrow();
    await c.verifyVault(await c.unlockKeyBundle(serverRecord.envelope,pass),entries);
  });
  it('preserves legacy storage after interrupted readback and resumes',async()=>{
    serverRecord=null;await storeLegacy();await mount();await file();await password();await submit();
    await waitFor(()=>host.textContent.includes('Clé vérifiée localement'));await acknowledgeBackup();
    http.put.mockImplementationOnce(async(url,body)=>{serverRecord={envelope:body.envelope,revision:1};failReadback=true;return {data:serverRecord};});
    await submit();await waitFor(()=>host.querySelector('[role=alert]'));
    expect(session.isVaultUnlocked()).toBe(false);expect((await c.readLegacyPair()).privateKey).toBeTruthy();failReadback=false;
    await act(async()=>root.unmount());root=createRoot(host);await mount();await password();await submit();await waitFor(()=>host.querySelector('[data-secret]'));
    expect((await c.readLegacyPair()).privateKey).toBeTruthy();
  });
  it('shows concurrent device conflicts without overwriting or unlocking',async()=>{
    await mount();await file();await password();await submit();await waitFor(()=>host.textContent.includes('Clé vérifiée localement'));await acknowledgeBackup();
    serverRecord={envelope,revision:2};await submit();await waitFor(()=>host.textContent.includes('Conflit'));
    expect(session.isVaultUnlocked()).toBe(false);expect(serverRecord.revision).toBe(2);
  });
  it('rejects a foreign vault key and corrupt file without upload',async()=>{
    const other=await c.generateExportablePair(),wrong=await c.exportKeyBundle(pass,other);
    await mount();await file(wrong);await password();await submit();await waitFor(()=>host.querySelector('[role=alert]'));
    expect(http.put).not.toHaveBeenCalled();expect(session.isVaultUnlocked()).toBe(false);
    await file({...envelope,format:'unknown'});await submit();await waitFor(()=>host.textContent.includes('non supportés'));expect(http.put).not.toHaveBeenCalled();
  },20000);
  it('migrates a short-password v1 file with a separate new phrase while preserving the pair',async()=>{
    serverRecord=null;await mount();await file(legacyShort);await password('old');
    await act(async()=>{
      const inputs=host.querySelectorAll('input[type=password]');
      for(const input of [inputs[1],inputs[2]]) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,pass);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    await submit();await waitFor(()=>host.textContent.includes('Clé vérifiée localement'));await acknowledgeBackup();await submit();
    await waitFor(()=>host.querySelector('[data-secret]'));
    expect(serverRecord.envelope.pub).toBe(envelope.pub);
    await expect(c.unlockKeyBundle(serverRecord.envelope,'old')).rejects.toThrow();
    await c.verifyVault(await c.unlockKeyBundle(serverRecord.envelope,pass),entries);
    expect(JSON.stringify(http.put.mock.calls[0][1])).not.toContain(pass);
  });
  it('requires explicit provenance for empty vaults and refuses automatic new keys for existing entries',async()=>{
    serverRecord=null;entries=[];await mount();await file();await password();await submit();
    await waitFor(()=>host.textContent.includes('Confirmez la provenance'));
    expect(http.put).not.toHaveBeenCalled();
    await act(async()=>host.querySelector('input[type=checkbox]').click());await submit();
    await waitFor(()=>host.textContent.includes('Clé vérifiée localement'));
    expect(session.isVaultUnlocked()).toBe(false);
  });
  it('refuses to reactivate interrupted unlock work',async()=>{
    await mount();await password();await submit();await act(async()=>session.lockVault(false));
    for(let i=0;i<40;i++) await settle();expect(session.isVaultUnlocked()).toBe(false);expect(host.querySelector('[data-secret]')).toBeNull();
  });
  it('exports independently then changes the server passphrase without rotating the pair',async()=>{
    session.activateVault(pair,session.sessionGeneration());
    await act(async()=>root.render(<MemoryRouter><KeyBackup /></MemoryRouter>));await settle();
    const newPhrase='a different strong fixture phrase';
    await act(async()=>{
      for(const input of host.querySelectorAll('input[type=password]')) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,newPhrase);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    await submit();await waitFor(()=>host.textContent.includes('Utiliser ce mot de passe'));
    expect(http.put).not.toHaveBeenCalled();expect(serverRecord.envelope).toBe(envelope);
    await act(async()=>host.querySelector('input[type=checkbox]').click());
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('Utiliser ce mot de passe')).click());
    await waitFor(()=>http.put.mock.calls.length===1 && host.querySelector('input[type=password]').value==='');
    expect(serverRecord.revision).toBe(2);expect(serverRecord.envelope.pub).toBe(envelope.pub);
    await c.verifyVault(await c.unlockKeyBundle(serverRecord.envelope,newPhrase),entries);
    await expect(c.unlockKeyBundle(serverRecord.envelope,pass)).rejects.toThrow();
    // Existing independent export remains readable with its original phrase.
    await c.verifyVault(await c.unlockKeyBundle(envelope,pass),entries);
  });
  it('does not finish a plaintext export once locking interrupts its decryption loop',async()=>{
    entries=[{id:1,title:'Fixture one',ciphertext},{id:2,title:'Fixture two',ciphertext}];
    session.activateVault(pair,session.sessionGeneration());
    await act(async()=>root.render(<MemoryRouter><PasswordList /></MemoryRouter>));
    await waitFor(()=>host.textContent.includes('Fixture two'));for(let i=0;i<10;i++) await settle();
    vi.spyOn(window,'confirm').mockReturnValue(true);
    const actual=crypto.subtle.decrypt.bind(crypto.subtle);let calls=0;
    vi.spyOn(crypto.subtle,'decrypt').mockImplementation((...args)=>{
      if(++calls===3) session.lockVault(false);
      return actual(...args);
    });
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Exporter JSON').click());
    await waitFor(()=>calls>=3);for(let i=0;i<5;i++) await settle();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();expect(session.isVaultUnlocked()).toBe(false);
  });

});
