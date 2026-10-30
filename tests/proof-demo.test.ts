import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProofDemo } from '../server/proof-demo.ts';
import { proofLocation, summarizeProof } from '../shared/proof-demo.ts';
import { createEvaluationExport } from '../server/decision-bundle.ts';
import { replayEvidence } from '../server/replay.ts';

test('three controls catch over-refunding and blanket refusal while preserving the legitimate refund', async () => {
  const proof = await createProofDemo();
  assert.deepEqual(proof.baseline.summary, { total: 2, passed: 1, failed: 1, inconclusive: 0, excessCents: 500, legitimateCompleted: 1, legitimateTotal: 1 });
  assert.equal(proof.refusal.summary.failed, 1);
  assert.equal(proof.refusal.summary.excessCents, 0);
  assert.equal(proof.refusal.summary.legitimateCompleted, 0);
  assert.equal(proof.candidate.status, 'passed');
  assert.equal(proof.candidate.summary.legitimateCompleted, 1);
  assert.deepEqual(summarizeProof(proof), { comparable: true, reasons: [], fixed: 1, regressed: 0, legitimateCompleted: 1, legitimateTotal: 1, paymentConfirmed: true, passed: true });
  assert.equal(new Set(Object.values(proof).map(run => run.provenance?.inputDigest)).size, 1);
  for (const run of Object.values(proof)) {
    assert.equal(run.provider, 'simulator'); assert.equal(run.ai, undefined);
    const replay = await replayEvidence(createEvaluationExport(run));
    assert.deepEqual(replay.summary, run.summary);
  }
});

test('different inputs, imported claims or incomplete money evidence cannot produce a green proof', async () => {
  for (const mutate of [
    (proof: Awaited<ReturnType<typeof createProofDemo>>) => { proof.candidate.policy.limitCents++; },
    (proof: Awaited<ReturnType<typeof createProofDemo>>) => { proof.candidate.origin = { kind: 'imported-evidence', sourceRunId: 'claim', importedAt: new Date().toISOString() }; },
    (proof: Awaited<ReturnType<typeof createProofDemo>>) => { proof.refusal.results[0].scenario.message += ' changed'; },
  ]) {
    const proof = await createProofDemo(); mutate(proof);
    const summary = summarizeProof(proof);
    assert.equal(summary.comparable, false); assert.equal(summary.fixed, null); assert.equal(summary.passed, false);
  }
  const proof = await createProofDemo();
  proof.candidate.results[1].evidenceComplete = false;
  assert.equal(summarizeProof(proof).passed, false);
  assert.equal(summarizeProof(proof).legitimateCompleted, 0);
});

test('saved proof links identify all three runs; every new comparison has separate evidence', async () => {
  const first = await createProofDemo(), second = await createProofDemo();
  const url = new URL(proofLocation(first), 'http://localhost');
  for (const key of ['baseline', 'candidate', 'refusal'] as const) {
    assert.equal(url.searchParams.get(key), first[key].id);
    assert.notEqual(first[key].id, second[key].id);
  }
});
