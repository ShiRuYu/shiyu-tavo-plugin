import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNewRoles, parseDetectorResponse } from '../../src/detection/role-detector.js';

test('parses fenced detector JSON and drops incomplete candidates', () => {
  const candidates = parseDetectorResponse('```json\n{"candidates":[{"name":"林舟","description":"船医","evidence":"码头","confidence":0.9},{"description":"missing"}]}\n```');
  assert.deepEqual(candidates, [{
    name: '林舟',
    aliases: [],
    description: '船医',
    personality: '',
    scenario: '',
    first_mes: '',
    tags: [],
    evidence: '码头',
    confidence: 0.9,
    status: 'pending',
  }]);
});

test('detectNewRoles excludes known and duplicate names', async () => {
  const calls = [];
  const result = await detectNewRoles({
    messages: [{ role: 'assistant', content: '林舟走进房间。' }],
    knownCharacters: [{ name: '阿岚' }],
    existingCandidates: [{ name: '林舟' }],
    oneOffGenerate: async (prompt) => {
      calls.push(prompt);
      return JSON.stringify({ candidates: [
        { name: '阿岚', description: 'known' },
        { name: '林舟', description: 'duplicate' },
        { name: '周澜', description: 'new', evidence: '房间', confidence: 0.8 },
      ] });
    },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '周澜');
  assert.match(calls[0], /阿岚/);
});
