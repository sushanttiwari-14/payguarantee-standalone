import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentInput, createEvaluationExport, validateAgentInput, validateDecisionBundle } from '../server/decision-bundle.ts';
import { decisionPreflight } from '../server/decision-evidence.ts';
import { executeScenario, makeRun } from '../server/engine.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';

const selection = () => structuredClone(curatedScenarios.slice(0, 2));
const input = () => createAgentInput(structuredClone(defaultPolicy), selection());
const bundle = (agentInput = input()) => ({
  schemaVersion: 1,
  inputDigest: agentInput.inputDigest,
  agent: { name: 'External support agent', version: '2026.10.09' },
  decisions: agentInput.scenarios.map(scenario => ({
    scenarioId: scenario.id,
    action: 'escalate',
    amountCents: 0,
    reason: 'Needs human review.',
    customerMessage: 'I will request a review.',
  })),
});

test('agent input exports payment facts without expectations, revealing labels, or review metadata', () => {
  const scenarios = selection();
  scenarios[0].generation = { threadId: 'private-thread', model: 'model-name', createdAt: '2026-10-09', policyVersion: 1 };
  const exported = createAgentInput(defaultPolicy, scenarios);
  assert.deepEqual(Object.keys(exported).sort(), ['inputDigest', 'policy', 'scenarios', 'schemaVersion']);
  assert.equal(exported.schemaVersion, 1);
  assert.match(exported.inputDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(exported.policy, defaultPolicy);
  for (const scenario of exported.scenarios) {
    assert.deepEqual(Object.keys(scenario).sort(), [
      'capturedCents', 'fault', 'id', 'message', 'priorRefundCents', 'requestedCents', 'supervisorApproved',
    ]);
    const source = scenarios.find(item => item.id === scenario.id)!;
    assert.equal(scenario.message, source.message);
    assert.equal(scenario.requestedCents, source.requestedCents);
  }
  assert.equal(validateAgentInput(JSON.parse(JSON.stringify(exported))).inputDigest, exported.inputDigest);
});

test('input digest is stable across scenario and object-key order, but binds policy and input facts', () => {
  const scenarios = selection();
  const original = createAgentInput(defaultPolicy, scenarios);
  const reversedPolicy = Object.fromEntries(Object.entries(defaultPolicy).reverse()) as typeof defaultPolicy;
  const reordered = createAgentInput(reversedPolicy, [...scenarios].reverse());
  assert.equal(reordered.inputDigest, original.inputDigest);
  const reorderedDocument = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(validateAgentInput(reorderedDocument).inputDigest, original.inputDigest);
  const changedMessage = structuredClone(scenarios);
  changedMessage[0].message += ' Please respond in plain language.';
  assert.notEqual(createAgentInput(defaultPolicy, changedMessage).inputDigest, original.inputDigest);
  assert.notEqual(createAgentInput({ ...defaultPolicy, limitCents: 1900 }, scenarios).inputDigest, original.inputDigest);
  const changedAmount = structuredClone(scenarios);
  changedAmount[0].requestedCents += 1;
  assert.notEqual(createAgentInput(defaultPolicy, changedAmount).inputDigest, original.inputDigest);
  const changedLabels = scenarios.map(scenario => ({ ...scenario, title: 'Neutral title', category: 'Other', approved: false }));
  assert.equal(createAgentInput(defaultPolicy, changedLabels).inputDigest, original.inputDigest);
});

test('agent input rejects stale digests and unknown fields at every level', () => {
  const original = input();
  const changed = structuredClone(original);
  changed.scenarios[0].message += ' Changed after export.';
  assert.throws(() => validateAgentInput(changed));
  for (const candidate of [
    { ...original, unexpected: true },
    { ...original, policy: { ...original.policy, expectedAction: 'refund' } },
    { ...original, scenarios: original.scenarios.map((scenario, index) => index ? scenario : { ...scenario, expectedAction: 'refund' }) },
    { ...original, scenarios: original.scenarios.map((scenario, index) => index ? scenario : { ...scenario, title: '$5 allowed' }) },
    { ...original, scenarios: original.scenarios.map((scenario, index) => index ? scenario : { ...scenario, category: 'Approved' }) },
    { ...original, schemaVersion: 2 },
    { ...original, inputDigest: original.inputDigest.slice('sha256:'.length) },
  ]) assert.throws(() => validateAgentInput(candidate));
});

test('agent input rejects invalid facts and limits even when generated with a fresh digest', () => {
  for (const patch of [
    { capturedCents: -1 }, { priorRefundCents: 10001 }, { requestedCents: 100001 },
    { requestedCents: 1.5 }, { supervisorApproved: 'true' }, { fault: 'unexpected' },
    { id: '' }, { message: '' }, { message: 'a'.repeat(4001) },
  ]) {
    const scenarios = selection();
    Object.assign(scenarios[0], patch);
    assert.throws(() => createAgentInput(defaultPolicy, scenarios), JSON.stringify(patch));
  }
  for (const patch of [{ currency: 'EUR' }, { version: 0 }, { limitCents: 100001 }, { name: '' }]) {
    const policy = structuredClone(defaultPolicy);
    Object.assign(policy, patch);
    assert.throws(() => createAgentInput(policy, selection()), JSON.stringify(patch));
  }
  assert.throws(() => createAgentInput(defaultPolicy, []));
  assert.throws(() => createAgentInput(defaultPolicy, [selection()[0], selection()[0]]));
  const twenty = Array.from({ length: 20 }, (_, index) => ({ ...selection()[0], id: `case-${index}` }));
  assert.equal(createAgentInput(defaultPolicy, twenty).scenarios.length, 20);
  assert.throws(() => createAgentInput(defaultPolicy, [...twenty, { ...twenty[0], id: 'case-20' }]));
});

test('a complete matching decision bundle returns agent provenance and decisions keyed by scenario', () => {
  const agentInput = input();
  const submitted = bundle(agentInput);
  submitted.decisions.reverse();
  const accepted = validateDecisionBundle(JSON.parse(JSON.stringify(submitted)), agentInput);
  assert.deepEqual(accepted.agent, submitted.agent);
  assert.ok(accepted.decisions instanceof Map);
  assert.equal(accepted.decisions.size, agentInput.scenarios.length);
  for (const { scenarioId, ...decision } of submitted.decisions) {
    assert.deepEqual(accepted.decisions.get(scenarioId), decision);
  }
});

test('decision bundles reject stale digests and duplicate, missing, or unselected scenario IDs', () => {
  const agentInput = input();
  const submitted = bundle(agentInput);
  for (const candidate of [
    { ...submitted, inputDigest: createAgentInput({ ...defaultPolicy, limitCents: 1900 }, selection()).inputDigest },
    { ...submitted, decisions: [submitted.decisions[0], submitted.decisions[0]] },
    { ...submitted, decisions: submitted.decisions.slice(1) },
    { ...submitted, decisions: [] },
    { ...submitted, decisions: [...submitted.decisions, { ...submitted.decisions[0], scenarioId: 'not-selected' }] },
    { ...submitted, decisions: [{ ...submitted.decisions[0], scenarioId: 'not-selected' }, submitted.decisions[1]] },
  ]) assert.throws(() => validateDecisionBundle(candidate, agentInput));
});

test('decision bundle envelopes reject unknown keys, invalid types, and out-of-range amounts', () => {
  const agentInput = input();
  const submitted = bundle(agentInput);
  for (const candidate of [
    null,
    [],
    { ...submitted, schemaVersion: '1' },
    { ...submitted, unexpected: true },
    { ...submitted, agent: { ...submitted.agent, model: 'undeclared' } },
    { ...submitted, agent: { ...submitted.agent, name: '' } },
    { ...submitted, agent: { ...submitted.agent, name: 'a'.repeat(101) } },
    { ...submitted, agent: { ...submitted.agent, version: 3 } },
    { ...submitted, decisions: null },
  ]) assert.throws(() => validateDecisionBundle(candidate, agentInput));
  for (const patch of [
    { unexpected: true }, { action: 'transfer' }, { scenarioId: 4 }, { amountCents: '1000' },
    { amountCents: -1 }, { amountCents: 0.5 }, { amountCents: 100001 }, { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { amountCents: NaN }, { amountCents: Infinity }, { reason: null }, { customerMessage: false },
    { reason: '' }, { customerMessage: 'a'.repeat(4001) },
  ]) {
    const candidate = { ...submitted, decisions: [{ ...submitted.decisions[0], ...patch }, submitted.decisions[1]] };
    assert.throws(() => validateDecisionBundle(candidate, agentInput), JSON.stringify(patch));
  }
});

test('semantic action mistakes survive envelope validation and are retained as failed preflight evidence', () => {
  const agentInput = input();
  const submitted = bundle(agentInput);
  submitted.decisions[0].amountCents = 1000;
  const accepted = validateDecisionBundle(submitted, agentInput);
  assert.equal(accepted.decisions.get(submitted.decisions[0].scenarioId)?.amountCents, 1000);
  const results = decisionPreflight(selection(), defaultPolicy, accepted.decisions);
  assert.ok(results);
  const invalid = results.find(result => result.scenario.id === submitted.decisions[0].scenarioId)!;
  assert.equal(invalid.verdict, 'fail');
  assert.equal(invalid.decisionValid, false);
  const { scenarioId: _scenarioId, ...decision } = submitted.decisions[0];
  assert.deepEqual(invalid.submittedDecision, decision);
  assert.ok(results.every(result => result.attemptedCents === 0 && result.refunds.length === 0));
});

test('evaluation export preserves the complete run evidence in a versioned replay document', async () => {
  const result = await executeScenario({ scenario: selection()[0], policy: defaultPolicy, agent: 'corrected' });
  const run = makeRun(defaultPolicy, 'corrected', 'simulator', [result]);
  const document = createEvaluationExport(run);
  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(document)).run, run);
  assert.ok(Number.isFinite(Date.parse(document.exportedAt)));
  assert.match(document.replay, /npm run replay/);
  assert.match(document.scope, /not production certification/i);
});

