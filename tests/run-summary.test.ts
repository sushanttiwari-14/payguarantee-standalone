import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRunPayments } from '../shared/run-summary.ts';
import type { CaseResult } from '../shared/types.ts';

const result = (evidenceComplete: boolean, excessCents: number, verdict: CaseResult['verdict'] = 'inconclusive') => ({ evidenceComplete, excessCents, verdict }) as CaseResult;

test('missing payment readback cannot be presented as a confirmed zero', () => {
  assert.deepEqual(summarizeRunPayments({ results: [result(false, 0)] }), {
    confirmedExcessCents: 0, unconfirmedCases: 1, paymentEvidenceComplete: false, excessKind: 'unconfirmed',
  });
});

test('mixed confirmed excess and missing payment evidence produce a known minimum', () => {
  const results = [result(true, 500, 'fail'), result(false, 0), result(true, 200, 'fail')];
  const before = structuredClone(results);
  assert.deepEqual(summarizeRunPayments({ results }), {
    confirmedExcessCents: 700, unconfirmedCases: 1, paymentEvidenceComplete: false, excessKind: 'minimum',
  });
  assert.deepEqual(results, before, 'saved evidence is not changed');
});

test('wording-only inconclusive cases with complete payment evidence retain exact zero', () => {
  assert.deepEqual(summarizeRunPayments({ results: [result(true, 0, 'inconclusive'), result(true, 0, 'pass')] }), {
    confirmedExcessCents: 0, unconfirmedCases: 0, paymentEvidenceComplete: true, excessKind: 'exact',
  });
});

test('complete positive payment evidence retains its exact total regardless of verdict', () => {
  assert.deepEqual(summarizeRunPayments({ results: [result(true, 500, 'inconclusive'), result(true, 200, 'fail')] }), {
    confirmedExcessCents: 700, unconfirmedCases: 0, paymentEvidenceComplete: true, excessKind: 'exact',
  });
});

test('unconfirmed case amounts are excluded from the confirmed minimum', () => {
  assert.deepEqual(summarizeRunPayments({ results: [result(true, 500), result(false, 1000)] }), {
    confirmedExcessCents: 500, unconfirmedCases: 1, paymentEvidenceComplete: false, excessKind: 'minimum',
  });
});

test('missing legacy flags, malformed amounts, and empty evidence do not imply known zero', () => {
  const legacy = { excessCents: 0, verdict: 'pass' } as CaseResult;
  assert.equal(summarizeRunPayments({ results: [legacy] }).excessKind, 'unconfirmed');
  assert.equal(summarizeRunPayments({ results: [result(true, Number.NaN)] }).excessKind, 'unconfirmed');
  assert.equal(summarizeRunPayments({ results: [] }).excessKind, 'unconfirmed');
});
