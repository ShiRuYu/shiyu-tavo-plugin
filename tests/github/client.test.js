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

test('GitHub client lists one directory with folders and files', async () => {
  let requested;
  const client = new GitHubClient({
    fetchImpl: async (url) => {
      requested = url;
      return new Response(JSON.stringify([
        { name: 'cards', path: 'cards', type: 'dir', sha: 'dir-sha' },
        { name: 'hero.json', path: 'cards/hero.json', type: 'file', size: 42, sha: 'file-sha', download_url: 'https://raw.githubusercontent.com/a/b/main/cards/hero.json', html_url: 'https://github.com/a/b/blob/main/cards/hero.json' },
      ]), { status: 200 });
    },
  });
  assert.deepEqual(await client.listDirectory({ repository: 'a/b', branch: 'main' }, 'cards'), [
    { name: 'cards', path: 'cards', type: 'dir', size: 0, sha: 'dir-sha', downloadUrl: '', htmlUrl: 'https://github.com/a/b/tree/main/cards' },
    { name: 'hero.json', path: 'cards/hero.json', type: 'file', size: 42, sha: 'file-sha', downloadUrl: 'https://raw.githubusercontent.com/a/b/main/cards/hero.json', htmlUrl: 'https://github.com/a/b/blob/main/cards/hero.json' },
  ]);
  assert.match(requested, /\/repos\/a\/b\/contents\/cards\?ref=main$/);
});

test('GitHub client retries a transient response once', async () => {
  let attempts = 0;
  const client = new GitHubClient({
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1 ? new Response('busy', { status: 503 }) : new Response(JSON.stringify({ tree: [] }), { status: 200 });
    },
  });
  assert.deepEqual(await client.listFiles({ repository: 'a/b', branch: 'main' }), []);
  assert.equal(attempts, 2);
});
