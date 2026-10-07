import { setKeyPair, setKeyAccessGuard } from './crypto';

let generation = 0;
let unlocked = false;
let pendingValidation = null;
let authPolicy = null;
const listeners = new Set();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mdp-vault-lock') : null;

// API registers its policy without introducing an API/crypto import cycle.
export function configureVaultAuth(policy) { authPolicy = policy; }
export const sessionGeneration = () => { checkActivity(); return generation; };
export const isVaultUnlocked = () => { checkActivity(); return unlocked; };
export function subscribeVault(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function lockVault(broadcast = true) {
  generation += 1;
  unlocked = false;
  pendingValidation = null;
  setKeyPair(null, null);
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.vaultLocked = 'true';
    document.documentElement.dataset.vaultSuspended = 'false';
  }
  for (const fn of listeners) fn();
  if (broadcast) {
    channel?.postMessage('lock');
    try { localStorage.setItem('mdp.lock', `${Date.now()}:${generation}:${Math.random()}`); } catch { /* Memory lock still applies if storage is unavailable. */ }
  }
}
export function activateVault(pair, ticket) {
  checkActivity();
  if (ticket !== generation || document.visibilityState === 'hidden' || (authPolicy && !authPolicy.valid())) throw new Error('Déverrouillage interrompu');
  setKeyPair(pair.privateKey, pair.publicKey, true);
  unlocked = true;
  document.documentElement.dataset.vaultLocked = 'false';
  document.documentElement.dataset.vaultSuspended = 'false';
  for (const fn of listeners) fn();
}
export function checkActivity() {
  if (!unlocked) return;
  if (authPolicy && !authPolicy.valid()) {
    lockVault(false);
    return;
  }
  if (authPolicy?.needsVerification?.() && !pendingValidation) {
    conceal();
    // Defer until the current check returns, preventing recursion through Axios.
    pendingValidation = Promise.resolve();
    const ticket = generation;
    queueMicrotask(() => {
      if (ticket !== generation) return;
      pendingValidation = null;
      void resumeVault(true);
    });
  }
}
export function assertVaultAccess() {
  checkActivity();
  if (!unlocked || pendingValidation || document.documentElement.dataset.vaultSuspended === 'true' || document.visibilityState === 'hidden') throw new Error('Voûte verrouillée ou session en cours de vérification');
}
setKeyAccessGuard(assertVaultAccess);
function conceal() {
  if (unlocked) document.documentElement.dataset.vaultSuspended = 'true';
}
export async function resumeVault(skipInitialCheck = false) {
  if (!skipInitialCheck) checkActivity();
  if (!unlocked || document.visibilityState === 'hidden') return;
  if (pendingValidation) return pendingValidation.catch(() => undefined);
  conceal();
  const ticket = generation;
  // Keep access blocked until the server confirms the account, including after sleep.
  const validation = Promise.resolve().then(() => authPolicy?.verify());
  pendingValidation = validation;
  try {
    await validation;
    checkActivity();
    if (ticket === generation && unlocked && document.visibilityState !== 'hidden') {
      document.documentElement.dataset.vaultSuspended = 'false';
    }
  } catch {
    if (ticket === generation) lockVault();
  } finally {
    if (pendingValidation === validation) pendingValidation = null;
  }
}
if (typeof window !== 'undefined') {
  channel && (channel.onmessage = e => { if (e.data === 'lock') lockVault(false); });
  window.addEventListener('storage', (e) => {
    if (e.key === 'mdp.lock') lockVault(false);
    else if (['mdp.jwt', 'token'].includes(e.key) || e.key === null) {
      if (!authPolicy?.sameAccount(e)) {
        lockVault(false);
        window.location.reload();
      }
    }
  });
  window.addEventListener('mdp-auth-changed', () => lockVault());
  // Browser lifecycle events must not alter an in-memory unlock. A reload or a
  // genuinely destroyed/evicted document loses module memory naturally. Auth
  // invalidation is still enforced by storage signals, token checks and 401s.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkActivity();
  });
}
