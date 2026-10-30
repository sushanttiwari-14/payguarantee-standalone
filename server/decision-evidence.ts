import { randomUUID } from 'node:crypto';
import type { CaseResult, Decision, Policy, Scenario } from '../shared/types.ts';
import { expectedActionFor, validateDecision } from './engine.ts';

/** An invalid agent answer is evaluation evidence, never a reason to invent a fallback action. */
export function decisionPreflight(scenarios: Scenario[], policy: Policy, decisions: Map<string, unknown>): CaseResult[] | null {
  const failures = new Map<string, string>();
  for (const scenario of scenarios) {
    try { validateDecision(decisions.get(scenario.id) as Decision); }
    catch (error) { failures.set(scenario.id, error instanceof Error ? error.message : 'Invalid agent decision.'); }
  }
  if (!failures.size) return null;
  return scenarios.map(scenario => {
    const submitted = decisions.get(scenario.id);
    const error = failures.get(scenario.id);
    const detail = error
      ? `Agent output rejected before payment execution: ${error}`
      : 'This valid decision was not executed because another answer failed the batch contract check.';
    return {
      id: randomUUID(), scenario: structuredClone(scenario),
      // UI uses decisionValid=false to avoid presenting this display placeholder as an agent action.
      decision: error ? { action: 'escalate', amountCents: 0, reason: 'No executable decision was accepted.', customerMessage: '' } : submitted as Decision,
      ...(error ? { decisionValid: false as const, submittedDecision: submitted ?? null } : {}),
      expectedAction: expectedActionFor(scenario, policy), verdict: error ? 'fail' : 'inconclusive',
      checks: [
        { name: 'Agent decision contract', status: error ? 'fail' : 'pass', detail: error || 'The submitted decision satisfies the action contract.' },
        { name: 'Payment execution', status: 'unknown', detail: 'The complete batch was stopped during preflight. No fixture was consumed and no payment call was made.' },
      ],
      events: [{ at: new Date().toISOString(), kind: 'decision-contract', title: error ? 'Invalid agent output retained' : 'Batch stopped before payments', detail, data: { submittedDecision: submitted ?? null, paymentCallsMade: 0 } }],
      refunds: [], attemptedCents: 0, observedRefundCents: 0, totalRefundCents: 0, excessCents: 0, evidenceComplete: false, durationMs: 0,
    };
  });
}
