import test from 'node:test';
import assert from 'node:assert/strict';
import { mapStructuredDecisions } from '../server/ai.ts';
import { decisionPreflight } from '../server/decision-evidence.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';

const scenarios = curatedScenarios.slice(0, 2);
const entry = (id: string) => ({ scenarioId: id, action: 'escalate', amountCents: 0, reason: 'Needs review.', customerMessage: 'This needs review.' });
test('missing, duplicate and unknown structured AI decisions are retained before execution', () => {
  for (const response of [ {}, {decisions: []}, {decisions:[entry(scenarios[0].id)]},
    {decisions:[entry(scenarios[0].id),entry(scenarios[0].id)]},
    {decisions:[entry(scenarios[0].id),entry('unknown')]}, {decisions:[null, entry(scenarios[1].id)]} ]) {
    const rejected = decisionPreflight(scenarios, defaultPolicy, mapStructuredDecisions(response, scenarios));
    assert.ok(rejected);
    assert.equal(rejected[0].verdict, 'fail');
    assert.deepEqual((rejected[0].submittedDecision as {structuredResponse:unknown}).structuredResponse, response);
    assert.ok(rejected.every(result => result.attemptedCents === 0 && !result.evidenceComplete));
  }
});
test('AI fields are independently validated without replacing the submitted malformed output', () => {
  const response = { decisions: scenarios.map(s => entry(s.id)) };
  (response.decisions[1] as unknown as {amountCents: unknown}).amountCents = '100';
  const results = decisionPreflight(scenarios, defaultPolicy, mapStructuredDecisions(response, scenarios));
  assert.ok(results);
  assert.equal(results[1].verdict, 'fail');
  assert.equal((results[1].submittedDecision as {amountCents:unknown}).amountCents, '100');
});
