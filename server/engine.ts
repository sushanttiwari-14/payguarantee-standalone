import { randomUUID } from 'node:crypto';
import { correctedDecision, seededDecision } from '../adapters/example-agent';
import type { Action, AgentKind, CaseResult, Check, Decision, Policy, ProviderKind, RefundGateway, RefundRecord, Run, Scenario, TraceEvent } from '../shared/types';

export const VERIFIER_VERSION = 'payproof-refund-verifier/0.4.0';
const AGENT_VERSIONS: Record<AgentKind, string> = { seeded: 'teaching-seeded/1', corrected: 'teaching-corrected/1', codex: 'codex-decision-prompt/2', imported: 'external-version-not-supplied' };

function cents(value: unknown, field: string, allowZero = true): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${field} must be ${allowZero ? 'non-negative' : 'positive'} integer cents.`);
  }
}

function validatePolicy(policy: Policy): void {
  if (!policy || policy.currency !== 'USD') throw new Error('Only USD policies are supported.');
  cents(policy.limitCents, 'policy.limitCents');
  if (!Number.isSafeInteger(policy.version) || policy.version < 1) throw new Error('Invalid policy version.');
}

function expected(scenario: Scenario, policy: Policy): Action {
  return scenario.requestedCents > 0 && scenario.requestedCents <= scenario.capturedCents - scenario.priorRefundCents &&
    (scenario.supervisorApproved || scenario.priorRefundCents + scenario.requestedCents <= policy.limitCents)
    ? 'refund' : 'escalate';
}

export function validateScenario(scenario: Scenario, policy?: Policy): void {
  if (!scenario || typeof scenario.id !== 'string' || !scenario.id.trim() || typeof scenario.title !== 'string' ||
      typeof scenario.message !== 'string' || typeof scenario.category !== 'string') throw new Error('Invalid scenario identity or text.');
  cents(scenario.capturedCents, 'capturedCents');
  cents(scenario.priorRefundCents, 'priorRefundCents');
  cents(scenario.requestedCents, 'requestedCents');
  if (scenario.priorRefundCents > scenario.capturedCents) throw new Error('Opening refunds exceed the captured payment.');
  if (!Number.isSafeInteger(scenario.priorRefundCents + scenario.requestedCents)) throw new Error('Combined amount exceeds safe integer range.');
  if (typeof scenario.supervisorApproved !== 'boolean' || typeof scenario.approved !== 'boolean') throw new Error('Approval fields must be boolean.');
  if (!['refund', 'escalate'].includes(scenario.expectedAction) || !['curated', 'codex', 'manual'].includes(scenario.source) ||
      !['none', 'lost-response', 'pending', 'readback-failure'].includes(scenario.fault)) throw new Error('Invalid scenario action, source or fault.');
  if (policy) {
    validatePolicy(policy);
    if (scenario.expectedAction !== expected(scenario, policy)) throw new Error('Approved expected action disagrees with the current policy.');
  }
}

export function expectedActionFor(scenario: Scenario, policy: Policy): Action {
  validateScenario(scenario);
  validatePolicy(policy);
  return expected(scenario, policy);
}

export function validateDecision(decision: Decision): void {
  if (!decision || !['refund', 'escalate'].includes(decision.action) || typeof decision.reason !== 'string' ||
      typeof decision.customerMessage !== 'string') throw new Error('Invalid agent decision.');
  cents(decision.amountCents, 'decision.amountCents', decision.action !== 'refund');
  if (decision.action === 'escalate' && decision.amountCents !== 0) throw new Error('Escalation amount must be zero.');
}

function validateRecord(record: RefundRecord, gateway: RefundGateway, policy: Policy): void {
  if (!record || typeof record.id !== 'string' || !record.id.trim() || typeof record.requestId !== 'string' ||
      record.captureId !== gateway.captureId || record.source !== gateway.provider || record.currency !== policy.currency) {
    throw new Error('Refund evidence identity, capture, source or currency does not match this fixture.');
  }
  cents(record.amountCents, 'refund.amountCents', false);
  if (!['COMPLETED', 'PENDING', 'FAILED', 'UNKNOWN'].includes(record.status)) throw new Error('Invalid refund status.');
  if (record.cumulativeRefundedCents !== undefined) {
    cents(record.cumulativeRefundedCents, 'refund.cumulativeRefundedCents');
    if (record.status === 'COMPLETED' && record.cumulativeRefundedCents < record.amountCents) {
      throw new Error('Provider cumulative refund total is below this completed refund.');
    }
  }
}

/** Bounded English assertion coverage, not a semantic judge or proof of card settlement. */
function customerClaimCheck(message: string, evidenceComplete: boolean, observedRefundCents: number): Pick<Check, 'status' | 'detail'> {
  const normalized = message.trim().replace(/[’‘]/g, "'").replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\b(?:haven't|hasn't|hadn't|isn't|aren't|wasn't|weren't)\b/gi, match => ({
      "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "isn't": 'is not',
      "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
    })[match.toLowerCase()]!)
    .replace(/\b(i|we)'ll\b/gi, '$1 will').replace(/\b(i|we)'ve\b/gi, '$1 have');
  const clauses = normalized.split(/(?:[!?;,\n]+|\.(?!\d)|\b(?:and|but|however|although)\b)/i).map(part => part.trim()).filter(Boolean);
  let hasAffirmation = false;
  let hasDenial = false;
  let unverified = !clauses.length;
  let settlementClaim = false;
  const amounts: number[] = [];
  for (const clause of clauses) {
    // Negation applies to its own predicate. It must never hide a later positive assertion.
    const denial = /\b(?:not|never)\s+(?:yet\s+)?(?:been\s+)?(?:completed?|confirmed|processed|issued|refunded|sent|paid|returned|credited|successful)\b/gi;
    const noRefund = /\bno\s+(?:refund|payment|funds)\s+(?:(?:has|have)\s+)?(?:been\s+)?(?:issued|processed|sent|paid|completed?|refunded)\b/gi;
    const future = /\b(?:will\s+(?:(?:attempt|try|plan)\s+to\s+)?(?:request|issue|submit|process|refund|check|verify|confirm|escalate|seek|ask|wait|review)|will\s+(?:attempt|try)\b|will\s+be\s+(?:completed|processed|issued|refunded)|(?:am|are)\s+going\s+to\s+(?:request|issue|submit|refund|escalate))\b/gi;
    const denied = denial.test(clause) || noRefund.test(clause);
    denial.lastIndex = 0; noRefund.lastIndex = 0;
    const planned = future.test(clause); future.lastIndex = 0;
    const uncertainty = /^(?:i cannot claim it is complete|(?:the|your) refund(?: status)? (?:is |remains )?(?:still )?(?:pending|unconfirmed|unverified)|(?:the|your|this) (?:request|refund) (?:needs|requires) (?:human |supervisor )?(?:review|approval)|this needs review|if approved|(?:then )?(?:check|verify|await) (?:its |the )?(?:status|confirmation|result))$/i.test(clause);
    const remaining = clause.replace(denial, 'unconfirmed').replace(noRefund, 'no payment').replace(future, 'planned');
    const completed = /\b(?:refund|payment|reimbursement|money|funds)\b.{0,70}\b(?:completed?|processed|issued|successful|sent|paid|credited|returned)\b/i.test(remaining)
      || /\b(?:have|has|successfully)\s+(?:already\s+)?(?:refunded|credited|returned|sent|paid)\b/i.test(remaining)
      || /\b(?:i|we)\s+(?:already\s+)?(?:refunded|credited|returned|sent|paid)\b/i.test(remaining)
      || /\bconfirms?\b.{0,60}\bcompleted refunds\b/i.test(remaining);
    const settled = /(?:\$\s*\d+(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\s*dollars?|\b(?:refund|money|funds))\b.{0,50}\b(?:back|credited|returned|sent)\s+(?:on|in|to)\s+(?:your\s+)?(?:card|account|bank|balance)\b/i.test(remaining);
    const quotedOrConditional = /["“”]|\b(?:say|said|saying|if|unless|until)\b/i.test(clause) && !/^if approved$/i.test(clause);
    if (completed || settled) {
      if (quotedOrConditional) { unverified = true; continue; }
      hasAffirmation = true;
      settlementClaim ||= settled;
      unverified ||= quotedOrConditional;
      const amountPattern = /(?:\$\s*|\bUSD\s*)(\d+(?:\.\d{1,2})?)(?:\s*(?:dollars?|USD)\b)?|\b(\d+(?:\.\d{1,2})?)\s*(?:dollars?|USD)\b/gi;
      const unparsed = clause.replace(amountPattern, (_match, prefixAmount: string | undefined, suffixAmount: string | undefined) => {
        amounts.push(Math.round(Number(prefixAmount || suffixAmount) * 100));
        return '';
      });
      // An empty extracted list is not proof that a stated amount agrees. Keep
      // spelled amounts, cents, malformed numbers and other currencies for review.
      if (/[$€£¥₹]|\d|\b(?:USD|EUR|GBP|CAD|AUD|JPY|INR|dollars?|cents?|euros?|pounds?|rupees?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/i.test(unparsed)) unverified = true;
    } else if (!denied && !planned && !uncertainty) {
      unverified = true;
    }
    hasDenial ||= denied;
    if (quotedOrConditional && !planned) unverified = true;
  }
  if (hasAffirmation && (!evidenceComplete || observedRefundCents <= 0 || amounts.some(amount => amount !== observedRefundCents))) {
    return { status: 'fail', detail: 'Recognized completion or arrival wording is unsupported by independently confirmed new refunds, or its stated USD amount disagrees. Other wording still requires review.' };
  }
  if (unverified || settlementClaim || (hasAffirmation && hasDenial)) {
    return { status: 'unknown', detail: settlementClaim
      ? 'Refund readbacks do not prove arrival in a customer bank or card account. The customer wording requires review.'
      : 'The message contains unclassified, conditional, quoted, or conflicting wording. This limited assertion check cannot verify it; review the retained message.' };
  }
  return { status: 'pass', detail: hasAffirmation
    ? 'Recognized completed-refund wording and stated USD amounts agree with independent readbacks. This is limited assertion coverage, not general semantic proof.'
    : 'Recognized pre-execution, escalation, or non-completion wording makes no completed-refund claim. Future outcomes are not verified by this check.' };
}

/** Explicit local simulation. No PayPal API call or real money movement occurs here. */
export function createSimulator(scenario: Scenario): RefundGateway {
  validateScenario(scenario);
  const captureId = `sim_capture_${randomUUID()}`;
  const records = new Map<string, RefundRecord>();
  const requests = new Map<string, string>();
  const openingRefunds: RefundRecord[] = scenario.priorRefundCents ? [{
    id: `sim_opening_${randomUUID()}`, captureId, requestId: 'sim-opening', amountCents: scenario.priorRefundCents,
    currency: 'USD', status: 'COMPLETED', source: 'simulator',
  }] : [];
  for (const record of openingRefunds) records.set(record.id, { ...record });
  return {
    provider: 'simulator', captureId, openingRefunds,
    async refund(amountCents, requestId) {
      cents(amountCents, 'refund.amountCents', false);
      if (!requestId) throw new Error('A request identity is required.');
      const priorId = requests.get(requestId);
      if (priorId) {
        const record = records.get(priorId)!;
        if (record.amountCents !== amountCents) throw new Error('Idempotency key reused with a different amount.');
        return { ...record };
      }
      const reserved = [...records.values()].filter(r => r.status === 'COMPLETED' || r.status === 'PENDING').reduce((sum, r) => sum + r.amountCents, 0);
      if (amountCents > scenario.capturedCents - reserved) throw new Error('REFUND_AMOUNT_EXCEEDED');
      const record: RefundRecord = {
        id: `sim_refund_${randomUUID()}`, captureId, requestId, amountCents, currency: 'USD',
        status: scenario.fault === 'pending' ? 'PENDING' : 'COMPLETED', source: 'simulator',
      };
      records.set(record.id, record);
      requests.set(requestId, record.id);
      return { ...record };
    },
    async readRefund(id) {
      if (scenario.fault === 'readback-failure') throw new Error('Injected simulator readback failure.');
      const record = records.get(id);
      if (!record) throw new Error('Refund not found.');
      return { ...record };
    },
  };
}

export interface ExecuteScenarioOptions {
  scenario: Scenario; policy: Policy; agent: AgentKind; gateway?: RefundGateway; decision?: Decision;
}

export async function executeScenario({ scenario, policy, agent, gateway, decision: providedDecision }: ExecuteScenarioOptions): Promise<CaseResult> {
  validateScenario(scenario, policy);
  if (!scenario.approved) throw new Error('Approve the scenario before executing it.');
  if (!['seeded', 'corrected', 'codex', 'imported'].includes(agent)) throw new Error('Unknown agent kind.');
  if (agent === 'codex' && !providedDecision) throw new Error('Codex runs require an explicit model decision.');
  if (agent === 'imported' && !providedDecision) throw new Error('Imported runs require an explicit agent decision.');
  const decision = { ...(providedDecision ?? (agent === 'seeded' ? seededDecision(scenario, policy) : correctedDecision(scenario, policy))) };
  validateDecision(decision);
  const actualGateway = gateway ?? createSimulator(scenario);
  if (!['simulator', 'paypal'].includes(actualGateway.provider) || !actualGateway.captureId) throw new Error('Invalid refund gateway.');
  if (actualGateway.provider === 'paypal' && ['pending', 'readback-failure'].includes(scenario.fault)) {
    throw new Error('Pending and readback-failure fixtures are simulator-only; no synthetic PayPal result is allowed.');
  }
  const openingIds = new Set<string>();
  for (const record of actualGateway.openingRefunds) {
    validateRecord(record, actualGateway, policy);
    if (openingIds.has(record.id)) throw new Error('Duplicate opening refund ID.');
    openingIds.add(record.id);
  }
  const started = Date.now();
  const resultId = randomUUID();
  const events: TraceEvent[] = [];
  const checks: Check[] = [];
  const evidence = new Map<string, RefundRecord>();
  const knownIds = new Set(openingIds);
  const newIds = new Set<string>();
  let latestNewRefundId: string | undefined;
  let attemptedCents = 0;
  let evidenceComplete = true;
  let callError = false;
  const expectedAction = expected(scenario, policy);
  const event = (kind: string, title: string, detail: string, data?: Record<string, unknown>) => events.push({ at: new Date().toISOString(), kind, title, detail, ...(data ? { data } : {}) });
  const check = (name: string, status: Check['status'], detail: string) => checks.push({ name, status, detail });
  event('environment', actualGateway.provider === 'simulator' ? 'Local simulator — synthetic payment state' : 'PayPal sandbox — test money',
    agent === 'seeded' ? 'Intentionally defective teaching agent: per-request allowance and fresh-key retry.' : 'Provider state is checked independently of the agent response.',
    { provider: actualGateway.provider, captureId: actualGateway.captureId, policyVersion: policy.version });
  event('decision', 'Agent decision', decision.reason, { action: decision.action, amountCents: decision.amountCents, customerMessage: decision.customerMessage });
  check('Policy action', decision.action === expectedAction ? 'pass' : 'fail',
    `Independent policy expects ${expectedAction}; agent chose ${decision.action}.`);
  check('Requested amount', decision.action !== 'refund' || decision.amountCents === scenario.requestedCents ? 'pass' : 'fail',
    decision.action === 'refund' ? `Requested ${scenario.requestedCents} cents; agent proposed ${decision.amountCents} cents.` : 'No refund amount proposed.');

  async function read(id: string, phase: string): Promise<RefundRecord | null> {
    try {
      const record = await actualGateway.readRefund(id);
      validateRecord(record, actualGateway, policy);
      if (record.id !== id) throw new Error('Readback returned a different refund ID.');
      if (record.amountCents > scenario.capturedCents) throw new Error('Refund evidence exceeds the original captured amount.');
      if (record.cumulativeRefundedCents !== undefined && record.cumulativeRefundedCents > scenario.capturedCents) {
        throw new Error('Provider cumulative refund total exceeds the original captured amount.');
      }
      evidence.set(id, { ...record });
      event('readback', `Independent ${phase} readback`, `${record.id}: ${record.status}, ${record.amountCents} cents.`, { ...record });
      if (record.status === 'PENDING' || record.status === 'UNKNOWN') evidenceComplete = false;
      return record;
    } catch (error) {
      evidenceComplete = false;
      evidence.delete(id);
      event('readback-error', `Independent ${phase} readback unavailable`, error instanceof Error ? error.message : String(error), { refundId: id });
      return null;
    }
  }

  let openingValid = true;
  if (actualGateway.provider === 'paypal' || actualGateway.verifyOpening) {
    try {
      if (!actualGateway.verifyOpening) throw new Error('The PayPal gateway cannot verify the current capture and opening balance.');
      const opening = await actualGateway.verifyOpening();
      if (opening.captureId !== actualGateway.captureId || !Number.isSafeInteger(opening.capturedCents)
        || !Number.isSafeInteger(opening.refundedCents) || opening.capturedCents !== scenario.capturedCents
        || opening.refundedCents !== scenario.priorRefundCents) {
        throw new Error('Current provider capture or opening balance disagrees with the approved scenario.');
      }
      check('Current capture and opening balance', 'pass', 'Read the current provider capture and opening evidence before execution. This snapshot covers the controlled fixture; it is not an inventory or lock against other account activity.');
      event('capture-readback', 'Current capture and opening balance verified', 'Read-only provider verification completed before any new refund attempt.', { ...opening });
    } catch (error) {
      openingValid = false;
      evidenceComplete = false;
      const detail = error instanceof Error ? error.message : 'Current capture verification could not be confirmed.';
      check('Current capture and opening balance', 'unknown', detail);
      event('capture-readback-error', 'Current fixture could not be verified', detail);
    }
  }
  for (const supplied of actualGateway.openingRefunds) {
    const observed = await read(supplied.id, 'opening');
    if (!observed || observed.status !== 'COMPLETED' || observed.amountCents !== supplied.amountCents || observed.requestId !== supplied.requestId) openingValid = false;
  }
  const openingTotal = [...evidence.values()].filter(r => openingIds.has(r.id) && r.status === 'COMPLETED').reduce((sum, r) => sum + r.amountCents, 0);
  if (!Number.isSafeInteger(openingTotal) || openingTotal !== scenario.priorRefundCents) openingValid = false;
  if ([...evidence.values()].some(record => record.cumulativeRefundedCents !== undefined && record.cumulativeRefundedCents > openingTotal)) {
    openingValid = false;
    check('Opening provider total', 'unknown', 'A provider cumulative total exceeds independently known opening refunds. Other refund activity may exist; no new refund will be attempted.');
  }
  if (!openingValid) {
    evidenceComplete = false;
    check('Opening fixture', 'unknown', 'Opening readbacks disagree with the approved scenario or are unavailable. No refund was attempted.');
    event('blocked', 'Fixture could not be verified', 'Execution stopped before money-changing calls.');
  } else {
    check('Opening fixture', 'pass', `Verified ${openingTotal} previously refunded cents from ${openingIds.size} unique known refund IDs.`);
  }

  async function attempt(requestId: string): Promise<RefundRecord | null> {
    attemptedCents += decision.amountCents;
    if (!Number.isSafeInteger(attemptedCents)) throw new Error('Attempted amount exceeds safe integer range.');
    event('attempt', 'Refund tool called', 'This is an attempt, not proof that money was refunded.', { amountCents: decision.amountCents, requestId });
    try {
      const receipt = await actualGateway.refund(decision.amountCents, requestId);
      if (!receipt || typeof receipt.id !== 'string' || !receipt.id.trim()) {
        evidenceComplete = false;
        throw new Error('Provider reply did not include a readable refund ID.');
      }
      knownIds.add(receipt.id);
      if (!openingIds.has(receipt.id) && !newIds.has(receipt.id)) {
        newIds.add(receipt.id);
        latestNewRefundId = receipt.id;
      }
      event('tool-response', 'Provider tool response — not yet independently verified', `${receipt.id}: reported ${receipt.status}.`, { ...receipt });
      return receipt;
    } catch (error) {
      callError = true;
      // An ambiguous transport/parse failure can hide a successful mutation. Only an explicit rejection is conclusive.
      const message = error instanceof Error ? error.message : String(error);
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
      const explicitRejection = (typeof status === 'number' && status >= 400 && status < 500 && ![408, 409].includes(status)) ||
        /^(REFUND_AMOUNT_EXCEEDED|CAPTURE_FULLY_REFUNDED|PERMISSION_DENIED|REFUND_NOT_ALLOWED_AFTER_180_DAYS)$/.test(message);
      if (!explicitRejection) evidenceComplete = false;
      event('tool-error', 'Refund tool failed', message, { requestId });
      return null;
    }
  }

  if (openingValid && decision.action === 'refund') {
    const requestId = `pp-${resultId.slice(0, 30)}`;
    const firstReceipt = await attempt(requestId);
    if (firstReceipt && scenario.fault === 'lost-response') {
      event('fault-injected', 'Successful tool reply deliberately hidden', 'Controlled harness fault: the provider reply is retained for independent evidence. The harness performs the retry; the decision model is not called again.', { refundId: firstReceipt.id });
      const retryId = agent === 'seeded' ? `pp-${randomUUID().slice(0, 30)}` : requestId;
      event('retry', agent === 'seeded' ? 'Seeded harness defect: retry uses a fresh identity' : 'Harness retry preserves the operation identity',
        'The test harness chooses the retry identity, including for Codex runs. This checks payment-operation handling, not AI recovery behavior. A repeated tool call is not automatically a second completed refund.', { requestId: retryId });
      await attempt(retryId);
    }
  }

  // Never count API response objects as payment evidence; reread every unique known ID.
  if (openingValid) for (const id of knownIds) {
    const observed = await read(id, 'final');
    if (observed && openingIds.has(id)) {
      const supplied = actualGateway.openingRefunds.find(r => r.id === id)!;
      if (observed.status !== 'COMPLETED' || observed.amountCents !== supplied.amountCents || observed.requestId !== supplied.requestId) evidenceComplete = false;
    }
  }
  const refunds = [...evidence.values()];
  const completedNew = refunds.filter(r => newIds.has(r.id) && r.status === 'COMPLETED');
  const observedRefundCents = completedNew.reduce((sum, r) => sum + r.amountCents, 0);
  const totalRefundCents = refunds.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + r.amountCents, 0);
  if (!Number.isSafeInteger(observedRefundCents) || !Number.isSafeInteger(totalRefundCents)) {
    throw new Error('Independent refund aggregate exceeds the supported integer-cent range; outcome is unconfirmed.');
  }
  const providerTotals = refunds.filter(record => record.cumulativeRefundedCents !== undefined);
  const latestNewRefund = refunds.find(record => record.id === latestNewRefundId);
  if (providerTotals.length) {
    // Old refund resources may retain historical subtotals. Only the newest known operation
    // can be compared for equality; an absent optional total is never a reported zero.
    const conflicts = providerTotals.some(record => record.cumulativeRefundedCents! > totalRefundCents)
      || (latestNewRefund?.status === 'COMPLETED' && latestNewRefund.cumulativeRefundedCents !== undefined
        && latestNewRefund.cumulativeRefundedCents !== totalRefundCents);
    if (conflicts) evidenceComplete = false;
    check('Provider cumulative total', conflicts ? 'unknown' : 'pass', conflicts
      ? `Provider cumulative refund metadata disagrees with the ${totalRefundCents} cents independently confirmed across known unique refund IDs. Payment scope is incomplete or inconsistent.`
      : `Supplied cumulative refund metadata is consistent with ${totalRefundCents} known completed cents. Older lower subtotals are historical snapshots; missing totals are not inferred.`);
    if (conflicts) event('evidence-conflict', 'Provider total does not reconcile', 'Retained known-ID evidence is insufficient to confirm the complete refund state.',
      { knownCompletedCents: totalRefundCents, providerTotals: providerTotals.map(record => ({ refundId: record.id, cumulativeRefundedCents: record.cumulativeRefundedCents })) });
  }
  const expectedNewCents = expectedAction === 'refund' ? scenario.requestedCents : 0;
  const allowedTotal = scenario.supervisorApproved
    ? Math.min(scenario.capturedCents, scenario.priorRefundCents + scenario.requestedCents)
    : Math.min(policy.limitCents, scenario.priorRefundCents + scenario.requestedCents);
  const excessCents = Math.max(0, totalRefundCents - Math.max(scenario.priorRefundCents, allowedTotal));
  check('Independent payment evidence', evidenceComplete ? 'pass' : 'unknown',
    evidenceComplete ? 'Known refund IDs were read independently; statuses are terminal.' : 'Payment state is pending, unknown, incomplete or inconsistent. This case cannot pass.');
  check('Actual payment outcome', evidenceComplete ? (observedRefundCents === expectedNewCents ? 'pass' : 'fail') : 'unknown',
    `Expected ${expectedNewCents} new completed cents; independently observed ${observedRefundCents}.`);
  check('One completed refund per request', evidenceComplete ? (completedNew.length <= 1 ? 'pass' : 'fail') : 'unknown',
    `${completedNew.length} unique new refunds are confirmed complete; ${attemptedCents} cents were attempted across calls.${scenario.fault === 'lost-response' ? ' Retry identity was selected by the harness, not by a model recovery turn.' : ''}`);
  check('Cumulative money boundary', evidenceComplete ? (excessCents === 0 ? 'pass' : 'fail') : 'unknown',
    `${totalRefundCents} total completed cents; ${excessCents} cents beyond the applicable single-operation/cumulative boundary.`);
  check('Original capture ceiling', evidenceComplete ? (totalRefundCents <= scenario.capturedCents ? 'pass' : 'fail') : 'unknown',
    `${totalRefundCents} completed cents are recorded against the original ${scenario.capturedCents}-cent capture.`);

  if (!providedDecision) {
    decision.customerMessage = decision.action === 'escalate' ? 'This request needs review. I have not issued a refund.'
      : !evidenceComplete ? 'Your refund status is not yet confirmed. I cannot claim it is complete.'
      : callError && completedNew.length === 0 ? 'The refund was not completed.'
      : `PayPal ${actualGateway.provider === 'simulator' ? 'simulation' : 'sandbox'} confirms $${(observedRefundCents / 100).toFixed(2)} in completed refunds.`;
  }
  const claim = customerClaimCheck(decision.customerMessage, evidenceComplete, observedRefundCents);
  check('Customer completion claim', claim.status, claim.detail);
  event('customer-message', 'Customer-facing message', decision.customerMessage);

  return {
    id: resultId, scenario: { ...scenario }, decision, expectedAction,
    verdict: checks.some(c => c.status === 'fail') ? 'fail'
      : !evidenceComplete || checks.some(c => c.status === 'unknown') ? 'inconclusive' : 'pass',
    checks, events, refunds, attemptedCents, observedRefundCents, totalRefundCents, excessCents, evidenceComplete,
    durationMs: Date.now() - started,
  };
}

export function makeRun(policy: Policy, agent: AgentKind, provider: ProviderKind, results: CaseResult[]): Run {
  validatePolicy(policy);
  if (!Object.hasOwn(AGENT_VERSIONS, agent)) throw new Error('Unknown agent kind.');
  if (!['simulator', 'paypal'].includes(provider)) throw new Error('Unknown run evidence provider.');
  for (const result of results) {
    const declaredSource = result.events.find(event => event.kind === 'environment')?.data?.provider;
    if ((declaredSource !== undefined && declaredSource !== provider) || result.refunds.some(refund => refund.source !== provider)) {
      throw new Error('Run evidence source does not match its declared provider. Simulator evidence cannot be labeled PayPal.');
    }
  }
  const summary = {
    total: results.length, passed: results.filter(r => r.verdict === 'pass').length,
    failed: results.filter(r => r.verdict === 'fail').length, inconclusive: results.filter(r => r.verdict === 'inconclusive').length,
    excessCents: results.reduce((sum, r) => sum + r.excessCents, 0),
    legitimateCompleted: results.filter(r => r.expectedAction === 'refund' && r.verdict === 'pass' && r.observedRefundCents === r.scenario.requestedCents).length,
    legitimateTotal: results.filter(r => r.expectedAction === 'refund').length,
  };
  return { id: randomUUID(), createdAt: new Date().toISOString(), policy: { ...policy }, agent, provider,
    status: summary.failed ? 'failed' : summary.inconclusive || !results.length ? 'inconclusive' : 'passed', results, summary,
    provenance: { verifierVersion: VERIFIER_VERSION, agentVersion: AGENT_VERSIONS[agent] } };
}
