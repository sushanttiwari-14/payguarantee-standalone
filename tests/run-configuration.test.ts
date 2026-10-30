import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurationDifferences } from '../shared/run-configuration.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';
import { executeScenario, makeRun } from '../server/engine.ts';

test('saved-result scope notices distinguish changed settings from labels and order', async () => {
  const scenarios = curatedScenarios.slice(0, 2);
  const run = makeRun(defaultPolicy, 'corrected', 'simulator', await Promise.all(scenarios.map(scenario => executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected' }))));
  const next = { agent: 'corrected' as const, provider: 'simulator' as const, policy: defaultPolicy, scenarios };
  assert.deepEqual(configurationDifferences(run, next), []);
  assert.deepEqual(configurationDifferences(run, { ...next, scenarios: [...scenarios].reverse().map(s => ({ ...s, title: 'New label' })) }), []);
  assert.deepEqual(configurationDifferences(run, { ...next, agent: 'seeded', provider: 'paypal', policy: { ...defaultPolicy, version: 2 }, scenarios: [{ ...scenarios[0], message: 'Changed request' }] }), ['agent', 'evidence source', 'policy', 'selected cases', 'case inputs']);
  for (const patch of [{ requestedCents: 1 }, { priorRefundCents: 1 }, { capturedCents: 1 }, { supervisorApproved: true }, { fault: 'pending' as const }]) {
    assert.deepEqual(configurationDifferences(run, { ...next, scenarios: [{ ...scenarios[0], ...patch }, scenarios[1]] }), ['case inputs']);
  }
});
