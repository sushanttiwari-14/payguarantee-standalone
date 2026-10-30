import { chmod, stat } from 'node:fs/promises';

// The Codex SDK launches this file directly. ZIP extractors can discard its
// executable bit, so a normal installation must restore it before first use.
if (process.platform !== 'win32') {
  const runner = new URL('../server/codex-runner.mjs', import.meta.url);
  const { mode } = await stat(runner);
  if (!(mode & 0o100)) await chmod(runner, (mode & 0o777) | 0o100);
}
