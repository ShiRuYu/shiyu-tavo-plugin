import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldProactivelyMessage } from '../../src/runtime/proactive.js';

test('proactive policy suppresses characters present in the same scene', () => {
  const result = shouldProactivelyMessage({
    contact: { id: 7, lastContactAt: '2020-01-01T00:00:00.000Z' },
    event: { presentCharacterIds: [7], at: '2026-09-16T00:00:00.000Z' },
    settings: { enabled: true, probability: 1, cooldownMinutes: 0, absentAfterHours: 0 },
    random: () => 0,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'same_scene');
});

test('proactive policy allows an absent long-uncontacted character when probability passes', () => {
  const result = shouldProactivelyMessage({
    contact: { id: 8, lastContactAt: '2026-09-14T00:00:00.000Z' },
    event: { presentCharacterIds: [], at: '2026-09-16T00:00:00.000Z' },
    settings: { enabled: true, probability: 0.5, cooldownMinutes: 0, absentAfterHours: 24 },
    random: () => 0.1,
  });
  assert.equal(result.allowed, true);
});
