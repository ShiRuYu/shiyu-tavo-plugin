import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('manifest declares the v2 phone plugin and self-contained chat fragment', async () => {
  const manifest = JSON.parse(
    await readFile(join(root, 'manifest.json'), 'utf8'),
  );

  assert.equal(manifest.specVersion, 2);
  assert.equal(manifest.id, 'com.shiyu.phone');
  assert.equal(manifest.entry, 'entry.js');
  assert.equal(manifest.localization.defaultLocale, 'zh-CN');
  assert.deepEqual(manifest.localization.resources, {
    en: 'locales/en.json',
    'zh-CN': 'locales/zh-CN.json',
  });
  assert.deepEqual(manifest.contributes.htmlFragments, [
    { id: 'phone', src: 'ui/phone.html', mount: '/chat/body/end' },
  ]);
  assert.ok(manifest.permissions.includes('generate'));
  assert.ok(manifest.permissions.includes('network'));
});
