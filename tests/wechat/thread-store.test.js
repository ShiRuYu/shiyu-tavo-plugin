import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreadService } from '../../src/wechat/thread-store.js';

test('thread service creates an idempotent identity-scoped thread and appends messages', async () => {
  let state = { threads: {} };
  const storage = { loadGlobal: async () => state, saveGlobal: async (next) => { state = next; } };
  const service = createThreadService({ storage });
  const first = await service.getOrCreateThread({ identityId: 'user:default', kind: 'user-character', participantIds: [7] });
  const second = await service.getOrCreateThread({ identityId: 'user:default', kind: 'user-character', participantIds: [7] });
  assert.equal(first.id, second.id);
  await service.appendMessage(first.id, { authorId: 7, role: 'character', content: '你好' });
  assert.equal(state.threads[first.id].messages.length, 1);
  assert.match(await service.buildDigest(first.id), /你好/);
});
