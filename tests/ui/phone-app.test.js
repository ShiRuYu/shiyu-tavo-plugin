import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

test('phone UI opens from the launcher and switches between apps', async () => {
  const window = new Window();
  globalThis.window = window;
  globalThis.document = window.document;
  const { mountPhone } = await import('../../src/ui/phone-app.js?ui-test=1');
  const root = document.createElement('div');
  document.body.append(root);
  const app = mountPhone(root, { state: { activeIdentity: { name: '用户' }, candidates: [], contacts: [], moments: [] } });
  const launcher = root.querySelector('.phone-launcher');
  assert.equal(launcher.hidden, false);
  launcher.click();
  assert.equal(root.querySelector('.phone-shell').hidden, false);
  root.querySelector('[data-app="characters"]').click();
  assert.equal(root.querySelector('.phone-title').textContent, '角色管理');
  app.dispose();
  delete globalThis.window;
  delete globalThis.document;
});

test('wechat UI exposes four navigation tabs', async () => {
  const window = new Window();
  globalThis.window = window;
  globalThis.document = window.document;
  const { mountPhone } = await import('../../src/ui/phone-app.js?ui-test=2');
  const root = document.createElement('div');
  document.body.append(root);
  mountPhone(root, { state: { activeIdentity: { name: '用户' }, candidates: [], contacts: [], moments: [] } });
  root.querySelector('.phone-launcher').click();
  root.querySelector('[data-app="wechat"]').click();
  assert.deepEqual([...root.querySelectorAll('.phone-nav button')].map((button) => button.textContent), ['微信', '通讯录', '发现', '我的']);
  delete globalThis.window;
  delete globalThis.document;
});

test('github browse persists the current repository form before listing files', async () => {
  const window = new Window();
  globalThis.window = window;
  globalThis.document = window.document;
  const { mountPhone } = await import('../../src/ui/phone-app.js?ui-test=3');
  const root = document.createElement('div');
  document.body.append(root);
  let saved;
  let listed;
  const app = mountPhone(root, {
    state: { activeIdentity: { name: '用户' }, candidates: [], contacts: [], moments: [] },
    storage: {
      saveGlobal: async (value) => { saved = value; },
      loadGlobal: async () => saved,
    },
    importService: { client: { listFiles: async (config) => { listed = config; return []; } } },
  });
  root.querySelector('.phone-launcher').click();
  root.querySelector('[data-app="import"]').click();
  root.querySelector('.github-owner').value = 'ShiRuYu';
  root.querySelector('.github-repo').value = 'shiyu-tavo-plugin';
  root.querySelector('.github-branch').value = 'master';
  root.querySelector('.phone-button.primary').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.github.owner, 'ShiRuYu');
  assert.equal(saved.github.repo, 'shiyu-tavo-plugin');
  assert.equal(listed.branch, 'master');
  app.dispose();
  delete globalThis.window;
  delete globalThis.document;
});
