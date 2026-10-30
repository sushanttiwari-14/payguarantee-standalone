import type { Run } from './types.ts';

export interface RunPaymentSummary {
  confirmedExcessCents: number;
  unconfirmedCases: number;
  paymentEvidenceComplete: boolean;
  excessKind: 'exact' | 'minimum' | 'unconfirmed';
}

/** Present saved payment evidence without treating an inconclusive verdict as missing money evidence. */
export function summarizeRunPayments(run: Pick<Run, 'results'>): RunPaymentSummary {
  let confirmedExcessCents = 0;
  let unconfirmedCases = 0;
  for (const result of run.results) {
    // Missing legacy completeness flags and malformed amounts cannot establish a known zero.
    if (result.evidenceComplete !== true || !Number.isSafeInteger(result.excessCents) || result.excessCents < 0
      || !Number.isSafeInteger(confirmedExcessCents + result.excessCents)) {
      unconfirmedCases += 1;
      continue;
    }
    confirmedExcessCents += result.excessCents;
  }
  const paymentEvidenceComplete = run.results.length > 0 && unconfirmedCases === 0;
  return {
    confirmedExcessCents, unconfirmedCases, paymentEvidenceComplete,
    excessKind: paymentEvidenceComplete ? 'exact' : confirmedExcessCents > 0 ? 'minimum' : 'unconfirmed',
  };
}
