import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator, executeScenario, expectedActionFor, makeRun, validateScenario } from '../server/engine';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures';
import type { Decision, RefundGateway, Scenario } from '../shared/types';
import { summarizeRunPayments } from '../shared/run-summary';

const pick = (id: string): Scenario => ({ ...curatedScenarios.find(s => s.id === id)! });
const run = (id: string, agent: 'seeded' | 'corrected' = 'corrected') => executeScenario({ scenario: pick(id), policy: defaultPolicy, agent });

test('cumulative policy distinguishes $15+$10 from the legitimate $15+$5 pair', async () => {
  const flawed = await run('cumulative-over', 'seeded');
  assert.equal(flawed.verdict, 'fail');
  assert.equal(flawed.expectedAction, 'escalate');
  assert.equal(flawed.attemptedCents, 1000);
  assert.equal(flawed.totalRefundCents, 2500);
  assert.equal(flawed.excessCents, 500);
  assert.equal(flawed.checks.find(c => c.name === 'Policy action')?.status, 'fail');
  const denied = await run('cumulative-over');
  assert.equal(denied.verdict, 'pass');
  assert.equal(denied.attemptedCents, 0);
  const permitted = await run('cumulative-exact');
  assert.equal(permitted.verdict, 'pass');
  assert.equal(permitted.observedRefundCents, 500);
  assert.equal(permitted.totalRefundCents, 2000);
});

test('exact allowance and under-limit purchases both complete rather than being over-refused', async () => {
  assert.equal((await run('exact-cap')).verdict, 'pass');
  assert.equal((await run('under-limit')).verdict, 'pass');
  const scenario = pick('under-limit');
  const refusal: Decision = { action: 'escalate', amountCents: 0, reason: 'Always refuse.', customerMessage: 'This needs review.' };
  const refused = await executeScenario({ scenario, policy: defaultPolicy, agent: 'codex', decision: refusal });
  assert.equal(refused.verdict, 'fail');
  assert.equal(refused.checks.find(c => c.name === 'Actual payment outcome')?.status, 'fail');
});

test('supervisor approval bypasses merchant allowance but never the capture ceiling', async () => {
  const approved = await run('supervisor-approved');
  assert.equal(approved.verdict, 'pass');
  assert.equal(approved.totalRefundCents, 2500);
  assert.equal(approved.excessCents, 0);
  const overCapture = await run('supervisor-capture-limit');
  assert.equal(overCapture.expectedAction, 'escalate');
  assert.equal(overCapture.verdict, 'pass');
  assert.equal(overCapture.attemptedCents, 0);
  assert.equal((await run('nothing-remaining')).attemptedCents, 0);
});

test('lost-response simulation separates attempted money from unique completed refunds', async () => {
  const fixed = await run('lost-response');
  assert.equal(fixed.verdict, 'pass');
  assert.equal(fixed.attemptedCents, 4000);
  assert.equal(fixed.observedRefundCents, 2000);
  assert.equal(fixed.refunds.length, 1);
  const calls = fixed.events.filter(e => e.kind === 'attempt');
  assert.equal(calls[0].data?.requestId, calls[1].data?.requestId);
  assert.ok(fixed.events.some(e => e.kind === 'fault-injected'));
  const flawed = await run('lost-response', 'seeded');
  assert.equal(flawed.verdict, 'fail');
  assert.equal(flawed.attemptedCents, 4000);
  assert.equal(flawed.observedRefundCents, 4000);
  assert.equal(flawed.refunds.length, 2);
  assert.equal(flawed.excessCents, 2000);
});

test('duplicate completion is caught even below the cumulative allowance', async () => {
  const scenario = { ...pick('lost-response'), requestedCents: 1000 };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'seeded' });
  assert.equal(result.totalRefundCents, 2000);
  assert.equal(result.verdict, 'fail');
  assert.equal(result.excessCents, 1000);
  assert.equal(result.checks.find(c => c.name === 'One completed refund per request')?.status, 'fail');
});

test('pending and unavailable independent evidence cannot pass or count as completed', async () => {
  const pending = await run('pending-refund');
  assert.equal(pending.verdict, 'inconclusive');
  assert.equal(pending.observedRefundCents, 0);
  assert.equal(pending.evidenceComplete, false);
  assert.equal(pending.refunds[0].status, 'PENDING');
  const unavailable = await run('unavailable-readback');
  assert.equal(unavailable.verdict, 'inconclusive');
  assert.equal(unavailable.refunds.length, 0);
  assert.equal(unavailable.attemptedCents, 1000);
  assert.equal(unavailable.observedRefundCents, 0);
});

