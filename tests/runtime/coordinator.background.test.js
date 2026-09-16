import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeCoordinator } from '../../src/runtime/coordinator.js';

test('background coordinator can create a proactive thread message for an eligible contact', async () => {
  const threads = [];
  const generated = [];
  const state = {
    activeIdentityId: 'user:default',
    identities: [
      { id: 'user:default', kind: 'user', name: '用户', settings: { proactiveEnabled: true } },
      { id: 'character:8', kind: 'character', characterId: 8, name: '周澜', settings: { proactiveEnabled: true } },
    ],
    detection: { enabled: false },
    threads: {},
    candidates: [],
  };
  const coordinator = createRuntimeCoordinator({
    tavo: { plugin: { on: () => {} } },
    adapter: {},
    storage: { loadGlobal: async () => state, saveGlobal: async () => {}, loadChatLink: async () => ({ digest: '' }) },
    threadService: {
      getOrCreateThread: async (input) => { const thread = { id: 'thread-1', ...input }; threads.push(thread); return thread; },
    },
    roleDialogueService: { generateExchange: async (input) => { generated.push(input); } },
  });
  await coordinator.runBackground({ chatId: 7, text: '周澜不在现场，刚刚离开。', at: '2026-09-16T00:00:00.000Z', presentCharacterIds: [] });
  assert.equal(threads.length, 1);
  assert.equal(generated.length, 1);
  assert.equal(generated[0].speakerId, 8);
});
