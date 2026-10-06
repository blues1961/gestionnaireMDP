import { setKeyPair } from './crypto';

export const INACTIVITY_MS = 5 * 60 * 1000;
let generation = 0;
let unlocked = false;
let lastActivity = 0;
const listeners = new Set();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mdp-vault-lock') : null;

export const sessionGeneration = () => generation;
export const isVaultUnlocked = () => unlocked;
export function subscribeVault(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function lockVault(broadcast = true) {
  generation += 1;
  unlocked = false;
  setKeyPair(null, null);
  if (typeof document !== 'undefined') document.documentElement.dataset.vaultLocked = 'true';
  for (const fn of listeners) fn();
  if (broadcast) {
    channel?.postMessage('lock');
    try { localStorage.setItem('mdp.lock', `${Date.now()}:${generation}:${Math.random()}`); } catch { /* Memory lock still applies if storage is unavailable. */ }
  }
}
export function activateVault(pair, ticket) {
  if (ticket !== generation || document.visibilityState === 'hidden') throw new Error('Déverrouillage interrompu');
  setKeyPair(pair.privateKey, pair.publicKey);
  unlocked = true;
  document.documentElement.dataset.vaultLocked = 'false';
  lastActivity = Date.now();
  for (const fn of listeners) fn();
}
export function checkActivity(now = Date.now()) {
  if (unlocked && (now < lastActivity || now - lastActivity >= INACTIVITY_MS)) lockVault();
}
function activity() { checkActivity(); if (unlocked) lastActivity = Date.now(); }
if (typeof window !== 'undefined') {
  channel && (channel.onmessage = () => lockVault(false));
  window.addEventListener('storage', (e) => {
    if (['mdp.lock', 'mdp.jwt', 'token'].includes(e.key) || e.key === null) {
      lockVault(false);
      if (e.key !== 'mdp.lock') window.location.reload();
    }
  });
  window.addEventListener('mdp-auth-changed', () => lockVault());
  for (const name of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(name, activity, {passive: true});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lockVault();
    else checkActivity();
  });
  window.addEventListener('pagehide', () => lockVault());
  window.addEventListener('pageshow', e => e.persisted ? lockVault() : checkActivity());
  document.addEventListener('freeze', () => lockVault());
  document.addEventListener('resume', () => lockVault());
  window.addEventListener('focus', () => checkActivity());
  setInterval(checkActivity, 1000);
}
