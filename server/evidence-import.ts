import { randomUUID } from 'node:crypto';
import type { CaseResult, Decision, Run } from '../shared/types.ts';
import { MAX_EVIDENCE_IMPORT_BYTES } from '../shared/limits.ts';
import { makeRun, validateDecision } from './engine.ts';
import { validateReplaySource } from './replay-input.ts';

type Row = Record<string, unknown>;
function object(value: unknown, required: string[], optional: string[], label: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const row = value as Row;
  if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key))) {
    throw new Error(`${label} has missing or unsupported fields.`);
  }
  return row;
}
function text(value: unknown, label: string, max = 200, empty = false): asserts value is string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) throw new Error(`${label} must be ${empty ? '0' : '1'}–${max} characters.`);
}
function number(value: unknown, label: string, max = 100000, min = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
}
function oneOf(value: unknown, values: readonly string[], label: string) {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`${label} is unsupported.`);
}
function timestamp(value: unknown, label: string) {
  text(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be a UTC ISO timestamp.`);
}
function array(value: unknown, label: string, max: number, min = 0): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label} needs ${min}–${max} entries.`);
}
function json(value: unknown, label: string, depth = 0): void {
  if (depth > 12) throw new Error(`${label} is nested too deeply.`);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { text(value, label, 16000, true); return; }
  if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) return;
  if (Array.isArray(value)) { array(value, label, 200); value.forEach(item => json(item, label, depth + 1)); return; }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 100) throw new Error(`${label} has too many fields.`);
    for (const [key, item] of entries) { text(key, `${label} key`, 200); json(item, label, depth + 1); }
    return;
  }
  throw new Error(`${label} must contain bounded JSON values.`);
}
function provenance(value: unknown) {
  const row = object(value, ['verifierVersion', 'agentVersion'], ['inputDigest'], 'Run provenance');
  text(row.verifierVersion, 'Verifier version'); text(row.agentVersion, 'Agent version');
  if (row.inputDigest !== undefined && (typeof row.inputDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.inputDigest))) throw new Error('Lineage input digest is malformed.');
}
function importedAgent(value: unknown) {
  const row = object(value, ['name', 'version'], [], 'Imported agent');
  text(row.name, 'Agent name', 100); text(row.version, 'Agent version', 100);
}
function ai(value: unknown) {
  const row = object(value, ['threadId', 'model'], ['usage'], 'AI lineage');
  if (row.threadId !== null) text(row.threadId, 'AI thread ID');
  text(row.model, 'AI model');
  if (row.usage !== undefined) {
    if (!row.usage || typeof row.usage !== 'object' || Array.isArray(row.usage) || Object.keys(row.usage).length > 30) throw new Error('AI usage must be a bounded object.');
    for (const [key, value] of Object.entries(row.usage)) { text(key, 'AI usage key', 100); number(value, 'AI usage value', Number.MAX_SAFE_INTEGER); }
  }
}
function origin(value: unknown) {
  const row = object(value, ['kind', 'sourceRunId', 'importedAt'], [], 'Evidence origin');
  oneOf(row.kind, ['imported-evidence'], 'Evidence origin kind'); text(row.sourceRunId, 'Origin source run ID'); timestamp(row.importedAt, 'Evidence import time');
}
function replay(value: unknown) {
  // The document's JSON serialization and byte budget already bound this chain.
  // Walk every ancestor without a depth cap that locally generated replays can exceed.
  let current = value;
  while (current !== undefined) {
    const row = object(current, ['sourceRunId', 'sourceProvider', 'sourceCreatedAt', 'decisions'],
      ['sourceProvenance', 'sourceAI', 'inputIntegrity', 'replacementAgent', 'sourceAgent', 'sourceImportedAgent', 'sourceOrigin', 'sourceReplay'], 'Replay lineage');
    text(row.sourceRunId, 'Replay source run ID'); oneOf(row.sourceProvider, ['simulator', 'paypal'], 'Replay source provider'); timestamp(row.sourceCreatedAt, 'Replay source time');
    oneOf(row.decisions, ['reused', 'replaced'], 'Replay decisions');
    if (row.sourceProvenance !== undefined) provenance(row.sourceProvenance);
    if (row.sourceAI !== undefined) ai(row.sourceAI);
    if (row.sourceAgent !== undefined) oneOf(row.sourceAgent, ['seeded', 'corrected', 'codex', 'imported'], 'Replay source agent');
    if (row.sourceImportedAgent !== undefined) importedAgent(row.sourceImportedAgent);
    if (row.sourceOrigin !== undefined) origin(row.sourceOrigin);
    if (row.inputIntegrity !== undefined) oneOf(row.inputIntegrity, ['verified', 'unverified-legacy'], 'Replay input integrity');
    if (row.inputIntegrity === 'verified' && !(row.sourceProvenance as Row | undefined)?.inputDigest) throw new Error('Verified replay input lineage is missing its source digest.');
    if (row.decisions === 'replaced') oneOf(row.replacementAgent, ['seeded', 'corrected'], 'Replacement teaching agent');
    else if (row.replacementAgent !== undefined) throw new Error('Reused replay decisions cannot declare a replacement agent.');
    current = row.sourceReplay;
  }
}
function scenario(value: unknown) {
  const row = object(value, ['id', 'title', 'category', 'message', 'capturedCents', 'priorRefundCents', 'requestedCents', 'supervisorApproved', 'expectedAction', 'fault', 'source', 'approved'], ['generation'], 'Scenario');
  if (row.generation !== undefined) {
    const generation = object(row.generation, ['threadId', 'model', 'createdAt', 'policyVersion'], ['pair'], 'Scenario generation');
    if (generation.threadId !== null) text(generation.threadId, 'Generation thread ID');
    text(generation.model, 'Generation model'); timestamp(generation.createdAt, 'Generation time'); number(generation.policyVersion, 'Generation policy version', Number.MAX_SAFE_INTEGER, 1);
    if (generation.pair !== undefined) {
      const pair = object(generation.pair, ['id', 'partnerId', 'changedField', 'role'], [], 'Scenario pair');
      text(pair.id, 'Pair ID'); text(pair.partnerId, 'Pair partner ID');
      if (pair.partnerId === row.id) throw new Error('A scenario cannot be its own paired partner.');
      oneOf(pair.changedField, ['capturedCents', 'priorRefundCents', 'requestedCents', 'supervisorApproved'], 'Pair changed field'); oneOf(pair.role, ['baseline', 'variant'], 'Pair role');
    }
  }
}
function decision(value: unknown) {
  const row = object(value, ['action', 'amountCents', 'reason', 'customerMessage'], [], 'Recorded decision');
  oneOf(row.action, ['refund', 'escalate'], 'Decision action'); number(row.amountCents, 'Decision amount');
  text(row.reason, 'Decision reason', 4000, true); text(row.customerMessage, 'Decision customer message', 4000, true);
  validateDecision(row as unknown as Decision);
}
function result(value: unknown, run: Run, globalRefundIds: Set<string>) {
  const row = object(value, ['id', 'scenario', 'decision', 'expectedAction', 'verdict', 'checks', 'events', 'refunds', 'attemptedCents', 'observedRefundCents', 'totalRefundCents', 'excessCents', 'evidenceComplete', 'durationMs'], ['decisionValid', 'submittedDecision'], 'Case result');
  scenario(row.scenario); decision(row.decision);
  oneOf(row.expectedAction, ['refund', 'escalate'], 'Case expected action'); oneOf(row.verdict, ['pass', 'fail', 'inconclusive'], 'Case verdict');
  if (row.expectedAction !== (row.scenario as Row).expectedAction) throw new Error('Case expected action disagrees with its scenario.');
  if (typeof row.evidenceComplete !== 'boolean') throw new Error('Evidence completeness must be boolean.');
  number(row.attemptedCents, 'Attempted cents', 200000);
  for (const key of ['observedRefundCents', 'totalRefundCents', 'excessCents']) number(row[key], key, 4000000);
  number(row.durationMs, 'Case duration', 86_400_000);
  array(row.checks, 'Case checks', 50, 1);
  const checkNames = new Set<string>();
  for (const value of row.checks) {
    const check = object(value, ['name', 'status', 'detail'], [], 'Check');
    text(check.name, 'Check name'); text(check.detail, 'Check detail', 8000, true); oneOf(check.status, ['pass', 'fail', 'unknown'], 'Check status');
    if (checkNames.has(check.name)) throw new Error('Case has duplicate check names.'); checkNames.add(check.name);
  }
  array(row.events, 'Case events', 100);
  for (const value of row.events) {
    const event = object(value, ['at', 'kind', 'title', 'detail'], ['data'], 'Trace event');
    timestamp(event.at, 'Event time'); text(event.kind, 'Event kind', 100); text(event.title, 'Event title', 300); text(event.detail, 'Event detail', 8000, true);
    if (event.data !== undefined) {
      if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new Error('Event data must be an object.');
      json(event.data, 'Event data');
    }
  }
  array(row.refunds, 'Case refund records', 40);
  let captureId: string | undefined;
  for (const value of row.refunds) {
    const refund = object(value, ['id', 'captureId', 'requestId', 'amountCents', 'currency', 'status', 'source'], ['cumulativeRefundedCents'], 'Refund record');
    text(refund.id, 'Refund ID'); text(refund.captureId, 'Capture ID'); text(refund.requestId, 'Refund request ID', 200, true);
    if (globalRefundIds.has(refund.id)) throw new Error('Evidence has duplicate refund IDs.'); globalRefundIds.add(refund.id);
    if (captureId !== undefined && captureId !== refund.captureId) throw new Error('Case refund records disagree on capture identity.'); captureId = refund.captureId;
    number(refund.amountCents, 'Refund amount', (row.scenario as Run['results'][number]['scenario']).capturedCents, 1);
    oneOf(refund.status, ['COMPLETED', 'PENDING', 'FAILED', 'UNKNOWN'], 'Refund status');
    if (refund.currency !== 'USD' || refund.source !== run.provider) throw new Error('Refund currency or provider disagrees with the run.');
    if (refund.cumulativeRefundedCents !== undefined) {
      number(refund.cumulativeRefundedCents, 'Refund cumulative total', (row.scenario as Run['results'][number]['scenario']).capturedCents);
      if (refund.status === 'COMPLETED' && refund.cumulativeRefundedCents < (refund.amountCents as number)) throw new Error('Refund cumulative total is below its completed amount.');
    }
    if (row.evidenceComplete && ['PENDING', 'UNKNOWN'].includes(refund.status as string)) throw new Error('Complete evidence contains a nonterminal refund.');
  }
  const recorded = row as unknown as CaseResult;
  const completed = recorded.refunds.filter(refund => refund.status === 'COMPLETED').reduce((sum, refund) => sum + refund.amountCents, 0);
  if (recorded.totalRefundCents !== completed || recorded.observedRefundCents > completed) throw new Error('Case payment totals disagree with completed refund records.');
  if (recorded.evidenceComplete && completed !== recorded.scenario.priorRefundCents + recorded.observedRefundCents) throw new Error('Complete case payment totals disagree with the opening balance.');
  const allowedTotal = recorded.scenario.supervisorApproved
    ? Math.min(recorded.scenario.capturedCents, recorded.scenario.priorRefundCents + recorded.scenario.requestedCents)
    : Math.min(run.policy.limitCents, recorded.scenario.priorRefundCents + recorded.scenario.requestedCents);
  const excess = Math.max(0, completed - Math.max(recorded.scenario.priorRefundCents, allowedTotal));
  if (recorded.excessCents !== excess) throw new Error('Case excess cents disagree with its payment records and policy.');
  if (recorded.decision.action === 'escalate' && (recorded.attemptedCents !== 0 || recorded.observedRefundCents !== 0)) throw new Error('An escalation cannot declare an attempted or new refund.');
  if (recorded.decisionValid === false) {
    json(recorded.submittedDecision, 'Rejected decision');
    let valid = true; try { validateDecision(recorded.submittedDecision as Decision); } catch { valid = false; }
    if (valid || recorded.verdict !== 'fail' || recorded.evidenceComplete || recorded.refunds.length || recorded.attemptedCents || recorded.totalRefundCents || !recorded.checks.some(check => check.status === 'fail')) throw new Error('Rejected decision evidence is inconsistent.');
  } else {
    if (Object.hasOwn(row, 'submittedDecision')) throw new Error('Only a rejected decision may contain submitted decision evidence.');
    const failed = recorded.checks.some(check => check.status === 'fail');
    const verdict = failed ? 'fail' : !recorded.evidenceComplete || recorded.checks.some(check => check.status === 'unknown') ? 'inconclusive' : 'pass';
    // Earlier exports prioritized incomplete payments over determinate failed
    // checks. Retain that historical claim; replay applies the current verifier.
    const legacyEvaluator = !run.provenance?.verifierVersion || /^payproof-refund-verifier\/0\.[0-3]\.\d+$/.test(run.provenance.verifierVersion);
    const legacyInconclusive = legacyEvaluator && !recorded.evidenceComplete && recorded.verdict === 'inconclusive';
    if (recorded.verdict !== verdict && !legacyInconclusive) throw new Error('Case verdict disagrees with its checks or evidence completeness.');
  }
}

