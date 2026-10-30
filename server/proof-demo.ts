import type { CaseResult, Run } from '../shared/types.ts';
import type { ProofDemo } from '../shared/proof-demo.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';
import { executeScenario, makeRun } from './engine.ts';
import { createAgentInput } from './decision-bundle.ts';
import { decisionPreflight } from './decision-evidence.ts';
import { decideWithCodex } from './ai.ts';

/** Fixed, reviewed teaching inputs; never edits or borrows the user's scenario library. */
export function proofInputs() {
  return {
    policy: structuredClone(defaultPolicy),
    scenarios: curatedScenarios.filter(s => ['cumulative-over', 'cumulative-exact'].includes(s.id)).map(s => structuredClone(s)),
  };
}

export async function createProofDemo(): Promise<ProofDemo> {
  const { policy, scenarios } = proofInputs();
  const digest = createAgentInput(policy, scenarios).inputDigest;
  async function runControl(kind: 'seeded' | 'corrected' | 'refusal'): Promise<Run> {
    const agent = kind === 'refusal' ? 'imported' : kind;
    const results: CaseResult[] = [];
    for (const scenario of scenarios) {
      results.push(await executeScenario({ scenario, policy, agent, ...(kind === 'refusal' ? { decision: {
        action: 'escalate', amountCents: 0, reason: 'Teaching control: escalate every request, including permitted refunds.',
        customerMessage: 'This request needs review. I have not issued a refund.',
      } as const } : {}) }));
    }
    const run = makeRun(policy, agent, 'simulator', results);
    run.provenance!.inputDigest = digest;
    if (kind === 'refusal') {
      run.importedAgent = { name: 'Escalate everything · teaching control', version: 'refusal-control-v1' };
      run.provenance!.agentVersion = run.importedAgent.version;
    }
    return run;
  }
  return { baseline: await runControl('seeded'), refusal: await runControl('refusal'), candidate: await runControl('corrected') };
}

/** A genuine model call, independently evaluated; no teaching fallback on any error. */
export async function evaluateProofAI(baseline: Run, decide = decideWithCodex): Promise<Run> {
  const policy = structuredClone(baseline.policy);
  const scenarios = baseline.results.map(result => structuredClone(result.scenario));
  const input = createAgentInput(policy, scenarios);
  const response = await decide(policy, scenarios);
  const rejected = decisionPreflight(scenarios, policy, response.decisions);
  const results: CaseResult[] = rejected || [];
  if (!rejected) for (const scenario of scenarios) {
    results.push(await executeScenario({ scenario, policy, agent: 'codex', decision: response.decisions.get(scenario.id) }));
  }
  const run = makeRun(policy, 'codex', 'simulator', results);
  run.provenance!.inputDigest = input.inputDigest;
  run.ai = response.ai;
  return run;
}
