import Dexie from "dexie";
import "fake-indexeddb/auto";
import { afterEach, beforeEach, vi } from "vitest";
import { webcrypto } from "node:crypto";

const DB_NAME = "gestionnaire-mdp-crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

Dexie.dependencies.indexedDB = globalThis.indexedDB;
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await Dexie.delete(DB_NAME);
});
