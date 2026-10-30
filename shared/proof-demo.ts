import type { ProofAIRequest, Run } from './types.ts';
import { compareRuns } from './run-comparison.ts';

export interface ProofDemo { baseline: Run; refusal: Run; candidate: Run }
export interface ProofAIStatus { request: ProofAIRequest; active: boolean; proof?: ProofDemo }

export function proofLocation(proof: ProofDemo): string {
  return `/proof?${new URLSearchParams({ baseline: proof.baseline.id, refusal: proof.refusal.id, candidate: proof.candidate.id })}`;
}

/** All displayed improvements come from comparable, locally observed runs. */
export function summarizeProof(proof: ProofDemo) {
  const comparison = compareRuns(proof.baseline, proof.candidate);
  const control = compareRuns(proof.baseline, proof.refusal);
  const comparable = comparison.comparable && control.comparable;
  const paymentConfirmed = proof.candidate.results.every(result => result.evidenceComplete);
  const legitimate = proof.candidate.results.filter(result => result.expectedAction === 'refund');
  const legitimateCompleted = legitimate.filter(result => result.verdict === 'pass' && result.evidenceComplete && result.observedRefundCents === result.scenario.requestedCents).length;
  return {
    comparable, reasons: [...new Set([...comparison.reasons, ...control.reasons])],
    fixed: comparable ? comparison.summary.fixed : null,
    regressed: comparable ? comparison.summary.regressed : null,
    legitimateCompleted, legitimateTotal: legitimate.length, paymentConfirmed,
    passed: comparable && paymentConfirmed && proof.candidate.results.length > 0 && proof.candidate.results.every(result => result.verdict === 'pass'),
  };
}