test('large valid bundles preserve full Unicode and JSON-escaped decision text', () => {
  const scenarios = Array.from({ length: 20 }, (_, index) => ({ ...selection()[0], id: `large-case-${index}` }));
  const agentInput = createAgentInput(defaultPolicy, scenarios);
  for (const content of ['界'.repeat(4000), '\u0000'.repeat(4000)]) {
    const submitted = bundle(agentInput);
    for (const decision of submitted.decisions) { decision.reason = content; decision.customerMessage = content; }
    const serialized = JSON.stringify(submitted);
    assert.ok(serialized.length > 60_000, 'the old textarea limit could not hold this valid contract');
    assert.ok(Buffer.byteLength(serialized, 'utf8') <= 1_000_000, 'maximum-length schema fields fit the shared bundle budget');
    const accepted = validateDecisionBundle(JSON.parse(serialized), agentInput);
    assert.equal(accepted.decisions.size, 20);
    for (const decision of accepted.decisions.values()) {
      assert.equal(decision.reason, content);
      assert.equal(decision.customerMessage, content);
    }
  }
});

test('offline bundle byte limits count serialized UTF-8 bytes and reject oversize before field validation', () => {
  const submitted = bundle();
  submitted.decisions[0].reason = '界'.repeat(334_000);
  const serialized = JSON.stringify(submitted);
  assert.ok(serialized.length < 1_000_000, 'a character-count check would incorrectly accept this size');
  assert.ok(Buffer.byteLength(serialized, 'utf8') > 1_000_000);
  assert.throws(() => validateDecisionBundle(submitted, input()), /exceeds the 1,000,000-byte UTF-8 JSON limit/);
});

test('non-JSON bundle values return a bounded validation error', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const candidate of [undefined, circular, { amount: 1n }]) {
    assert.throws(() => validateDecisionBundle(candidate, input()), /must be serializable JSON/);
  }
});
