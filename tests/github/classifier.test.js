import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyResource } from '../../src/github/classifier.js';

test('classifies CCv3 character and lorebook JSON', () => {
  assert.equal(classifyResource({ path: 'hero.json', text: JSON.stringify({ spec: 'chara_card_v3', data: { name: 'Hero' } }) }).kind, 'character');
  assert.equal(classifyResource({ path: 'world.json', text: JSON.stringify({ name: 'World', entries: [{ keys: ['city'], content: 'A city' }] }) }).kind, 'lorebook');
});

test('classifies preset JSON and rejects invalid JSON', () => {
  assert.equal(classifyResource({ path: 'preset.json', text: JSON.stringify({ name: 'Calm', temperature: 0.7 }) }).kind, 'preset');
  const invalid = classifyResource({ path: 'bad.json', text: '{' });
  assert.equal(invalid.kind, 'unknown');
  assert.ok(invalid.warnings.length);
});

test('extracts an embedded chara JSON payload from a PNG tEXt chunk', () => {
  const payload = Buffer.from(JSON.stringify({ name: 'PNG角色', description: 'd', first_mes: 'h' })).toString('base64');
  const keyValue = Buffer.from(`chara\0${payload}`, 'latin1');
  const chunk = Buffer.alloc(12 + keyValue.length);
  chunk.writeUInt32BE(keyValue.length, 0);
  chunk.write('tEXt', 4, 4, 'ascii');
  keyValue.copy(chunk, 8);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const file = { path: 'cards/hero.png', bytesBase64: Buffer.concat([signature, chunk]).toString('base64') };
  const result = classifyResource(file);
  assert.equal(result.kind, 'character');
  assert.equal(result.parsed.name, 'PNG角色');
});
