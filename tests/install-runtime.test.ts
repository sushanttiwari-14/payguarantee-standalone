import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('installation repairs an extracted Codex launcher without making a model call', { skip: process.platform === 'win32' }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const extracted = await mkdtemp(join(tmpdir(), 'payproof-install-'));
  try {
    await mkdir(join(extracted, 'scripts'));
    await mkdir(join(extracted, 'server'));
    await copyFile(join(root, 'package.json'), join(extracted, 'package.json'));
    await copyFile(join(root, 'scripts/prepare-runtime.mjs'), join(extracted, 'scripts/prepare-runtime.mjs'));
    const runner = join(extracted, 'server/codex-runner.mjs');
    await copyFile(join(root, 'server/codex-runner.mjs'), runner);
    await chmod(runner, 0o644); // Reproduce extraction that discarded Unix permissions.
    await symlink(join(root, 'node_modules'), join(extracted, 'node_modules'), 'dir');
    const launch = () => spawnSync(runner, ['--unsupported-launch-check'], { cwd: extracted, encoding: 'utf8', timeout: 5000 });
    const before = launch();
    assert.ok(before.error && 'code' in before.error);
    assert.equal(before.error.code, 'EACCES');

    const install = spawnSync('npm', ['run', 'postinstall', '--silent'], { cwd: extracted, encoding: 'utf8', timeout: 10000 });
    assert.equal(install.status, 0, install.stderr || install.error?.message);
    const result = launch();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stderr, 'Only Codex exec is supported.\n');
    assert.equal(result.stdout, '');
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
});
