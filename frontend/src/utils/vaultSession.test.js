import { describe, expect, it } from 'vitest';
import * as s from './vaultSession';
import * as c from './crypto';

describe('vault session lifecycle', () => {
  it('starts locked regardless of JWT and refuses stale unlock work', async () => {
    localStorage.setItem('mdp.jwt', JSON.stringify({access:'fixture'}));
    s.lockVault(false);
    const ticket = s.sessionGeneration();
    const pair = await c.generateExportablePair();
    s.lockVault(false);
    expect(() => s.activateVault(pair,ticket)).toThrow('interrompu');
    expect(s.isVaultUnlocked()).toBe(false);
  },20000);
  it('locks on inactivity, backgrounding and inter-tab storage events', async () => {
    const pair = await c.generateExportablePair();
    s.activateVault(pair,s.sessionGeneration());
    s.checkActivity(Date.now()+s.INACTIVITY_MS+1);
    expect(s.isVaultUnlocked()).toBe(false);
    s.activateVault(pair,s.sessionGeneration());
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.isVaultUnlocked()).toBe(false);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    s.activateVault(pair,s.sessionGeneration());
    window.dispatchEvent(new StorageEvent('storage',{key:'mdp.lock',newValue:'fixture'}));
    expect(s.isVaultUnlocked()).toBe(false);
    await expect(c.getKeyPair()).rejects.toThrow();
    s.activateVault(pair,s.sessionGeneration());
    document.dispatchEvent(new Event('freeze'));
    expect(s.isVaultUnlocked()).toBe(false);
    s.activateVault(pair,s.sessionGeneration());
    const restored = new Event('pageshow');
    Object.defineProperty(restored,'persisted',{value:true});
    window.dispatchEvent(restored);
    expect(s.isVaultUnlocked()).toBe(false);
  },20000);
});
