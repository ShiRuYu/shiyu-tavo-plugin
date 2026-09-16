import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMainChatText } from '../../src/runtime/main-chat-link.js';

test('main chat link appends a bounded phone digest without changing the visible message', () => {
  const text = prepareMainChatText('继续剧情', ['林舟: 我在码头。', '阿岚: 小心。']);
  assert.match(text, /<shiyu-phone-context>/);
  assert.match(text, /继续剧情/);
  assert.match(text, /林舟/);
});
