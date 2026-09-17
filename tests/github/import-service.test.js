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

test('import service prepares a batch and applies create/update/skip decisions', async () => {
  const calls = [];
  let persisted = { github: { importHistory: {} } };
  const adapter = {
    createCharacter: async (card) => { calls.push({ action: 'create', card }); return { id: 7, name: card.data?.name || card.name }; },
    findResource: async (_kind, name) => name === 'existing.json' ? [{ id: 9, name }] : [],
    getResource: async () => ({ id: 9, name: 'Existing', description: 'old' }),
    updateResource: async (kind, value) => { calls.push({ action: 'update', kind, value }); return value; },
  };
  const service = createImportService({
    client: { readFile: async (_config, path) => ({ path, text: JSON.stringify(path === 'existing.json' ? { name: 'Existing', first_mes: 'new' } : { name: 'New', first_mes: 'hi' }) }) },
    adapter,
    storage: { loadGlobal: async () => persisted, saveGlobal: async (next) => { persisted = next; } },
  });
  const candidates = await service.prepareFiles({ config: { repository: 'a/b', branch: 'main' }, entries: [{ name: 'existing.json', path: 'existing.json', type: 'file', size: 10, sha: 'same' }, { name: 'new.json', path: 'new.json', type: 'file', size: 10, sha: 'new' }] });
  assert.equal(candidates[0].duplicate.kind, 'name');
  assert.equal(candidates[1].duplicate.kind, 'none');
  const result = await service.importCandidates(candidates, { [candidates[0].sourceKey]: { decision: 'update' }, [candidates[1].sourceKey]: { decision: 'create' } });
  assert.deepEqual(result.map((item) => item.status), ['updated', 'created']);
  assert.equal(calls[0].action, 'update');
  assert.equal(calls[1].action, 'create');
  assert.ok(persisted.github.importHistory[candidates[1].sourceKey]);
});
