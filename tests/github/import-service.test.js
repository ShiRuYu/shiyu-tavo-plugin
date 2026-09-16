import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportService } from '../../src/github/import-service.js';

test('import service maps classified files to the matching Tavo resource API', async () => {
  const calls = [];
  const service = createImportService({
    client: { readFile: async () => ({ path: 'hero.json', text: JSON.stringify({ spec: 'chara_card_v3', data: { name: 'Hero', description: 'd', first_mes: 'h' } }) }) },
    adapter: { createCharacter: async (card, id) => { calls.push({ card, id }); return { id: 7, name: 'Hero' }; } },
  });
  const result = await service.importFile({ config: {}, path: 'hero.json', conflict: 'new' });
  assert.equal(result.kind, 'character');
  assert.equal(result.resource.id, 7);
  assert.equal(calls[0].id, 'github:hero.json:new');
});
