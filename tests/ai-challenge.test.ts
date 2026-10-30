import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiChallengeInputs } from '../shared/ai-challenge.ts';
import { challengeControls, summarizeChallenge } from '../server/ai-challenge.ts';
import { createAgentInput, createEvaluationExport } from '../server/decision-bundle.ts';
import { createAgentRequest } from '../server/agent-request.ts';
import { expectedActionFor, validateScenario } from '../server/engine.ts';

test('the fixed challenge has 20 reviewed cases, balanced boundaries and no evaluator labels in the agent view', () => {
  const { policy, scenarios } = aiChallengeInputs();
  assert.equal(scenarios.length, 20);
  assert.equal(new Set(scenarios.map(scenario => scenario.id)).size, 20);
  assert.equal(new Set(scenarios.map(scenario => scenario.category)).size, 5);
  for (const scenario of scenarios) {
    validateScenario(scenario, policy);
    assert.equal(scenario.expectedAction, expectedActionFor(scenario, policy), scenario.id);
    assert.equal(scenarios.filter(other => other.category === scenario.category).length, 4);
  }
  assert.equal(scenarios[1].requestedCents - scenarios[0].requestedCents, 1);
  assert.notEqual(scenarios[1].expectedAction, scenarios[0].expectedAction);
  assert.equal(scenarios[5].requestedCents - scenarios[4].requestedCents, 1);
  assert.notEqual(scenarios[5].expectedAction, scenarios[4].expectedAction);
  const request = createAgentRequest(createAgentInput(policy, scenarios));
  for (const item of request.scenarios) {
    assert.match(item.id, /^case_[a-f0-9]{64}$/);
    for (const label of ['title', 'category', 'fault', 'expectedAction', 'approved']) assert.equal(Object.hasOwn(item, label), false);
  }
  scenarios[0].requestedCents = 123;
  assert.equal(aiChallengeInputs().scenarios[0].requestedCents, 625, 'callers cannot mutate the fixed fixture');
});

test('controls expose seeded failures, lost legitimate refunds and two deliberately incomplete payment outcomes', async () => {
  const runs = await challengeControls();
  const report = summarizeChallenge(runs);
  assert.equal(report.outcomes.corrected.passed, 18);
  assert.equal(report.outcomes.corrected.failed, 0);
  assert.equal(report.outcomes.corrected.inconclusive, 2);
  assert.equal(report.outcomes.corrected.paymentEvidenceComplete, false);
  assert.equal(report.outcomes.refusal.legitimatePassed, 0);
  assert.ok(report.outcomes.refusal.legitimateTotal > 0);
  assert.ok(report.outcomes.seeded.failed > 0);
  assert.equal(report.outcomes.corrected.cases.filter(result => result.excessCents === null).length, 2);
  const altered = structuredClone(runs.corrected);
  altered.results[0].scenario.message += ' changed';
  assert.throws(() => summarizeChallenge({ altered }), /do not match/);
});

test('challenge replay runs offline, retains failures and never turns unknown payment evidence into zero excess', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'payproof-challenge-'));
  try {
    const runs = await challengeControls();
    const recorded = structuredClone(runs.seeded);
    recorded.agent = 'codex';
    recorded.ai = { model: 'Controlled test fixture; not a real model', threadId: 'test-only' };
    const source = join(dir, 'recorded.json'), out = join(dir, 'report');
    await writeFile(source, JSON.stringify(createEvaluationExport(recorded)));
    const guard = join(dir, 'offline.cjs');
    await writeFile(guard, `
      const deny = () => { process.stderr.write('Unexpected external call\\n'); process.exit(97); };
      globalThis.fetch = deny;
      const cp = require('node:child_process');
      for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = deny;
      require('node:net').Socket.prototype.connect = deny;
      require('node:tls').connect = deny;
      require('node:module').syncBuiltinESMExports();
    `);
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', guard, 'scripts/challenge.ts', '--recorded', source, '--out', out], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /not that every case passed/);
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
    assert.equal(report.mode, 'recorded-replay');
    assert.match(report.provenance, /unauthenticated/);
    assert.equal(report.outcomes.candidate.cases.length, 20);
    assert.ok(report.outcomes.candidate.failed > 0);
    assert.equal(report.outcomes.candidate.cases.filter((row: { excessCents: number | null }) => row.excessCents === null).length, 2);
    const replay = JSON.parse(await readFile(join(out, 'recorded-replay.json'), 'utf8'));
    assert.equal(replay.run.replay.sourceOrigin.kind, 'imported-evidence');
    assert.deepEqual(replay.run.results.map((row: { decision: unknown }) => row.decision), recorded.results.map(row => row.decision));
    const altered = createEvaluationExport(recorded);
    altered.run.results[0].scenario.requestedCents++;
    const invalid = join(dir, 'invalid.json'), invalidOut = join(dir, 'invalid-report');
    await writeFile(invalid, JSON.stringify(altered));
    const rejected = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/challenge.ts', '--recorded', invalid, '--out', invalidOut], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000 });
    assert.equal(rejected.status, 1);
    await assert.rejects(stat(invalidOut), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
