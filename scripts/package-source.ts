import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const files: Record<string, Uint8Array> = {};
const fixedFiles = ['.env.example', '.gitignore', '.github/workflows/verify.yml', 'README.md', 'LICENSE', 'package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.ts', 'presentation/README.md', 'presentation/NOTICE.md', 'presentation/narration.json', 'presentation/package.json', 'presentation/package-lock.json', 'presentation/tsconfig.json', 'presentation/remotion.config.ts', 'presentation/eslint.config.mjs'];
const sourceDirectories = ['src', 'server', 'shared', 'adapters', 'scripts', 'tests', 'docs', 'public', 'examples', 'presentation/src', 'presentation/public', 'presentation/scripts'];

async function addFile(path: string) {
  const name = relative(root, path).split('\\').join('/');
  files[`payproof/${name}`] = await readFile(path);
}
async function addDirectory(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    // Never follow symlinks, hidden files, or environment files into the bundle.
    if (entry.name.startsWith('.') || entry.name.endsWith('.env')) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) await addDirectory(child);
    else if (entry.isFile()) await addFile(child);
  }
}

for (const file of fixedFiles) await addFile(join(root, file));
for (const directory of sourceDirectories) await addDirectory(join(root, directory));
await mkdir(join(root, 'artifacts'), { recursive: true });
await writeFile(join(root, 'artifacts/payproof-source.zip'), zipSync(files, { level: 6 }));
console.log(`Created artifacts/payproof-source.zip with ${Object.keys(files).length} source files. Runtime data and credentials are excluded.`);
