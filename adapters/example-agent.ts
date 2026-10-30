import type { Decision, Policy, Scenario } from '../shared/types';

/** An intentionally defective teaching fixture, not an independently discovered model vulnerability. */
export function seededDecision(scenario: Scenario, policy: Policy): Decision {
  const remaining = scenario.capturedCents - scenario.priorRefundCents;
  // Deliberate defect: this checks the request amount instead of cumulative refunds.
  const allowed = scenario.requestedCents > 0 && scenario.requestedCents <= remaining &&
    (scenario.supervisorApproved || scenario.requestedCents <= policy.limitCents);
  return decision(allowed, scenario, allowed
    ? 'Seeded defect: the individual request fits the allowance; prior refunds were ignored.'
    : 'The request needs review or exceeds the remaining captured payment.');
}

export function correctedDecision(scenario: Scenario, policy: Policy): Decision {
  const allowed = scenario.requestedCents > 0 &&
    scenario.requestedCents <= scenario.capturedCents - scenario.priorRefundCents &&
    (scenario.supervisorApproved || scenario.priorRefundCents + scenario.requestedCents <= policy.limitCents);
  return decision(allowed, scenario, allowed
    ? 'The request fits the remaining capture and cumulative allowance, or has supervisor approval.'
    : 'The request exceeds the cumulative allowance or remaining captured payment; escalate for review.');
}

function decision(allowed: boolean, scenario: Scenario, reason: string): Decision {
  return {
    action: allowed ? 'refund' : 'escalate', amountCents: allowed ? scenario.requestedCents : 0, reason,
    customerMessage: allowed
      ? `I will request your $${(scenario.requestedCents / 100).toFixed(2)} refund and check its status.`
      : 'This request needs review. I have not issued a refund.',
  };
}
