import test from 'node:test';
import assert from 'node:assert/strict';
import { importEvidence, validateEvidenceDocument } from '../server/evidence-import.ts';
import { replayEvidence } from '../server/replay.ts';
import { decisionPreflight } from '../server/decision-evidence.ts';
import { createAgentInput, createEvaluationExport } from '../server/decision-bundle.ts';
import { executeScenario, makeRun, VERIFIER_VERSION } from '../server/engine.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';
import { MAX_EVIDENCE_IMPORT_BYTES } from '../shared/limits.ts';
import type { Run } from '../shared/types.ts';

async function exported(ids = ['under-limit'], agent: 'seeded' | 'corrected' = 'corrected') {
  const scenarios = ids.map(id => structuredClone(curatedScenarios.find(s => s.id === id)!));
  const results = [];
  for (const scenario of scenarios) results.push(await executeScenario({ scenario, policy: defaultPolicy, agent }));
  const run = makeRun(defaultPolicy, agent, 'simulator', results);
  run.provenance!.inputDigest = createAgentInput(run.policy, scenarios).inputDigest;
  return createEvaluationExport(run);
}

test('full evidence validation accepts actual passing, failing, pending and unavailable exports without changing them', async () => {
  for (const agent of ['seeded', 'corrected'] as const) {
    const document = await exported(curatedScenarios.map(s => s.id), agent);
    const before = structuredClone(document);
    assert.deepEqual(validateEvidenceDocument(document), document.run);
    const imported = importEvidence(document);
    assert.notEqual(imported.id, document.run.id);
    assert.deepEqual(imported.results, document.run.results);
    assert.equal(imported.origin!.kind, 'imported-evidence');
    assert.equal(imported.origin!.sourceRunId, document.run.id);
    assert.deepEqual(document, before);
  }
});

test('legacy incomplete failures retain historical verdicts on import and fail under the new replay verifier', async () => {
  const scenario = { ...structuredClone(curatedScenarios.find(s => s.id === 'cumulative-over')!), fault: 'pending' as const };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'seeded' });
  assert.equal(result.verdict, 'fail');
  const current = makeRun(defaultPolicy, 'seeded', 'simulator', [result]);
  current.provenance!.inputDigest = createAgentInput(current.policy, [scenario]).inputDigest;
  assert.deepEqual(validateEvidenceDocument(createEvaluationExport(current)), current);
  const historical = structuredClone(current);
  historical.results[0].verdict = 'inconclusive';
  historical.status = 'inconclusive';
  historical.summary.failed = 0;
  historical.summary.inconclusive = 1;
  assert.throws(() => validateEvidenceDocument(createEvaluationExport(historical)), /verdict disagrees/);
  historical.provenance!.verifierVersion = 'payproof-refund-verifier/0.3.0';
  const imported = importEvidence(createEvaluationExport(historical));
  assert.equal(imported.status, 'inconclusive');
  assert.equal(imported.results[0].verdict, 'inconclusive');
  const replayed = await replayEvidence(createEvaluationExport(imported));
  assert.equal(replayed.provenance!.verifierVersion, VERIFIER_VERSION);
  assert.equal(replayed.status, 'failed');
  assert.equal(replayed.results[0].evidenceComplete, false);
  assert.equal(replayed.summary.failed, 1);
  assert.equal(replayed.replay!.sourceProvenance!.verifierVersion, 'payproof-refund-verifier/0.3.0');
  assert.deepEqual(validateEvidenceDocument(createEvaluationExport(replayed)), replayed);
  delete historical.provenance;
  assert.equal(importEvidence(createEvaluationExport(historical)).status, 'inconclusive');
});

