import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createAgentInput, validateDecisionBundle } from '../server/decision-bundle.ts';
import { createAgentRequest } from '../server/agent-request.ts';
import { decisionPreflight } from '../server/decision-evidence.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';

test('external example escalates a zero request without invalidating the legitimate decision in its batch', async () => {
  const scenarios = [structuredClone(curatedScenarios[0]), { ...curatedScenarios[0], id: 'zero-request', requestedCents: 0, expectedAction: 'escalate' as const }];
  const input = createAgentInput(defaultPolicy, scenarios);
  const dir = await mkdtemp(join(tmpdir(), 'payproof-external-zero-'));
  try {
    const file = join(dir, 'input.json'); await writeFile(file, JSON.stringify(input));
    const result = spawnSync(process.execPath, ['examples/external-agent.mjs', file], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    const parsed = validateDecisionBundle(JSON.parse(result.stdout), input);
    assert.equal(parsed.decisions.get('zero-request')?.action, 'escalate');
    assert.equal(parsed.decisions.get(scenarios[0].id)?.action, 'refund');
    assert.equal(decisionPreflight(scenarios, defaultPolicy, parsed.decisions), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('schema-2 reference agent and CLI evaluate/replay round trip retain schema-1 evidence and source identities', async () => {
  const scenarios = curatedScenarios.slice(0, 2);
  const fixture = createAgentInput(defaultPolicy, scenarios);
  const request = createAgentRequest(fixture);
  const dir = await mkdtemp(join(tmpdir(), 'payproof-external-v2-'));
  const cwd = new URL('..', import.meta.url);
  try {
    const fixtureFile = join(dir, 'fixture.json'), requestFile = join(dir, 'request.json');
    const decisionsFile = join(dir, 'decisions.json'), evidenceFile = join(dir, 'evidence.json'), replayFile = join(dir, 'replay.json');
    await writeFile(fixtureFile, JSON.stringify(fixture));
    await writeFile(requestFile, JSON.stringify(request));
    const agent = spawnSync(process.execPath, ['examples/external-agent.mjs', requestFile], { cwd, encoding: 'utf8', timeout: 5000 });
    assert.equal(agent.status, 0, agent.stderr);
    const bundle = JSON.parse(agent.stdout);
    assert.equal(bundle.schemaVersion, 2);
    assert.deepEqual(bundle.decisions.map((d: {scenarioId:string}) => d.scenarioId), request.scenarios.map(s => s.id));
    assert.deepEqual([...validateDecisionBundle(bundle, fixture).decisions.keys()], scenarios.map(s => s.id));
    await writeFile(decisionsFile, agent.stdout);
    const evaluation = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate.ts', fixtureFile, decisionsFile, '--out', evidenceFile], { cwd, encoding: 'utf8', timeout: 10000 });
    assert.equal(evaluation.status, 0, evaluation.stderr);
    const evidence = JSON.parse(await readFile(evidenceFile, 'utf8'));
    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.run.status, 'passed');
    assert.equal(evidence.run.provenance.inputDigest, fixture.inputDigest);
    assert.deepEqual(evidence.run.results.map((r: {scenario:{id:string}}) => r.scenario.id), scenarios.map(s => s.id));
    const replay = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/replay.ts', evidenceFile, '--out', replayFile], { cwd, encoding: 'utf8', timeout: 10000 });
    assert.equal(replay.status, 0, replay.stderr);
    const replayed = JSON.parse(await readFile(replayFile, 'utf8'));
    assert.equal(replayed.schemaVersion, 1);
    assert.equal(replayed.run.status, 'passed');
    assert.equal(replayed.run.replay.inputIntegrity, 'verified');
    const rejectedRequest = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate.ts', requestFile, decisionsFile], { cwd, encoding: 'utf8', timeout: 10000 });
    assert.equal(rejectedRequest.status, 1);
    assert.match(rejectedRequest.stderr, /Unsupported agent input schemaVersion/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
