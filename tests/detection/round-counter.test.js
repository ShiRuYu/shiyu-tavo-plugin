import test from 'node:test';
import assert from 'node:assert/strict';
import { countCompletedRounds, recentRoundMessages } from '../../src/detection/round-counter.js';

test('counts only persisted user-to-assistant pairs as complete rounds', () => {
  const messages = [
    { id: 1, role: 'user', content: 'hello' },
    { id: 2, role: 'assistant', content: 'hi' },
    { id: 3, role: 'user', content: 'next' },
    { id: 4, role: 'assistant', content: 'reply' },
    { id: 5, role: 'user', content: 'unfinished' },
    { id: 6, role: 'assistant', content: 'streaming', hidden: true },
  ];
  assert.equal(countCompletedRounds(messages), 2);
});

test('recentRoundMessages returns the newest complete-round window', () => {
  const messages = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index + 1}`,
  }));
  assert.deepEqual(recentRoundMessages(messages, 2).map((message) => message.id), [5, 6, 7, 8]);
});
