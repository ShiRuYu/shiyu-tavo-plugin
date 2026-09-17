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
    importService: { client: { listFiles: async (config) => { listed = config; return [{ path: 'cards/a.json', type: 'blob' }, { path: 'cards/b.png', type: 'blob' }]; } } },
  });
  root.querySelector('.phone-launcher').click();
  root.querySelector('[data-app="import"]').click();
  assert.equal(root.querySelector('.github-owner'), null);
  root.querySelector('.github-repository').value = 'https://github.com/ShiRuYu/shiyu-tavo-plugin';
  root.querySelector('.github-branch').value = 'master';
  root.querySelector('[data-action="github-load"]').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.github.repository, 'https://github.com/ShiRuYu/shiyu-tavo-plugin');
  assert.equal(listed.branch, 'master');
  const cardsDirectory = root.querySelector('[data-action="github-directory"]');
  assert.ok(cardsDirectory);
  cardsDirectory.click();
  assert.match(root.textContent, /a\.json/);
  app.dispose();
  delete globalThis.window;
  delete globalThis.document;
});

test('each app exposes a return-to-phone-home action', async () => {
  const window = new Window();
  globalThis.window = window;
  globalThis.document = window.document;
  const { mountPhone } = await import('../../src/ui/phone-app.js?ui-test=4');
  const root = document.createElement('div');
  document.body.append(root);
  const app = mountPhone(root, { state: { activeIdentity: { name: '用户' }, candidates: [], contacts: [], moments: [] } });
  root.querySelector('.phone-launcher').click();
  for (const appId of ['characters', 'import', 'wechat']) {
    root.querySelector(`[data-app="${appId}"]`).click();
    assert.ok(root.querySelector('[data-action="phone-home"]'));
    root.querySelector('[data-action="phone-home"]').click();
    assert.ok(root.querySelector('[data-app="characters"]'));
  }
  app.dispose();
  delete globalThis.window;
  delete globalThis.document;
});

test('character manager can run a manual detection and show candidates', async () => {
  const window = new Window();
  globalThis.window = window;
  globalThis.document = window.document;
  const { mountPhone } = await import('../../src/ui/phone-app.js?ui-test=5');
  const root = document.createElement('div');
  document.body.append(root);
  let detections = 0;
  const app = mountPhone(root, {
    state: { activeIdentity: { name: '用户' }, candidates: [], contacts: [], moments: [] },
    manualDetection: { detect: async () => { detections += 1; return [{ id: 'candidate:manual', name: '林舟', description: '船医' }]; } },
  });
  root.querySelector('.phone-launcher').click();
  root.querySelector('[data-app="characters"]').click();
  root.querySelector('[data-action="manual-detect"]').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(detections, 1);
  assert.equal(root.querySelector('.candidate-name').value, '林舟');
  app.dispose();
  delete globalThis.window;
  delete globalThis.document;
});

test('character manager can generate a candidate card from user description', async () => {
  const window = new Window();
  globalThis.window = window;
  globalThis.document = window.document;
  const { mountPhone } = await import('../../src/ui/phone-app.js?ui-test=6');
  const root = document.createElement('div');
  document.body.append(root);
  const app = mountPhone(root, {
    state: { activeIdentity: { name: '用户' }, candidates: [], contacts: [], moments: [] },
    adapter: { oneOffGenerate: async () => JSON.stringify({ candidates: [{ name: '顾遥', description: '住在灯塔的修理师', first_mes: '晚上好。' }] }) },
  });
  root.querySelector('.phone-launcher').click();
  root.querySelector('[data-app="characters"]').click();
  root.querySelector('[data-action="role-prompt"]').value = '生成一个住在灯塔的修理师';
  root.querySelector('[data-action="generate-role"]').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(root.querySelector('.candidate-name').value, '顾遥');
  assert.equal(root.querySelector('.candidate-description').value, '住在灯塔的修理师');
  app.dispose();
  delete globalThis.window;
  delete globalThis.document;
});
