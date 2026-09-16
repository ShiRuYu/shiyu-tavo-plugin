import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoleDialogueService } from '../../src/runtime/role-dialogue.js';

test('role dialogue generates a bounded message and stores it in the plugin thread', async () => {
  const calls = [];
  const messages = [];
  const service = createRoleDialogueService({
    adapter: { oneOffGenerate: async (prompt, options) => { calls.push({ prompt, options }); return '角色乙：我们去码头。'; } },
    threadService: { appendMessage: async (threadId, message) => { messages.push({ threadId, message }); } },
  });
  const result = await service.generateExchange({
    threadId: 'thread:character:7:character-character:7,8',
    speakerId: 8,
    speakerName: '角色乙',
    context: '角色甲刚刚发现一封信。',
  });
  assert.equal(result.content, '角色乙：我们去码头。');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.authorId, 8);
  assert.equal(calls[0].options.context, false);
});