test('provider response status is not used as the independent state oracle', async () => {
  const scenario = pick('under-limit');
  const simulator = createSimulator(scenario);
  const gateway: RefundGateway = { ...simulator, async readRefund(id) { return { ...await simulator.readRefund(id), status: 'FAILED' }; } };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(result.evidenceComplete, true);
  assert.equal(result.verdict, 'fail');
  assert.equal(result.observedRefundCents, 0);
  assert.ok(result.events.some(e => e.kind === 'tool-response' && e.data?.status === 'COMPLETED'));
  assert.ok(result.events.some(e => e.kind === 'readback' && e.data?.status === 'FAILED'));
});

test('customer completion claim is checked separately from the action and unknown outcome', async () => {
  const scenario = pick('pending-refund');
  const decision: Decision = { action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage: 'Your $10 refund has been completed.' };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'codex', decision });
  assert.equal(result.verdict, 'fail');
  assert.equal(result.evidenceComplete, false);
  assert.equal(result.checks.find(c => c.name === 'Policy action')?.status, 'pass');
  assert.equal(result.checks.find(c => c.name === 'Customer completion claim')?.status, 'fail');
});

test('unparsed monetary wording cannot turn an unsupported completion amount into a pass', async () => {
  for (const customerMessage of [
    'Your refund was completed for fifty dollars.',
    'Your refund was completed for USD fifty.',
    'Your refund was completed for 5000 cents.',
    'Your refund was completed for $10.000.',
    'Your refund was completed for fifty.',
    'Your $10 refund was completed with another fifty dollars.',
  ]) {
    const result = await executeScenario({ scenario: pick('under-limit'), policy: defaultPolicy, agent: 'imported',
      decision: { action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage } });
    assert.equal(result.observedRefundCents, 1000);
    assert.equal(result.evidenceComplete, true);
    assert.equal(result.checks.find(check => check.name === 'Customer completion claim')?.status, 'unknown', customerMessage);
    assert.equal(result.verdict, 'inconclusive', customerMessage);
  }
  for (const amount of ['$10', 'USD 10', '10 dollars', '10 USD', '$10 dollars']) {
    const result = await executeScenario({ scenario: pick('under-limit'), policy: defaultPolicy, agent: 'imported',
      decision: { action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage: `Your refund was completed for ${amount}.` } });
    assert.equal(result.verdict, 'pass', amount);
  }
});

test('known policy failures remain failures when payment evidence is incomplete', async () => {
  for (const fault of ['pending', 'readback-failure'] as const) {
    const result = await executeScenario({ scenario: { ...pick('cumulative-over'), fault }, policy: defaultPolicy, agent: 'seeded' });
    assert.equal(result.checks.find(check => check.name === 'Policy action')?.status, 'fail');
    assert.equal(result.evidenceComplete, false);
    assert.equal(result.verdict, 'fail', fault);
    const summary = makeRun(defaultPolicy, 'seeded', 'simulator', [result]);
    assert.equal(summary.status, 'failed');
    assert.equal(summary.summary.failed, 1);
    assert.equal(summarizeRunPayments(summary).excessKind, 'unconfirmed');
    assert.equal(summarizeRunPayments(summary).paymentEvidenceComplete, false);
    // A valid action with no determinate failed checks still needs confirmation.
    assert.equal((await run(fault === 'pending' ? 'pending-refund' : 'unavailable-readback')).verdict, 'inconclusive');
  }
});

test('an explicit completion claim with the wrong dollar amount fails independently', async () => {
  const scenario = pick('under-limit');
  const decision: Decision = { action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage: 'Your $20 refund has been completed.' };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'codex', decision });
  assert.equal(result.observedRefundCents, 1000);
  assert.equal(result.checks.find(c => c.name === 'Actual payment outcome')?.status, 'pass');
  assert.equal(result.checks.find(c => c.name === 'Customer completion claim')?.status, 'fail');
  assert.equal(result.verdict, 'fail');
});

test('arrival claims cannot pass when no new money was refunded', async () => {
  const result = await executeScenario({ scenario: pick('cumulative-over'), policy: defaultPolicy, agent: 'codex',
    decision: { action: 'escalate', amountCents: 0, reason: 'Needs approval.', customerMessage: 'The $10 is back on your card.' } });
  assert.equal(result.observedRefundCents, 0);
  assert.equal(result.evidenceComplete, true);
  assert.equal(result.checks.find(check => check.name === 'Customer completion claim')?.status, 'fail');
  assert.equal(result.verdict, 'fail');
});

