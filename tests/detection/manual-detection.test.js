import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualDetectionService } from '../../src/detection/manual-detection.js';

test('manual detection reads the current chat and stores editable candidates immediately', async () => {
  let saved;
  const service = createManualDetectionService({
    adapter: {
      currentChat: async () => ({ id: 42 }),
      listMessages: async () => [
        { role: 'user', content: '我们走进港口。' },
        { role: 'assistant', content: '陌生的船医林舟向你招手。' },
      ],
      findCharacters: async () => [],
      oneOffGenerate: async () => JSON.stringify({ candidates: [{ name: '林舟', description: '船医' }] }),
    },
    storage: {
      loadGlobal: async () => saved || { candidates: [], detection: { recentWindowRounds: 5 } },
      saveGlobal: async (value) => { saved = value; },
    },
  });

  const candidates = await service.detect();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, '林舟');
  assert.equal(saved.candidates[0].status, 'pending');
  assert.equal(saved.candidates[0].chatId, 42);
});

