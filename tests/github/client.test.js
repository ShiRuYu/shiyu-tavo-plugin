import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient } from '../../src/github/client.js';

test('GitHub client reads a repository tree and decodes file content', async () => {
  const requests = [];
  const client = new GitHubClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/git/trees/')) return new Response(JSON.stringify({ tree: [{ path: 'cards/a.json', type: 'blob' }] }), { status: 200 });
      return new Response(JSON.stringify({ content: Buffer.from('{"name":"A"}').toString('base64'), encoding: 'base64' }), { status: 200 });
    },
  });
  const config = { owner: 'ShiRuYu', repo: 'repo', branch: 'master', token: 'secret' };
  assert.deepEqual(await client.listFiles(config), [{ path: 'cards/a.json', type: 'blob' }]);
  assert.equal((await client.readFile(config, 'cards/a.json')).text, '{"name":"A"}');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret');
});

test('GitHub client returns a structured auth error for rejected requests', async () => {
  const client = new GitHubClient({ fetchImpl: async () => new Response('nope', { status: 401 }) });
  await assert.rejects(() => client.testConnection({ owner: 'a', repo: 'b', branch: 'main' }), (error) => {
    assert.equal(error.code, 'github_auth');
    return true;
  });
});