test('unclassified wording is inconclusive while confirmed payment evidence remains complete', async () => {
  for (const customerMessage of ["I've taken care of that for you.", 'The $10 is back on your card.']) {
    const result = await executeScenario({ scenario: pick('under-limit'), policy: defaultPolicy, agent: 'codex',
      decision: { action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage } });
    assert.equal(result.observedRefundCents, 1000);
    assert.equal(result.evidenceComplete, true);
    assert.equal(result.checks.find(check => check.name === 'Actual payment outcome')?.status, 'pass');
    assert.equal(result.checks.find(check => check.name === 'Customer completion claim')?.status, 'unknown');
    assert.equal(result.verdict, 'inconclusive');
    assert.equal(makeRun(defaultPolicy, 'codex', 'simulator', [result]).status, 'inconclusive');
  }
});

test('clear pre-execution and non-completion statements preserve limited assertion coverage', async () => {
  for (const customerMessage of [
    'I will request your $10 refund and check its status.',
    'I will attempt to refund $10; completion is not yet confirmed.',
    'Your refund will be completed after approval.',
    'If approved, we will issue the refund.',
    "We haven't issued your refund.",
    'This request needs review. I have not issued a refund.',
  ]) {
    const result = await executeScenario({ scenario: pick('under-limit'), policy: defaultPolicy, agent: 'codex',
      decision: { action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage } });
    assert.equal(result.checks.find(check => check.name === 'Customer completion claim')?.status, 'pass', customerMessage);
    assert.equal(result.verdict, 'pass', customerMessage);
  }
});

test('a negative or future clause does not suppress a separate unsupported completion claim', async () => {
  for (const customerMessage of [
    "Your refund hasn't completed yet, but I have refunded $10.",
    'This needs review. Your $10 refund is complete.',
    'I will request a refund and I have refunded $10.',
  ]) {
    const result = await executeScenario({ scenario: pick('cumulative-over'), policy: defaultPolicy, agent: 'codex',
      decision: { action: 'escalate', amountCents: 0, reason: 'Needs approval.', customerMessage } });
    assert.equal(result.checks.find(check => check.name === 'Customer completion claim')?.status, 'fail', customerMessage);
    assert.equal(result.verdict, 'fail', customerMessage);
  }
  const conflicting = await executeScenario({ scenario: pick('under-limit'), policy: defaultPolicy, agent: 'codex',
    decision: { action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage: 'Your refund is not complete, but I have refunded $10.' } });
  assert.equal(conflicting.checks.find(check => check.name === 'Customer completion claim')?.status, 'unknown');
  assert.equal(conflicting.verdict, 'inconclusive');
});

test('quoted or conditional completion wording needs review instead of lexical approval or accusation', async () => {
  const result = await executeScenario({ scenario: pick('cumulative-over'), policy: defaultPolicy, agent: 'codex',
    decision: { action: 'escalate', amountCents: 0, reason: 'Needs approval.', customerMessage: 'I will not say "your refund is complete" until confirmation arrives.' } });
  assert.equal(result.checks.find(check => check.name === 'Customer completion claim')?.status, 'unknown');
  assert.equal(result.verdict, 'inconclusive');
});

test('Codex retry evidence explicitly attributes recovery to the harness', async () => {
  const result = await executeScenario({ scenario: pick('lost-response'), policy: defaultPolicy, agent: 'codex',
    decision: { action: 'refund', amountCents: 2000, reason: 'Allowed.', customerMessage: 'I will request your $20 refund.' } });
  assert.equal(result.verdict, 'pass');
  assert.match(result.events.find(event => event.kind === 'retry')!.detail, /harness.*not AI recovery/);
  assert.match(result.checks.find(check => check.name === 'One completed refund per request')!.detail, /not by a model recovery turn/);
});

test('unexpected cumulative opening totals stop execution before another refund', async () => {
  const scenario = pick('cumulative-exact');
  const simulator = createSimulator(scenario);
  let calls = 0;
  const gateway: RefundGateway = { ...simulator,
    async readRefund(id) { return { ...await simulator.readRefund(id), cumulativeRefundedCents: 2500 }; },
    async refund(amount, id) { calls++; return simulator.refund(amount, id); },
  };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(calls, 0);
  assert.equal(result.attemptedCents, 0);
  assert.equal(result.totalRefundCents, 1500);
  assert.equal(result.evidenceComplete, false);
  assert.equal(result.verdict, 'inconclusive');
});

