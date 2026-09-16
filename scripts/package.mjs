import yazl from 'yazl';
import { mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const { ZipFile } = yazl;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist', 'shiyu-phone.tpg');
const entries = [
  ['manifest.json', 'manifest.json'],
  ['entry.js', 'entry.js'],
  ['ui/phone.html', 'ui/phone.html'],
  ['locales/en.json', 'locales/en.json'],
  ['locales/zh-CN.json', 'locales/zh-CN.json'],
  ['README.md', 'README.md'],
  ['LICENSE', 'LICENSE'],
];

for (const [, archivePath] of entries) {
  if (archivePath.startsWith('/') || archivePath.includes('..') || archivePath.includes('\\')) throw new Error(`Unsafe archive path: ${archivePath}`);
}
await mkdir(dirname(output), { recursive: true });
for (const [sourcePath] of entries) await stat(join(root, ...sourcePath.split('/')));

const zip = new ZipFile();
for (const [sourcePath, archivePath] of entries) zip.addFile(join(root, ...sourcePath.split('/')), archivePath);
const stream = createWriteStream(output);
zip.outputStream.pipe(stream);
zip.end();
await once(stream, 'close');
console.log(`Created ${relative(root, output).split(sep).join('/')}`);