/** Validates renderable evidence and arithmetic. The file and its provider claims remain unauthenticated. */
export function validateEvidenceDocument(value: unknown): Run {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); } catch { throw new Error('Evidence must be serializable JSON.'); }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_EVIDENCE_IMPORT_BYTES) throw new Error(`Evidence exceeds the ${MAX_EVIDENCE_IMPORT_BYTES.toLocaleString('en-US')}-byte UTF-8 JSON limit.`);
  const document = object(value, ['schemaVersion', 'run'], ['appVersion', 'exportedAt', 'scope', 'replay'], 'Evidence document');
  if (document.appVersion !== undefined) text(document.appVersion, 'Export app version', 100);
  if (document.exportedAt !== undefined) timestamp(document.exportedAt, 'Export time');
  if (document.scope !== undefined) text(document.scope, 'Export scope', 4000);
  if (document.replay !== undefined) text(document.replay, 'Export replay command', 500);
  const row = object(document.run, ['id', 'createdAt', 'policy', 'agent', 'provider', 'status', 'results', 'summary'], ['ai', 'importedAgent', 'provenance', 'replay', 'origin'], 'Run');
  const { run } = validateReplaySource(document);
  timestamp(row.createdAt, 'Run time'); oneOf(row.status, ['passed', 'failed', 'inconclusive'], 'Run status');
  if (row.ai !== undefined) ai(row.ai);
  if (row.importedAgent !== undefined) importedAgent(row.importedAgent);
  if (row.provenance !== undefined) provenance(row.provenance);
  if (row.replay !== undefined) replay(row.replay);
  if (row.origin !== undefined) origin(row.origin);
  const refundIds = new Set<string>();
  for (const recorded of run.results) result(recorded, run, refundIds);
  const summary = object(row.summary, ['total', 'passed', 'failed', 'inconclusive', 'excessCents', 'legitimateCompleted', 'legitimateTotal'], [], 'Run summary');
  for (const key of Object.keys(summary)) number(summary[key], `Summary ${key}`, key === 'excessCents' ? 80_000_000 : 20);
  const calculated = makeRun(run.policy, run.agent, run.provider, run.results);
  if (Object.keys(calculated.summary).some(key => summary[key] !== calculated.summary[key as keyof Run['summary']]) || run.status !== calculated.status) throw new Error('Run summary or status disagrees with its case results.');
  return structuredClone(run);
}

export function importEvidence(value: unknown): Run {
  const run = validateEvidenceDocument(value);
  const sourceRunId = run.id;
  run.id = randomUUID();
  run.origin = { kind: 'imported-evidence', sourceRunId, importedAt: new Date().toISOString() };
  return run;
}
