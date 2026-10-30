import test from 'node:test';
import assert from 'node:assert/strict';
import { agentRequestIdentityMap, createAgentRequest } from '../server/agent-request.ts';
import { createAgentInput, validateAgentInput, validateDecisionBundle } from '../server/decision-bundle.ts';
import { buildCodexDecisionPrompt, mapStructuredDecisions } from '../server/ai.ts';
import { decisionPreflight } from '../server/decision-evidence.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';

const scenarios = curatedScenarios.slice(0, 2);
const entry = (id: string) => ({ scenarioId: id, action: 'escalate', amountCents: 0, reason: 'Needs review.', customerMessage: 'This needs review.' });
const input = createAgentInput(defaultPolicy, scenarios);
const request = createAgentRequest(input);
const bundle = () => ({ schemaVersion: 2, inputDigest: request.inputDigest, agent: { name: 'Opaque example', version: '1' }, decisions: request.scenarios.map(s => entry(s.id)) });

test('agent requests hide semantic IDs, labels and future faults without changing historical fixture semantics', () => {
  const fixture = createAgentInput(defaultPolicy, curatedScenarios);
  const visible = createAgentRequest(fixture);
  assert.equal(visible.schemaVersion, 2);
  assert.equal(visible.inputDigest, fixture.inputDigest);
  assert.deepEqual(visible.policy, fixture.policy);
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.scenarios[0].id, 'under-limit');
  assert.equal(fixture.scenarios.find(s => s.id === 'pending-refund')?.fault, 'pending');
  assert.deepEqual(validateAgentInput(fixture), fixture);
  assert.throws(() => validateAgentInput(visible), /Unsupported agent input schemaVersion/);
  const serialized = JSON.stringify(visible);
  for (const source of curatedScenarios) {
    assert.ok(!serialized.includes(`"${source.id}"`));
    assert.ok(!serialized.includes(`"${source.title}"`));
  }
  for (const row of visible.scenarios) {
    assert.match(row.id, /^case_[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(row).sort(), ['capturedCents', 'id', 'message', 'priorRefundCents', 'requestedCents', 'supervisorApproved']);
  }
  for (const field of ['fault', 'expectedAction', 'title', 'approved', 'generation']) assert.ok(!serialized.includes(`"${field}":`));
  assert.equal(new Set(visible.scenarios.map(s => s.id)).size, curatedScenarios.length);
});

test('opaque identities are stable across reorder and bound to the complete fixture digest', () => {
  const reversed = createAgentInput(defaultPolicy, [...scenarios].reverse());
  assert.deepEqual([...agentRequestIdentityMap(reversed)].sort(), [...agentRequestIdentityMap(input)].sort());
  assert.deepEqual(createAgentRequest(input), request);
  const changedFault = createAgentInput(defaultPolicy, scenarios.map((s, i) => i ? s : { ...s, fault: 'pending' }));
  assert.notEqual(changedFault.inputDigest, input.inputDigest);
  for (const alias of agentRequestIdentityMap(changedFault).keys()) assert.ok(!agentRequestIdentityMap(input).has(alias));
});

test('schema-2 decisions resolve to source IDs and cannot mix schemas, stale aliases or duplicate IDs', () => {
  const accepted = validateDecisionBundle(bundle(), input);
  assert.deepEqual([...accepted.decisions.keys()], scenarios.map(s => s.id));
  const original = bundle();
  const changed = createAgentInput({ ...defaultPolicy, version: 2 }, scenarios);
  for (const bad of [
    { ...original, schemaVersion: 1 },
    { ...original, decisions: original.decisions.map((row, i) => i ? row : { ...row, scenarioId: scenarios[i].id }) },
    { ...original, decisions: [original.decisions[0], original.decisions[0]] },
    { ...original, decisions: original.decisions.slice(1) },
    { ...original, inputDigest: changed.inputDigest },
    { ...original, decisions: createAgentRequest(changed).scenarios.map(s => entry(s.id)) },
  ]) assert.throws(() => validateDecisionBundle(bad, input));
  const legacy = { ...original, schemaVersion: 1, decisions: scenarios.map(s => entry(s.id)) };
  assert.deepEqual([...validateDecisionBundle(legacy, input).decisions.keys()], scenarios.map(s => s.id));
  assert.throws(() => validateDecisionBundle({ ...legacy, schemaVersion: 2 }, input));
});

test('Codex prompt uses the same opaque view and maps decisions back before validation', () => {
  const prompt = buildCodexDecisionPrompt(request);
  for (const scenario of scenarios) assert.ok(!prompt.includes(scenario.id));
  assert.ok(!prompt.includes('"fault":'));
  for (const scenario of request.scenarios) assert.ok(prompt.includes(scenario.id));
  const response = { decisions: request.scenarios.map(s => entry(s.id)).reverse() };
  const mapped = mapStructuredDecisions(response, scenarios, agentRequestIdentityMap(input));
  assert.equal(decisionPreflight(scenarios, defaultPolicy, mapped), null);
  assert.deepEqual([...mapped.keys()].sort(), scenarios.map(s => s.id).sort());
});

test('opaque Codex mapping retains malformed batch evidence and rejects original or mixed identities', () => {
  const validRows = request.scenarios.map(s => entry(s.id));
  for (const response of [
    {}, { decisions: [] }, { decisions: validRows.slice(1) },
    { decisions: [validRows[0], validRows[0]] },
    { decisions: [validRows[0], entry(scenarios[1].id)] },
    { decisions: scenarios.map(s => entry(s.id)) },
    { decisions: [null, validRows[1]] },
  ]) {
    const results = decisionPreflight(scenarios, defaultPolicy, mapStructuredDecisions(response, scenarios, agentRequestIdentityMap(input)));
    assert.ok(results);
    assert.deepEqual((results[0].submittedDecision as { structuredResponse: unknown }).structuredResponse, response);
    assert.ok(results.every(r => !r.evidenceComplete && r.attemptedCents === 0));
  }
  const malformed = { decisions: [validRows[0], { ...validRows[1], amountCents: '100' }] };
  const results = decisionPreflight(scenarios, defaultPolicy, mapStructuredDecisions(malformed, scenarios, agentRequestIdentityMap(input)));
  assert.ok(results);
  assert.equal((results[1].submittedDecision as { amountCents: unknown }).amountCents, '100');
});
