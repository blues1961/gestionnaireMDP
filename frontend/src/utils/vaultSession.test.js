import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as s from './vaultSession';
import * as c from './crypto';
let pair;
function visible(value) { Object.defineProperty(document, 'visibilityState', {configurable:true,value}); document.dispatchEvent(new Event('visibilitychange')); }
function activate() { s.activateVault(pair, s.sessionGeneration()); }
beforeAll(async () => { pair = await c.generateExportablePair(); }, 20000);
beforeEach(() => {
  s.lockVault(false); s.configureVaultAuth(null);
  Object.defineProperty(document, 'visibilityState', {configurable:true,value:'visible'});
});
afterEach(() => { s.lockVault(false); s.configureVaultAuth(null); vi.restoreAllMocks(); });
describe('vault session lifecycle', () => {
  it('starts locked regardless of JWT and refuses stale unlock work', () => {
    localStorage.setItem('mdp.jwt', JSON.stringify({access:'fixture'}));
    const ticket = s.sessionGeneration(); s.lockVault(false);
    expect(()=>s.activateVault(pair,ticket)).toThrow('interrompu');
    expect(s.isVaultUnlocked()).toBe(false);
  });
  it('keeps the pair over repeated background and resume cycles while auth remains valid', async () => {
    activate();
    for(let i=0;i<4;i++) {
      visible('hidden'); visible('visible'); await s.resumeVault();
      expect(s.isVaultUnlocked()).toBe(true); expect((await c.getKeyPair()).privateKey).toBe(pair.privateKey);
    }
  });
  it('does not lock because of inactivity, focus or unrelated tab activity', async () => {
    activate();
    window.dispatchEvent(new Event('pointerdown')); window.dispatchEvent(new Event('focus'));
    s.checkActivity(); await s.resumeVault();
    window.dispatchEvent(new StorageEvent('storage',{key:'unrelated-activity',newValue:'fixture'}));
    expect(s.isVaultUnlocked()).toBe(true);
  });
  it('keeps the vault unlocked across freeze and resume when auth remains valid', async () => {
    activate(); visible('hidden'); document.dispatchEvent(new Event('freeze'));
    expect(s.isVaultUnlocked()).toBe(true);
    visible('visible'); document.dispatchEvent(new Event('resume'));
    await s.resumeVault(); expect(s.isVaultUnlocked()).toBe(true);
  });
  it('propagates manual lock via the existing signal', () => {
    localStorage.removeItem('mdp.lock');
    activate(); s.lockVault(); expect(localStorage.getItem('mdp.lock')).toBeTruthy();
    activate(); window.dispatchEvent(new StorageEvent('storage',{key:'mdp.lock',newValue:'fixture'}));
    expect(s.isVaultUnlocked()).toBe(false);
  });
  it('keeps a browser-preserved page unlocked and rejects work after an explicit lock', async () => {
    activate(); const ticket=s.sessionGeneration(); window.dispatchEvent(new Event('pagehide'));
    expect(s.isVaultUnlocked()).toBe(true);
    const restored=new Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});window.dispatchEvent(restored);
    expect(s.isVaultUnlocked()).toBe(true);
    s.lockVault(false);
    expect(()=>s.activateVault(pair,ticket)).toThrow(); await expect(c.getKeyPair()).rejects.toThrow();
  });
  it('conceals and blocks during validation, then restores the unlocked vault', async () => {
    let resolve; const verify=vi.fn(()=>new Promise(r=>{resolve=r;}));
    s.configureVaultAuth({valid:()=>true,verify}); activate();
    const resumed=s.resumeVault(); await Promise.resolve();
    expect(document.documentElement.dataset.vaultSuspended).toBe('true');expect(()=>s.assertVaultAccess()).toThrow();
    resolve();await resumed;s.assertVaultAccess();
    expect(s.isVaultUnlocked()).toBe(true);
  });
  it('locks on invalid auth or network failure and never restores a late validation', async () => {
    s.configureVaultAuth({valid:()=>true,verify:async()=>{throw new Error('fixture network');}});
    activate();await s.resumeVault();expect(s.isVaultUnlocked()).toBe(false);
    let valid=true;let resolve;
    s.configureVaultAuth({valid:()=>valid,verify:()=>new Promise(r=>{resolve=r;})});activate();
    const pending=s.resumeVault();await Promise.resolve();s.lockVault(false);resolve();await pending;
    expect(s.isVaultUnlocked()).toBe(false);
    activate();valid=false;expect(()=>s.assertVaultAccess()).toThrow();
  });
  it('rejects a decryption completing after a manual lock', async () => {
    c.setKeyPair(pair.privateKey,pair.publicKey,false);
    const bundle=await c.encryptPayload({password:'fixture only'});activate();
    const original=crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle,'decrypt').mockImplementation(async(...args)=>{const result=await original(...args);s.lockVault(false);return result;});
    await expect(c.decryptPayload(bundle)).rejects.toThrow();expect(s.isVaultUnlocked()).toBe(false);
  });
  it('revalidates an expired access with a valid refresh without losing the pair', async () => {
    let expired=false;
    const verify=vi.fn(async()=>{expired=false;});
    s.configureVaultAuth({valid:()=>true,needsVerification:()=>expired,verify});
    activate();expired=true;
    expect(()=>s.assertVaultAccess()).toThrow();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(verify).toHaveBeenCalledTimes(1);s.assertVaultAccess();
    expect((await c.getKeyPair()).privateKey).toBe(pair.privateKey);
  });
  it('contains rejection of concurrent resume checks', async () => {
    let reject;
    s.configureVaultAuth({valid:()=>true,verify:()=>new Promise((resolve,r)=>{reject=r;})});activate();
    const first=s.resumeVault();await Promise.resolve();const second=s.resumeVault();
    reject(new Error('fixture network'));await Promise.all([first,second]);
    expect(s.isVaultUnlocked()).toBe(false);
  });

});
