import assert from 'node:assert/strict';
import type { CaseResult, Run } from '../shared/types.ts';
import { AI_CHALLENGE_VERSION, aiChallengeInputs } from '../shared/ai-challenge.ts';
import { createAgentInput } from './decision-bundle.ts';
import { executeScenario, makeRun, validateScenario } from './engine.ts';

export async function challengeControls() {
  const { policy, scenarios } = aiChallengeInputs();
  for (const scenario of scenarios) validateScenario(scenario, policy);
  const digest = createAgentInput(policy, scenarios).inputDigest;
  const runs: Record<'seeded' | 'refusal' | 'corrected', Run> = {} as Record<'seeded' | 'refusal' | 'corrected', Run>;
  for (const kind of ['seeded', 'refusal', 'corrected'] as const) {
    const agent = kind === 'refusal' ? 'imported' : kind;
    const results: CaseResult[] = [];
    for (const scenario of scenarios) results.push(await executeScenario({ scenario, policy, agent,
      ...(kind === 'refusal' ? { decision: { action: 'escalate' as const, amountCents: 0,
        reason: 'Teaching control: escalate every request.', customerMessage: 'This request needs review. I have not issued a refund.' } } : {}),
    }));
    const run = makeRun(policy, agent, 'simulator', results);
    run.provenance!.inputDigest = digest;
    if (kind === 'refusal') {
      run.importedAgent = { name: 'Escalate everything · teaching control', version: 'refusal-control-v1' };
      run.provenance!.agentVersion = run.importedAgent.version;
    }
    runs[kind] = run;
  }
  return runs;
}

export function summarizeChallenge(runs: Record<string, Run>) {
  const { policy, scenarios } = aiChallengeInputs();
  const digest = createAgentInput(policy, scenarios).inputDigest;
  const categories = [...new Set(scenarios.map(scenario => scenario.category))];
  const casesById = new Map(scenarios.map(scenario => [scenario.id, scenario]));
  return {
    version: AI_CHALLENGE_VERSION, inputDigest: digest, caseCount: scenarios.length,
    scope: 'One hand-authored synthetic challenge. No population benchmark, real-world loss estimate, or production-safety guarantee. Payments are simulated; retry identities are controlled by the harness, not by an AI recovery turn.',
    outcomes: Object.fromEntries(Object.entries(runs).map(([name, run]) => {
      assert.equal(run.provider, 'simulator', 'Challenge payments must be simulated.');
      assert.equal(run.provenance?.inputDigest, digest, 'Challenge run has different inputs.');
      assert.equal(createAgentInput(run.policy, run.results.map(result => result.scenario)).inputDigest, digest, 'Run inputs do not match the saved challenge digest.');
      const count = (results: CaseResult[]) => ({
        total: results.length,
        passed: results.filter(result => result.verdict === 'pass').length,
        failed: results.filter(result => result.verdict === 'fail').length,
        inconclusive: results.filter(result => result.verdict === 'inconclusive').length,
        legitimatePassed: results.filter(result => result.expectedAction === 'refund' && result.verdict === 'pass').length,
        legitimateTotal: results.filter(result => result.expectedAction === 'refund').length,
        paymentEvidenceComplete: results.every(result => result.evidenceComplete),
      });
      return [name, {
        runId: run.id, ...count(run.results),
        categories: Object.fromEntries(categories.map(category => [category, count(run.results.filter(result => casesById.get(result.scenario.id)!.category === category))])),
        cases: run.results.map(result => ({ scenarioId: result.scenario.id, title: casesById.get(result.scenario.id)!.title, category: casesById.get(result.scenario.id)!.category,
          verdict: result.verdict, decisionValid: result.decisionValid !== false,
          expectedAction: result.expectedAction, action: result.decision.action, amountCents: result.decision.amountCents,
          excessCents: result.evidenceComplete ? result.excessCents : null,
          checksNeedingAttention: result.checks.filter(check => check.status !== 'pass'),
        })),
      }];
    })),
  };
}
