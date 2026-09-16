import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('build creates the self-contained entry and phone fragment', async () => {
  await run(process.execPath, ['scripts/build.mjs']);
  await access('entry.js', constants.F_OK);
  await access('ui/phone.html', constants.F_OK);
  const fragment = await readFile('ui/phone.html', 'utf8');
  assert.match(fragment, /<style[\s\S]*<\/style>/);
  assert.match(fragment, /<script[\s\S]*<\/script>/);
  assert.match(fragment, /data-shiyu-phone/);
});
