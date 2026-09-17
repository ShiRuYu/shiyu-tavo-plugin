import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialScanner } from '../../src/runtime/social-scanner.js';

test('social scanner reads the current chat and can trigger a proactive thread', async () => {
  const threads = [];
  const generated = [];
  const state = {
    activeIdentityId: 'user:default',
    identities: [
      { id: 'user:default', kind: 'user', name: '用户', settings: { proactiveEnabled: true } },
      { id: 'character:8', kind: 'character', characterId: 8, name: '周澜', settings: { proactiveEnabled: true } },
    ],
    threads: {},
    wechat: { autoScanEnabled: true },
  };
  const scanner = createSocialScanner({
    adapter: {
      currentChat: async () => ({ id: 7 }),
      listMessages: async () => [{ role: 'assistant', content: '周澜已经离开现场。' }],
    },
    storage: { loadGlobal: async () => state },
    threadService: { getOrCreateThread: async (input) => { const thread = { id: 'thread-1', ...input }; threads.push(thread); return thread; } },
    roleDialogueService: { generateExchange: async (input) => { generated.push(input); } },
  });
  const result = await scanner.scan();
  assert.equal(result.proactive, 1);
  assert.equal(threads[0].participantIds[0], 8);
  assert.match(generated[0].context, /周澜/);
});
