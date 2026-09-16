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
