import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomentsService } from '../../src/wechat/moments-store.js';

test('moments service stores posts and returns newest-first feed for an identity', async () => {
  let state = { moments: [] };
  const storage = { loadGlobal: async () => state, saveGlobal: async (next) => { state = next; } };
  const service = createMomentsService({ storage, now: () => 1000 });
  await service.createMoment('user:default', { text: '第一条' });
  await service.createMoment('character:7', { text: '第二条' });
  const feed = await service.listFeed('user:default');
  assert.deepEqual(feed.map((post) => post.text), ['第二条', '第一条']);
});
