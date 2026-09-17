import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('phone shell uses a bounded flex layout so the bottom nav remains visible', async () => {
  const css = await readFile('src/ui/styles.css', 'utf8');
  assert.match(css, /\.phone-shell\s*\{[\s\S]*display:\s*flex/);
  assert.match(css, /\.phone-content\s*\{[\s\S]*min-height:\s*0/);
  assert.match(css, /\.phone-nav\s*\{[\s\S]*flex:\s*0\s+0\s+auto/);
});
