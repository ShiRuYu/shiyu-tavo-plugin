import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityService } from '../../src/wechat/identity-store.js';

test('identity service switches the active phone space and creates a shadow persona once', async () => {
  let state = {
    activeIdentityId: 'user:default',
    identities: [
      { id: 'user:default', kind: 'user', name: '用户' },
      { id: 'character:7', kind: 'character', characterId: 7, name: '林舟' },
    ],
  };
  const calls = [];
  const storage = { loadGlobal: async () => state, saveGlobal: async (next) => { state = next; } };
  const service = createIdentityService({ storage, adapter: { createPersona: async (persona) => { calls.push(persona); return { id: 22, ...persona }; } } });
  await service.switchIdentity('character:7');
  const personaId = await service.ensureShadowPersona(state.identities[1]);
  assert.equal(personaId, 22);
  assert.equal(state.activeIdentityId, 'character:7');
  assert.equal(calls.length, 1);
  assert.equal(await service.ensureShadowPersona(state.identities[1]), 22);
  assert.equal(calls.length, 1);
});
