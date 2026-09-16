import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, 'ui');
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [join(root, 'src/runtime/entry-main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  outfile: join(root, 'entry.js'),
  legalComments: 'none',
});

const uiBuild = await build({
  entryPoints: [join(root, 'src/ui/phone-app.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});

const [template, css] = await Promise.all([
  readFile(join(root, 'src/ui/phone.template.html'), 'utf8'),
  readFile(join(root, 'src/ui/styles.css'), 'utf8'),
]);
const uiScript = new TextDecoder().decode(uiBuild.outputFiles[0].contents);
const fragment = template
  .replace('/*__PHONE_CSS__*/', () => css)
  .replace('/*__PHONE_JS__*/', () => uiScript);
await writeFile(join(outputDir, 'phone.html'), fragment, 'utf8');
