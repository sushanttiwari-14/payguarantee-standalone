import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns } from '../shared/run-comparison.ts';
import { executeScenario, makeRun } from '../server/engine.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';
import type { CaseResult, Run } from '../shared/types.ts';

async function pair() {
  const scenarios = curatedScenarios.filter(s => ['cumulative-over', 'cumulative-exact'].includes(s.id));
  const baseline = makeRun(defaultPolicy, 'seeded', 'simulator', await Promise.all(scenarios.map(scenario => executeScenario({ scenario, policy: defaultPolicy, agent: 'seeded' }))));
  const candidate = makeRun(defaultPolicy, 'corrected', 'simulator', await Promise.all(scenarios.map(scenario => executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected' }))));
  return { baseline, candidate };
}

test('controlled comparison identifies the real seeded fix and changed checks without mutating runs', async () => {
  const { baseline, candidate } = await pair();
  const original = structuredClone({ baseline, candidate });
  const comparison = compareRuns(baseline, candidate);
  assert.equal(comparison.comparable, true);
  assert.deepEqual(comparison.summary, { regressed: 0, fixed: 1, resolved: 0, unresolved: 0, unchanged: 1 });
  assert.equal(comparison.cases.find(c => c.change === 'fixed')?.scenarioId, 'cumulative-over');
  assert.ok(comparison.cases[0].checks.some(c => c.name === 'Policy action' && c.before?.status === 'fail' && c.after?.status === 'pass'));
  assert.deepEqual({ baseline, candidate }, original);
  assert.equal(compareRuns(candidate, baseline).summary.regressed, 1);
});

test('pending outcomes and restored evidence are distinct from confirmed fixes', async () => {
  const { baseline, candidate } = await pair();
  const changeVerdict = (run: Run, verdict: CaseResult['verdict']) => { run.results[0].verdict = verdict; };
  changeVerdict(baseline, 'fail'); changeVerdict(candidate, 'inconclusive');
  assert.equal(compareRuns(baseline, candidate).summary.fixed, 0);
  assert.equal(compareRuns(baseline, candidate).cases[0].change, 'unresolved');
  changeVerdict(baseline, 'inconclusive'); changeVerdict(candidate, 'pass');
  assert.equal(compareRuns(baseline, candidate).summary.fixed, 0);
  assert.equal(compareRuns(baseline, candidate).summary.resolved, 1);
  changeVerdict(baseline, 'pass'); changeVerdict(candidate, 'inconclusive');
  assert.equal(compareRuns(baseline, candidate).summary.regressed, 1);
});

test('different facts, policies, evidence sources or evaluators never receive a fix count', async () => {
  const { baseline, candidate } = await pair();
  for (const modify of [
    (run: Run) => { run.results[0].scenario.message += ' A changed request.'; },
    (run: Run) => { run.results[0].scenario.priorRefundCents -= 1; },
    (run: Run) => { run.policy.version += 1; },
    (run: Run) => { run.provider = 'paypal'; },
    (run: Run) => { delete run.provenance; },
    (run: Run) => { run.provenance!.verifierVersion = 'different'; },
  ]) {
    const changed = structuredClone(candidate); modify(changed);
    const comparison = compareRuns(baseline, changed);
    assert.equal(comparison.comparable, false);
    assert.equal(comparison.summary.fixed, 0);
    assert.equal(comparison.summary.regressed, 0);
    assert.ok(comparison.reasons.length);
  }
});

test('missing, extra, duplicate or same-run cases cannot masquerade as a controlled improvement', async () => {
  const { baseline, candidate } = await pair();
  const missing = structuredClone(candidate); missing.results.pop();
  assert.equal(compareRuns(baseline, missing).cases[1].change, 'removed');
  assert.equal(compareRuns(missing, candidate).cases[1].change, 'added');
  assert.equal(compareRuns(baseline, missing).summary.fixed, 0);
  const duplicated = structuredClone(candidate); duplicated.results.push(duplicated.results[0]);
  assert.equal(compareRuns(baseline, duplicated).comparable, false);
  assert.equal(compareRuns(candidate, candidate).comparable, false);
});

test('title, approval and provenance-only edits do not obscure identical recorded evaluation inputs', async () => {
  const { baseline, candidate } = await pair();
  candidate.results[0].scenario.title = 'A clearer label';
  candidate.results[0].scenario.approved = false;
  candidate.results.reverse();
  assert.equal(compareRuns(baseline, candidate).comparable, true);
  assert.equal(compareRuns(baseline, candidate).summary.fixed, 1);
});

test('externally imported verdicts cannot become a locally observed improvement', async () => {
  const { baseline, candidate } = await pair();
  candidate.origin = { kind: 'imported-evidence', sourceRunId: 'external-claim', importedAt: new Date().toISOString() };
  const comparison = compareRuns(baseline, candidate);
  assert.equal(comparison.comparable, false);
  assert.equal(comparison.summary.fixed, 0);
  assert.match(comparison.reasons.join(' '), /unverified external evidence/);
});
