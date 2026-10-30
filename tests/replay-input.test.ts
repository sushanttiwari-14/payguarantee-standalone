import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReplaySource } from '../server/replay-input.ts';
import { createAgentInput, createEvaluationExport } from '../server/decision-bundle.ts';
import { executeScenario, makeRun } from '../server/engine.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';

async function source() {
  const scenario = structuredClone(curatedScenarios.find(item => item.id === 'under-limit')!);
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected' });
  const run = makeRun(defaultPolicy, 'corrected', 'simulator', [result]);
  run.provenance!.inputDigest = createAgentInput(run.policy, run.results.map(result => result.scenario)).inputDigest;
  return createEvaluationExport(run);
}

test('replay validates the recorded input binding without mutating its source', async () => {
  const document = await source();
  const before = structuredClone(document);
  const validated = validateReplaySource(document);
  assert.equal(validated.inputIntegrity, 'verified');
  assert.equal(validated.input.inputDigest, document.run.provenance!.inputDigest);
  assert.deepEqual(document, before);
  validated.run.results[0].scenario.message = 'Changed locally';
  assert.deepEqual(document, before);
});

test('changed policy or scenario facts reject against the original digest', async () => {
  const original = await source();
  for (const mutate of [
    (document: typeof original) => { document.run.results[0].scenario.capturedCents = 20000; },
    (document: typeof original) => { document.run.results[0].scenario.message = 'A different customer request.'; },
    (document: typeof original) => { document.run.results[0].scenario.priorRefundCents = 500; },
    (document: typeof original) => { document.run.policy.limitCents = 3000; },
    (document: typeof original) => { document.run.policy.version = 2; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.throws(() => validateReplaySource(changed), /digest does not match/);
  }
});

test('legacy absence is explicit, while malformed recorded digests are rejected', async () => {
  const document = await source();
  delete document.run.provenance!.inputDigest;
  assert.equal(validateReplaySource(document).inputIntegrity, 'unverified-legacy');
  delete document.run.provenance;
  assert.equal(validateReplaySource(document).inputIntegrity, 'unverified-legacy');
  for (const inputDigest of ['', 'historical-digest', 'sha256:short', null, 5]) {
    const changed = await source();
    Object.assign(changed.run.provenance!, { inputDigest });
    assert.throws(() => validateReplaySource(changed), /digest is malformed/);
  }
});

test('duplicate case/scenario identities and more than twenty cases reject before evaluation', async () => {
  const document = await source();
  const original = document.run.results[0];
  document.run.results.push(structuredClone(original));
  assert.throws(() => validateReplaySource(document), /duplicate case result IDs/);
  document.run.results[1].id = 'second-result';
  assert.throws(() => validateReplaySource(document), /duplicate scenario IDs/);
  document.run.results = Array.from({ length: 21 }, (_, index) => ({ ...structuredClone(original), id: `result-${index}`, scenario: { ...structuredClone(original.scenario), id: `case-${index}` } }));
  assert.throws(() => validateReplaySource(document), /1–20 recorded cases/);
});

test('malformed source identities and unapproved or out-of-range inputs reject', async () => {
  for (const mutate of [
    (document: Awaited<ReturnType<typeof source>>) => { document.run.id = ''; },
    (document: Awaited<ReturnType<typeof source>>) => { document.run.createdAt = 'not-a-date'; },
    (document: Awaited<ReturnType<typeof source>>) => { document.run.results[0].scenario.approved = false; },
    (document: Awaited<ReturnType<typeof source>>) => { document.run.results[0].scenario.capturedCents = 100001; },
    (document: Awaited<ReturnType<typeof source>>) => { document.run.results[0].scenario.message = 'x'.repeat(4001); },
  ]) {
    const document = await source(); mutate(document);
    assert.throws(() => validateReplaySource(document));
  }
});