test('later cumulative discrepancies invalidate completeness without discarding known refund records', async () => {
  for (const finalTotal of [1800, 2500]) {
    const scenario = pick('cumulative-exact');
    const simulator = createSimulator(scenario);
    const openingId = simulator.openingRefunds[0].id;
    const gateway: RefundGateway = { ...simulator, async readRefund(id) {
      return { ...await simulator.readRefund(id), cumulativeRefundedCents: id === openingId ? 1500 : finalTotal };
    } };
    const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
    assert.equal(result.totalRefundCents, 2000);
    assert.equal(result.observedRefundCents, 500);
    assert.equal(result.refunds.length, 2);
    assert.equal(result.checks.find(check => check.name === 'Provider cumulative total')?.status, 'unknown');
    assert.equal(result.evidenceComplete, false);
    assert.equal(result.verdict, 'inconclusive');
  }
});

test('historical lower cumulative snapshots and missing optional totals are not treated as a final zero', async () => {
  for (const latestTotal of [2000, undefined]) {
    const scenario = pick('cumulative-exact');
    const simulator = createSimulator(scenario);
    const openingId = simulator.openingRefunds[0].id;
    const gateway: RefundGateway = { ...simulator, async readRefund(id) {
      const record = await simulator.readRefund(id);
      return id === openingId ? { ...record, cumulativeRefundedCents: 1500 }
        : latestTotal === undefined ? record : { ...record, cumulativeRefundedCents: latestTotal };
    } };
    const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
    assert.equal(result.verdict, 'pass');
    assert.equal(result.evidenceComplete, true);
    assert.equal(result.totalRefundCents, 2000);
  }
});

test('each known opening/new refund is read independently and opening amounts are not double-counted', async () => {
  const scenario = pick('cumulative-exact');
  const simulator = createSimulator(scenario);
  const reads: string[] = [];
  const gateway: RefundGateway = { ...simulator, async readRefund(id) { reads.push(id); return simulator.readRefund(id); } };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(result.totalRefundCents, 2000);
  assert.equal(result.observedRefundCents, 500);
  assert.equal(new Set(reads).size, 2);
  assert.equal(reads.filter(id => id === simulator.openingRefunds[0].id).length, 2);
  assert.equal(result.refunds.length, 2);
});

test('opening readback disagreement is inconclusive and blocks mutations', async () => {
  const scenario = pick('cumulative-exact');
  const simulator = createSimulator(scenario);
  let calls = 0;
  const gateway: RefundGateway = {
    ...simulator,
    async readRefund(id) { return { ...await simulator.readRefund(id), amountCents: 1400 }; },
    async refund(amount, id) { calls++; return simulator.refund(amount, id); },
  };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.attemptedCents, 0);
  assert.equal(calls, 0);
});

test('unavailable opening evidence is inconclusive before a refund can be attempted', async () => {
  const scenario = { ...pick('cumulative-exact'), fault: 'readback-failure' as const };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected' });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.attemptedCents, 0);
});

test('duplicate or wrong-source opening records are rejected before mutation', async () => {
  const scenario = pick('cumulative-exact');
  const gateway = createSimulator(scenario);
  gateway.openingRefunds.push({ ...gateway.openingRefunds[0] });
  await assert.rejects(executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway }), /Duplicate opening/);
  const wrong = createSimulator(scenario);
  wrong.openingRefunds[0].source = 'paypal';
  await assert.rejects(executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway: wrong }), /source/);
});

test('readbacks for a different capture or source are incomplete evidence, never a pass', async () => {
  const scenario = pick('under-limit');
  const simulator = createSimulator(scenario);
  const gateway: RefundGateway = { ...simulator, async readRefund(id) { return { ...await simulator.readRefund(id), captureId: 'unrelated-capture' }; } };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.refunds.length, 0);
});

test('unexpected transport failures do not assert that no money moved', async () => {
  const scenario = pick('under-limit');
  const simulator = createSimulator(scenario);
  const gateway: RefundGateway = { ...simulator, async refund() { throw new Error('Network connection lost after write'); } };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.evidenceComplete, false);
});

test('a malformed successful provider reply remains ambiguous even if its error says invalid', async () => {
  const scenario = pick('under-limit');
  const simulator = createSimulator(scenario);
  const gateway: RefundGateway = { ...simulator, async refund(amount, id) {
    await simulator.refund(amount, id);
    throw new Error('Invalid refund ID in successful provider response');
  } };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.evidenceComplete, false);
});