test('malformed renderable case fields and contradictory payment/check/summary evidence are rejected', async () => {
  const original = await exported();
  const changes: [string, (document: any) => void][] = [
    ['unsupported envelope', d => { d.unrecognized = true; }],
    ['missing summary', d => { delete d.run.summary; }],
    ['extra run field', d => { d.run.runMe = 'payload'; }],
    ['bad money', d => { d.run.results[0].observedRefundCents = -1; }],
    ['fractional money', d => { d.run.results[0].attemptedCents = 0.5; }],
    ['unbounded duration', d => { d.run.results[0].durationMs = Number.MAX_SAFE_INTEGER; }],
    ['bad case status', d => { d.run.results[0].verdict = 'ready'; }],
    ['bad check status', d => { d.run.results[0].checks[0].status = 'passed'; }],
    ['unknown checks', d => { d.run.results[0].checks[0].status = 'unknown'; }],
    ['duplicate checks', d => { d.run.results[0].checks.push(d.run.results[0].checks[0]); }],
    ['missing checks', d => { d.run.results[0].checks = []; }],
    ['too many checks', d => { d.run.results[0].checks = Array(51).fill(d.run.results[0].checks[0]); }],
    ['empty event', d => { d.run.results[0].events.push({}); }],
    ['bad event time', d => { d.run.results[0].events[0].at = '2026'; }],
    ['bad event data', d => { d.run.results[0].events[0].data = []; }],
    ['too many events', d => { d.run.results[0].events = Array(101).fill(d.run.results[0].events[0]); }],
    ['malformed refund', d => { delete d.run.results[0].refunds[0].captureId; }],
    ['bad refund status', d => { d.run.results[0].refunds[0].status = 'APPROVED'; }],
    ['wrong currency', d => { d.run.results[0].refunds[0].currency = 'EUR'; }],
    ['wrong provider', d => { d.run.results[0].refunds[0].source = 'paypal'; }],
    ['duplicate refunds', d => { d.run.results[0].refunds.push(d.run.results[0].refunds[0]); }],
    ['too many refunds', d => { d.run.results[0].refunds = Array(41).fill(d.run.results[0].refunds[0]); }],
    ['pending marked complete', d => { d.run.results[0].refunds[0].status = 'PENDING'; }],
    ['wrong cumulative amount', d => { d.run.results[0].refunds[0].cumulativeRefundedCents = 1; }],
    ['wrong payment total', d => { d.run.results[0].totalRefundCents = 999; }],
    ['wrong observed total', d => { d.run.results[0].observedRefundCents = 999; }],
    ['wrong excess', d => { d.run.results[0].excessCents = 5; }],
    ['wrong summary', d => { d.run.summary.failed = 1; }],
    ['wrong run status', d => { d.run.status = 'inconclusive'; }],
    ['bad completion flag', d => { d.run.results[0].evidenceComplete = 'yes'; }],
    ['changed expected action', d => { d.run.results[0].expectedAction = 'escalate'; }],
    ['oversized decision text', d => { d.run.results[0].decision.customerMessage = 'x'.repeat(4001); }],
    ['extra decision field', d => { d.run.results[0].decision.newTool = 'refund'; }],
    ['extra scenario field', d => { d.run.results[0].scenario.extra = true; }],
    ['bad AI usage', d => { d.run.ai = { threadId: null, model: 'claimed', usage: { tokens: 'bad' } }; }],
    ['bad origin', d => { d.run.origin = { kind: 'verified-paypal', sourceRunId: 'fake', importedAt: d.run.createdAt }; }],
  ];
  for (const [label, mutate] of changes) {
    const document = structuredClone(original); mutate(document);
    assert.throws(() => validateEvidenceDocument(document), /./, label);
  }
});

test('input tampering, duplicate identities, oversized imports and maliciously deep data reject', async () => {
  const original = await exported();
  for (const change of [
    (d: any) => { d.run.results[0].scenario.message = 'Changed after the digest.'; },
    (d: any) => { d.run.results.push(structuredClone(d.run.results[0])); },
    (d: any) => { d.run.results.push({ ...structuredClone(d.run.results[0]), id: 'other' }); },
    (d: any) => { d.run.results = Array.from({ length: 21 }, (_, index) => ({ ...structuredClone(d.run.results[0]), id: `result-${index}`, scenario: { ...d.run.results[0].scenario, id: `scenario-${index}` } })); },
    (d: any) => { d.scope = 'x'.repeat(1_000_001); },
    (d: any) => { d.run.results[0].events[0].data = Array.from({ length: 14 }).reduce<unknown>(value => ({ next: value }), 'deep'); },
  ]) {
    const document = structuredClone(original); change(document); assert.throws(() => importEvidence(document));
  }
});

