import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';
import { createAgentInput, createEvaluationExport } from '../server/decision-bundle.ts';
import { executeScenario, makeRun, VERIFIER_VERSION } from '../server/engine.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const invoke = (script: string, args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', `scripts/${script}.ts`, ...args], { cwd: root, encoding: 'utf8', timeout: 15000 });

test('offline evaluation exits distinctly for pass, fail, and inconclusive and exports the same run envelope', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-evaluate-'));
  try {
    for (const [id, action, amountCents, code] of [['under-limit','refund',1000,0], ['under-limit','escalate',0,1], ['pending-refund','refund',1000,2]] as const) {
      const input = createAgentInput(defaultPolicy, [curatedScenarios.find(s => s.id === id)!]);
      const bundle = { schemaVersion: 1, inputDigest: input.inputDigest, agent: { name: 'CI agent', version: 'commit-abc' }, decisions: [{ scenarioId: id, action, amountCents, reason: 'Test proposal.', customerMessage: action === 'refund' ? 'I will attempt the refund.' : 'I will escalate this request.' }] };
      const inputFile = path.join(dir, 'input.json'), decisionsFile = path.join(dir, 'decisions.json'), outputFile = path.join(dir, 'out.json');
      await writeFile(inputFile, JSON.stringify(input)); await writeFile(decisionsFile, JSON.stringify(bundle));
      const result = invoke('evaluate', [inputFile, decisionsFile, '--out', outputFile]);
      assert.equal(result.status, code, result.stderr || result.stdout);
      const document = JSON.parse(await readFile(outputFile, 'utf8'));
      assert.equal(document.schemaVersion, 1);
      assert.equal(document.run.provider, 'simulator');
      assert.equal(document.run.agent, 'imported');
      assert.equal(document.run.provenance.verifierVersion, VERIFIER_VERSION);
      assert.deepEqual(document.run.importedAgent, bundle.agent);
      assert.equal(document.run.results[0].decision.customerMessage, bundle.decisions[0].customerMessage);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('default replay reuses recorded teaching decisions and current verification while an explicit override recomputes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-replay-'));
  try {
    const scenario = curatedScenarios.find(s => s.id === 'under-limit')!;
    const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'seeded' });
    const run = makeRun(defaultPolicy, 'seeded', 'simulator', [result]);
    run.results[0].decision = { action: 'escalate', amountCents: 0, reason: 'Recorded externally changed action.', customerMessage: 'I will escalate.' };
    run.provenance = { verifierVersion: 'old-verifier/0', agentVersion: 'recorded-agent/old' };
    const file = path.join(dir, 'original.json'), output = path.join(dir, 'replayed.json');
    await writeFile(file, JSON.stringify(createEvaluationExport(run)));
    const replay = invoke('replay', [file, '--out', output]);
    assert.equal(replay.status, 1, replay.stderr || replay.stdout);
    const document = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(document.run.results[0].decision, run.results[0].decision);
    assert.equal(document.run.provenance.verifierVersion, VERIFIER_VERSION);
    assert.equal(document.run.provenance.agentVersion, 'recorded-agent/old');
    assert.deepEqual(document.run.replay, { sourceRunId: run.id, sourceProvider: run.provider, sourceCreatedAt: run.createdAt, sourceAgent: run.agent, sourceProvenance: run.provenance, inputIntegrity: 'unverified-legacy', decisions: 'reused' });
    const overridden = invoke('replay', [file, 'corrected', '--out', output]);
    assert.equal(overridden.status, 0, overridden.stderr || overridden.stdout);
    const replacement = JSON.parse(await readFile(output, 'utf8')).run;
    assert.equal(replacement.results[0].decision.action, 'refund');
    assert.equal(replacement.replay.decisions, 'replaced');
    assert.equal(replacement.replay.replacementAgent, 'corrected');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('replaying a saved Codex and PayPal export retains source AI lineage without claiming a new AI or payment call', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-replay-lineage-'));
  try {
    // A controlled saved-run fixture; the replay must ignore its historical payment source.
    const scenario = curatedScenarios.find(s => s.id === 'under-limit')!;
    const decision = { action: 'refund' as const, amountCents: 1000, reason: 'Permitted in the saved model response.', customerMessage: 'I will request the $10 refund.' };
    const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'codex', decision });
    const run = makeRun(defaultPolicy, 'codex', 'simulator', [result]);
    run.id = 'saved-codex-paypal-run'; run.createdAt = '2026-10-09T10:00:00.000Z';
    run.provider = 'paypal';
    run.ai = { threadId: 'saved-real-codex-thread-id', model: 'saved-codex-model', usage: { input_tokens: 321, output_tokens: 45, cached_input_tokens: 12 } };
    run.provenance = { verifierVersion: 'historical-verifier/0.1', agentVersion: 'codex-prompt/old', inputDigest: createAgentInput(run.policy, run.results.map(result => result.scenario)).inputDigest };
    const file = path.join(dir, 'source.json'), output = path.join(dir, 'replay.json');
    const originalText = JSON.stringify(createEvaluationExport(run));
    await writeFile(file, originalText);
    const command = invoke('replay', [file, '--out', output]);
    assert.equal(command.status, 0, command.stderr || command.stdout);
    const replayed = JSON.parse(await readFile(output, 'utf8')).run;
    assert.equal(replayed.provider, 'simulator');
    assert.equal(replayed.ai, undefined);
    assert.deepEqual(replayed.replay.sourceAI, run.ai);
    assert.equal(replayed.replay.sourceRunId, run.id);
    assert.equal(replayed.replay.sourceProvider, 'paypal');
    assert.equal(replayed.replay.sourceCreatedAt, run.createdAt);
    assert.deepEqual(replayed.replay.sourceProvenance, run.provenance);
    assert.equal(replayed.replay.decisions, 'reused');
    assert.equal(replayed.replay.inputIntegrity, 'verified');
    assert.equal(replayed.replay.replacementAgent, undefined);
    assert.equal(replayed.provenance.verifierVersion, VERIFIER_VERSION);
    assert.deepEqual(replayed.results[0].decision, decision);
    assert.ok(replayed.results[0].refunds.every((refund: { source: string }) => refund.source === 'simulator'));
    assert.match(command.stdout, /saved-codex-paypal-run \(paypal,/);
    assert.match(command.stdout, /no PayPal or AI calls/);
    assert.equal(await readFile(file, 'utf8'), originalText);
    const second = path.join(dir, 'second-replay.json');
    assert.equal(invoke('replay', [output, '--out', second]).status, 0);
    const secondRun = JSON.parse(await readFile(second, 'utf8')).run;
    assert.deepEqual(secondRun.replay.sourceAI, run.ai);
    assert.equal(secondRun.replay.sourceRunId, replayed.id);
    assert.equal(secondRun.ai, undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('reusing imported decisions retains external identity while teaching overrides replace it explicitly', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-replay-import-'));
  try {
    const scenario = curatedScenarios.find(s => s.id === 'under-limit')!;
    const decision = { action: 'refund' as const, amountCents: 1000, reason: 'External policy result.', customerMessage: 'I will request the refund.' };
    const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'imported', decision });
    const run = makeRun(defaultPolicy, 'imported', 'simulator', [result]);
    run.importedAgent = { name: 'Merchant agent', version: 'commit-123' };
    run.provenance!.agentVersion = run.importedAgent.version;
    const file = path.join(dir, 'source.json'), output = path.join(dir, 'replay.json');
    await writeFile(file, JSON.stringify(createEvaluationExport(run)));
    assert.equal(invoke('replay', [file, '--out', output]).status, 0);
    const reused = JSON.parse(await readFile(output, 'utf8')).run;
    assert.deepEqual(reused.importedAgent, run.importedAgent);
    assert.equal(reused.replay.decisions, 'reused');
    assert.equal(invoke('replay', [file, 'corrected', '--out', output]).status, 0);
    const replaced = JSON.parse(await readFile(output, 'utf8')).run;
    assert.equal(replaced.agent, 'corrected');
    assert.equal(replaced.importedAgent, undefined);
    assert.equal(replaced.replay.decisions, 'replaced');
    assert.equal(replaced.replay.replacementAgent, 'corrected');
    assert.equal(replaced.ai, undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('replay refuses changed input digests and duplicate identities without producing a new evaluation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-replay-integrity-'));
  try {
    const scenario = structuredClone(curatedScenarios.find(item => item.id === 'under-limit')!);
    const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected' });
    const original = makeRun(defaultPolicy, 'corrected', 'simulator', [result]);
    original.provenance!.inputDigest = createAgentInput(original.policy, [scenario]).inputDigest;
    for (const mode of ['changed', 'duplicate', 'too-many'] as const) {
      const run = structuredClone(original);
      if (mode === 'changed') run.results[0].scenario.capturedCents = 20000;
      if (mode === 'duplicate') run.results.push({ ...structuredClone(result), id: 'second-result' });
      if (mode === 'too-many') run.results = Array.from({ length: 21 }, (_, index) => ({ ...structuredClone(result), id: `result-${index}`, scenario: { ...scenario, id: `scenario-${index}` } }));
      const input = path.join(dir, `${mode}.json`), output = path.join(dir, `${mode}-output.json`);
      await writeFile(input, JSON.stringify(createEvaluationExport(run)));
      for (const override of [[], ['corrected']]) {
        const command = invoke('replay', [input, ...override, '--out', output]);
        assert.equal(command.status, 1);
        assert.match(command.stderr, /digest does not match|duplicate scenario IDs|1–20 recorded cases/);
        assert.doesNotMatch(command.stdout, /LOCAL SIMULATOR REPLAY/);
        await assert.rejects(readFile(output), { code: 'ENOENT' });
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