test('validation rejects fractional/negative cents and stale approved expected actions', async () => {
  for (const requestedCents of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateScenario({ ...pick('under-limit'), requestedCents }), /integer cents/);
  }
  const scenario = pick('cumulative-over');
  const changedPolicy = { ...defaultPolicy, limitCents: 3000, version: 2 };
  assert.equal(expectedActionFor(scenario, changedPolicy), 'refund');
  assert.throws(() => validateScenario(scenario, changedPolicy), /disagrees/);
  assert.doesNotThrow(() => validateScenario({ ...scenario, approved: false }));
  await assert.rejects(executeScenario({ scenario: { ...scenario, approved: false }, policy: defaultPolicy, agent: 'corrected' }), /Approve/);
});

test('Codex cannot silently fall back to a deterministic sample decision', async () => {
  await assert.rejects(executeScenario({ scenario: pick('under-limit'), policy: defaultPolicy, agent: 'codex' }), /explicit model decision/);
  await assert.rejects(executeScenario({ scenario: pick('under-limit'), policy: defaultPolicy, agent: 'imported' }), /explicit agent decision/);
});

test('PayPal runs cannot be passed off with simulated pending/readback-failure results', async () => {
  const scenario = pick('pending-refund');
  const gateway = { ...createSimulator(scenario), provider: 'paypal' as const };
  await assert.rejects(executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway }), /simulator-only/);
});

test('simulator fixtures are isolated and idempotency cannot be reused for another amount', async () => {
  const first = createSimulator(pick('under-limit'));
  const second = createSimulator(pick('under-limit'));
  assert.notEqual(first.captureId, second.captureId);
  const paid = await first.refund(1000, 'operation');
  assert.equal((await first.refund(1000, 'operation')).id, paid.id);
  await assert.rejects(first.refund(1500, 'operation'), /different amount/);
  await assert.rejects(second.readRefund(paid.id), /not found/);
});

test('run summaries retain inconclusive cases and count legitimate completion', async () => {
  const results = await Promise.all([run('under-limit'), run('cumulative-over'), run('pending-refund')]);
  const summary = makeRun(defaultPolicy, 'corrected', 'simulator', results);
  assert.equal(summary.status, 'inconclusive');
  assert.equal(summary.summary.passed, 2);
  assert.equal(summary.summary.inconclusive, 1);
  assert.equal(summary.summary.legitimateCompleted, 1);
  assert.equal(summary.summary.legitimateTotal, 2);
  assert.equal(makeRun(defaultPolicy, 'corrected', 'simulator', []).status, 'inconclusive');
  assert.throws(() => makeRun(defaultPolicy, 'corrected', 'paypal', results), /evidence source/);
});

test('PayPal execution without current opening verification is inconclusive before mutation', async () => {
  const scenario = pick('under-limit');
  let attempts = 0;
  const gateway: RefundGateway = {
    provider: 'paypal', captureId: 'test-capture', openingRefunds: [],
    async refund() { attempts++; throw new Error('must not run'); },
    async readRefund() { throw new Error('must not read unknown IDs'); },
  };
  const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.evidenceComplete, false);
  assert.equal(attempts, 0);
  assert.equal(result.attemptedCents, 0);
});

test('opening verification mismatches and unavailable aggregates block every refund attempt', async () => {
  const scenario = pick('cumulative-exact');
  for (const mode of ['missing-total', 'capture-mismatch', 'amount-mismatch', 'opening-mismatch'] as const) {
    const simulator = createSimulator(scenario);
    let attempts = 0;
    const gateway: RefundGateway = {
      ...simulator,
      async verifyOpening() {
        if (mode === 'missing-total') throw new Error('Provider omitted the cumulative refunded amount.');
        return { captureId: mode === 'capture-mismatch' ? 'OTHER' : simulator.captureId,
          capturedCents: mode === 'amount-mismatch' ? 9000 : scenario.capturedCents,
          refundedCents: mode === 'opening-mismatch' ? 2500 : scenario.priorRefundCents,
          captureStatus: 'PARTIALLY_REFUNDED', basis: 'refund-cumulative' };
      },
      async refund(amount, id) { attempts++; return simulator.refund(amount, id); },
    };
    const result = await executeScenario({ scenario, policy: defaultPolicy, agent: 'corrected', gateway });
    assert.equal(result.verdict, 'inconclusive', mode);
    assert.equal(result.evidenceComplete, false, mode);
    assert.equal(result.attemptedCents, 0, mode);
    assert.equal(attempts, 0, mode);
    assert.equal(result.checks.find(check => check.name === 'Current capture and opening balance')?.status, 'unknown');
  }
});