test('rejected decision evidence remains importable and replays the exact submitted invalid answer', async () => {
  const scenarios = structuredClone(curatedScenarios.slice(0, 2));
  const submitted = { action: 'escalate', amountCents: 1000, reason: 'Invalid action contract.', customerMessage: 'I will escalate.' };
  const decisions = new Map(scenarios.map(s => [s.id, submitted]));
  const run = makeRun(defaultPolicy, 'codex', 'simulator', decisionPreflight(scenarios, defaultPolicy, decisions)!);
  run.ai = { threadId: 'declared-thread', model: 'declared-model' };
  run.provenance!.inputDigest = createAgentInput(run.policy, scenarios).inputDigest;
  const imported = importEvidence(createEvaluationExport(run));
  const replayed = await replayEvidence(createEvaluationExport(imported));
  assert.deepEqual(replayed.results.map(r => r.submittedDecision), [submitted, submitted]);
  assert.equal(replayed.summary.failed, 2);
  assert.ok(replayed.results.every(r => r.refunds.length === 0 && r.attemptedCents === 0));
  assert.deepEqual(validateEvidenceDocument(createEvaluationExport(replayed)), replayed);
});

test('imported provider/AI claims remain external lineage across repeated local simulator replays', async () => {
  const document = await exported();
  // A file may declare sandbox evidence; syntax validation cannot authenticate its source.
  const run = document.run;
  run.provider = 'paypal'; run.agent = 'codex'; run.ai = { threadId: 'file-claimed-thread', model: 'file-claimed-model', usage: { input_tokens: 12 } };
  for (const result of run.results) {
    result.refunds.forEach(refund => { refund.source = 'paypal'; });
    result.events.find(event => event.kind === 'environment')!.data!.provider = 'paypal';
  }
  const imported = importEvidence(document);
  assert.equal(imported.provider, 'paypal');
  assert.deepEqual(imported.ai, run.ai);
  const before = structuredClone(imported);
  const first = await replayEvidence(createEvaluationExport(imported));
  const second = await replayEvidence(createEvaluationExport(first));
  assert.deepEqual(imported, before);
  assert.equal(first.provider, 'simulator'); assert.equal(first.ai, undefined); assert.equal(first.origin, undefined);
  assert.equal(first.provenance!.verifierVersion, VERIFIER_VERSION);
  assert.equal(first.replay!.sourceProvider, 'paypal'); assert.deepEqual(first.replay!.sourceOrigin, imported.origin);
  assert.deepEqual(first.replay!.sourceAI, run.ai); assert.deepEqual(first.replay!.sourceProvenance, run.provenance);
  assert.deepEqual(first.results[0].decision, imported.results[0].decision);
  assert.deepEqual(second.replay!.sourceReplay, first.replay);
  assert.deepEqual(second.replay!.sourceAI, run.ai);
  assert.deepEqual(validateEvidenceDocument(createEvaluationExport(second)), second);
});

test('legacy evidence remains explicitly unverified; invented verified replay metadata is rejected', async () => {
  const document = await exported(); delete document.run.provenance;
  const imported = importEvidence(document);
  const replayed = await replayEvidence(createEvaluationExport(imported));
  assert.equal(replayed.replay!.inputIntegrity, 'unverified-legacy');
  assert.deepEqual(validateEvidenceDocument(createEvaluationExport(replayed)), replayed);
  replayed.replay!.inputIntegrity = 'verified';
  assert.throws(() => validateEvidenceDocument(createEvaluationExport(replayed)), /missing its source digest/);
});

test('thirty replay generations export and import without dropping ancestry while deep invalid ancestors still reject', async () => {
  let current = importEvidence(await exported());
  const importedOrigin = structuredClone(current.origin);
  const ancestors: string[] = [];
  for (let index = 0; index < 30; index++) {
    ancestors.unshift(current.id);
    current = await replayEvidence(createEvaluationExport(current));
  }
  const document = createEvaluationExport(current);
  const serialized = JSON.stringify(document);
  assert.ok(Buffer.byteLength(serialized, 'utf8') < MAX_EVIDENCE_IMPORT_BYTES);
  const restored = importEvidence(JSON.parse(serialized));
  assert.deepEqual(restored.replay, current.replay);
  const restoredIds: string[] = [];
  let oldest: Run['replay'];
  for (let ancestor = restored.replay; ancestor; ancestor = ancestor.sourceReplay) {
    restoredIds.push(ancestor.sourceRunId); oldest = ancestor;
  }
  assert.deepEqual(restoredIds, ancestors);
  assert.deepEqual(oldest!.sourceOrigin, importedOrigin);
  assert.equal(restored.origin!.sourceRunId, current.id);
  oldest!.sourceProvider = 'invalid' as Run['provider'];
  assert.throws(() => importEvidence(createEvaluationExport(restored)), /Replay source provider is unsupported/);
  const cyclic = structuredClone(document);
  cyclic.run.replay!.sourceReplay = cyclic.run.replay;
  assert.throws(() => importEvidence(cyclic), /serializable JSON/);
});
