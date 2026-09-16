import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, DEFAULT_PHONE_STATE } from '../../src/core/storage.js';

test('storage loads a default global phone state when no state exists', async () => {
  const values = new Map();
  const storage = createStorage({
    variable: {
      get: async (name, options) => values.get(`${options.scope}:${name}`) ?? null,
      set: async (name, value, options) => values.set(`${options.scope}:${name}`, value),
    },
  });
  const state = await storage.loadGlobal();
  assert.deepEqual(state, DEFAULT_PHONE_STATE);
});

test('storage round-trips global phone state through the global variable namespace', async () => {
  const values = new Map();
  const storage = createStorage({
    variable: {
      get: async (name, options) => values.get(`${options.scope}:${name}`) ?? null,
      set: async (name, value, options) => values.set(`${options.scope}:${name}`, value),
    },
  });
  const next = { ...DEFAULT_PHONE_STATE, activeIdentityId: 'character:7' };
  await storage.saveGlobal(next);
  assert.deepEqual(await storage.loadGlobal(), next);
});
