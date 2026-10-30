import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = new URL('..', import.meta.url);

test('judge command reproduces all controls and recorded decisions with network and child processes blocked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'payproof-judge-'));
  try {
    const guard = join(dir, 'offline.cjs');
    // tsx is initialized before this guard. Any later AI subprocess or network
    // request is a test failure, including one swallowed by application code.
    await writeFile(guard, `
      const deny = () => { process.stderr.write('OFFLINE GUARD: external call attempted\\n'); process.exit(97); };
      globalThis.fetch = deny;
      const cp = require('node:child_process');
      for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = deny;
      require('node:net').Socket.prototype.connect = deny;
      require('node:tls').connect = deny;
      require('node:module').syncBuiltinESMExports();
    `);
    const out = join(dir, 'proof');
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', guard, 'scripts/judge-check.ts', '--out', out], { cwd, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /JUDGE CHECK PASSED/);
    assert.match(result.stdout, /Historical model\/thread claims remain unauthenticated/);
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
    assert.equal(report.source.inputIntegrity, 'verified');
    assert.equal(report.outcomes.seeded.excessCents, 500);
    assert.equal(report.outcomes.refusal.legitimateCompleted, 0);
    assert.equal(report.outcomes['recorded-replay'].passed, 2);
    const replay = JSON.parse(await readFile(join(out, 'recorded-replay.json'), 'utf8'));
    assert.equal(replay.run.provider, 'simulator');
    assert.equal(replay.run.replay.sourceOrigin.kind, 'imported-evidence');
    assert.equal(replay.run.replay.decisions, 'reused');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('judge command rejects modified saved inputs before writing a success report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'payproof-judge-altered-'));
  try {
    const evidence = JSON.parse(await readFile(new URL('../examples/recorded-codex-proof.json', import.meta.url), 'utf8'));
    evidence.run.results[0].scenario.message += ' Changed after recording.';
    const source = join(dir, 'altered.json'), out = join(dir, 'proof');
    await writeFile(source, JSON.stringify(evidence));
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/judge-check.ts', '--recorded', source, '--out', out], { cwd, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Recorded input digest does not match/);
    assert.doesNotMatch(result.stdout, /JUDGE CHECK PASSED/);
    await assert.rejects(stat(out), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
