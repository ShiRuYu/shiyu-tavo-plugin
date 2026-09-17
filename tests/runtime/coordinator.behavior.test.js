import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeCoordinator } from '../../src/runtime/coordinator.js';

test('generation prepare injects the current chat digest into model-only text', async () => {
  const coordinator = createRuntimeCoordinator({
    tavo: { plugin: { on: () => {} } },
    adapter: {},
    storage: {
      loadGlobal: async () => ({ activeIdentityId: 'user:default' }),
      loadChatLink: async () => ({ digest: '林舟：我在码头。' }),
    },
  });
  const event = { chatId: 7, text: '继续剧情' };
  await coordinator.handlers['generation:prepare'](event);
  assert.match(event.text, /林舟：我在码头/);
  assert.match(event.text, /继续剧情/);
});

test('generation success queues role detection without blocking the hook', async () => {
  let detectCalls = 0;
  const coordinator = createRuntimeCoordinator({
    tavo: { plugin: { on: () => {} } },
    adapter: {
      listMessages: async () => [
        { id: 1, role: 'user', content: 'a' },
        { id: 2, role: 'assistant', content: 'b' },
      ],
      findCharacters: async () => [],
    },
    storage: {
      loadGlobal: async () => ({ detection: { enabled: true, roundThreshold: 1, recentWindowRounds: 1 }, candidates: [] }),
      saveGlobal: async () => {},
      loadChatLink: async () => ({ completedRounds: 0, digest: '' }),
      saveChatLink: async () => {},
    },
    detectionService: { detectNewRoles: async () => { detectCalls += 1; return []; } },
  });
  await coordinator.handlers['generation:success']({ chatId: 7 });
  await coordinator.flush();
  assert.equal(detectCalls, 1);
});

test('generation success automatically scans social state when enabled', async () => {
  let generated = 0;
  const state = {
    activeIdentityId: 'user:default',
    wechat: { autoScanEnabled: true },
    identities: [
      { id: 'user:default', kind: 'user', settings: { proactiveEnabled: true } },
      { id: 'character:8', kind: 'character', characterId: 8, name: '周澜', settings: { proactiveEnabled: true } },
    ],
    threads: {},
    candidates: [],
    detection: { enabled: false },
  };
  const coordinator = createRuntimeCoordinator({
    tavo: { plugin: { on: () => {} } },
    adapter: {},
    storage: { loadGlobal: async () => state, loadChatLink: async () => ({ digest: '' }) },
    threadService: { getOrCreateThread: async (input) => ({ id: 'thread-1', ...input }) },
    roleDialogueService: { generateExchange: async () => { generated += 1; } },
  });
  await coordinator.handlers['generation:success']({ chatId: 7, text: '周澜离开了现场。', presentCharacterIds: [] });
  await coordinator.flush();
  assert.equal(generated, 1);
});
