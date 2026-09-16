import test from 'node:test';
import assert from 'node:assert/strict';
import { createTavoAdapter } from '../../src/tavo/adapter.js';

test('adapter maps one-off generation to the injected Tavo facade', async () => {
  const calls = [];
  const adapter = createTavoAdapter({
    generate: async (prompt, options) => {
      calls.push({ prompt, options });
      return 'analysis';
    },
  });
  assert.equal(await adapter.oneOffGenerate('prompt', { context: false }), 'analysis');
  assert.deepEqual(calls, [{ prompt: 'prompt', options: { context: false } }]);
});

test('adapter creates a character with an idempotency key', async () => {
  const calls = [];
  const adapter = createTavoAdapter({
    character: {
      create: async (character, options) => {
        calls.push({ character, options });
        return { id: 8, ...character };
      },
    },
  });
  const created = await adapter.createCharacter({ name: '新角色', description: 'desc', first_mes: 'hi' }, 'candidate-1');
  assert.equal(created.id, 8);
  assert.deepEqual(calls[0].options, { clientRequestId: 'candidate-1' });
});
