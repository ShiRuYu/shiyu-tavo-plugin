import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, parseRepositoryInput } from '../../src/github/client.js';

test('repository input accepts owner/repo and GitHub URLs', () => {
  assert.deepEqual(parseRepositoryInput('ShiRuYu/shiyu-tavo-plugin'), { owner: 'ShiRuYu', repo: 'shiyu-tavo-plugin' });
  assert.deepEqual(parseRepositoryInput('https://github.com/ShiRuYu/shiyu-tavo-plugin.git'), { owner: 'ShiRuYu', repo: 'shiyu-tavo-plugin' });
});

test('GitHub client builds API paths from the repository field', async () => {
  let requested;
  const client = new GitHubClient({
    fetchImpl: async (url) => {
      requested = url;
      return new Response(JSON.stringify({ tree: [] }), { status: 200 });
    },
  });
  await client.listFiles({ repository: 'ShiRuYu/shiyu-tavo-plugin', branch: 'master' });
  assert.match(requested, /\/repos\/ShiRuYu\/shiyu-tavo-plugin\/git\/trees\/master/);
});
