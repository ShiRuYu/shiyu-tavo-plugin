import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import yauzl from 'yauzl-promise';

const run = promisify(execFile);

test('package creates a safe tpg archive with the manifest at its root', async () => {
  await run(process.execPath, ['scripts/build.mjs']);
  await run(process.execPath, ['scripts/package.mjs']);
  const zip = await yauzl.open('dist/shiyu-phone.tpg');
  const names = [];
  for await (const entry of zip) names.push(entry.filename);
  await zip.close();
  assert.ok(names.includes('manifest.json'));
  assert.ok(names.includes('entry.js'));
  assert.ok(names.includes('ui/phone.html'));
  assert.ok(names.includes('locales/en.json'));
  assert.ok(names.includes('locales/zh-CN.json'));
  assert.equal(names.some((name) => name.startsWith('/') || name.includes('..')), false);
  assert.equal(JSON.parse(await readFile('manifest.json', 'utf8')).id, 'com.shiyu.phone');
});
