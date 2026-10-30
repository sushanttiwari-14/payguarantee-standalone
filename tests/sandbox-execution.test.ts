import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SandboxExecution, unfinishedSandboxCase } from '../server/sandbox-execution.ts';
import { Store } from '../server/store.ts';
import { createEvaluationExport, createAgentInput } from '../server/decision-bundle.ts';
import { validateEvidenceDocument } from '../server/evidence-import.ts';
import { executeScenario, makeRun } from '../server/engine.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';
import { correctedDecision } from '../adapters/example-agent.ts';
import type { AppState, RefundGateway, RefundRecord } from '../shared/types.ts';
import { prepareFixture } from '../server/paypal.ts';

class FaultStore extends Store {
  failWrites = false;
  override async update<T>(mutate: (state: AppState) => T | Promise<T>): Promise<T> {
    if (this.failWrites) throw new Error('Controlled disk failure');
    return super.update(mutate);
  }
}

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'payproof-execution-'));
  const file = join(dir, 'state.json');
  const store = new FaultStore(file);
  const scenario = structuredClone(curatedScenarios.find(s => s.id === 'under-limit')!);
  const decision = correctedDecision(scenario, defaultPolicy);
  const run = makeRun(defaultPolicy, 'corrected', 'paypal', [unfinishedSandboxCase(scenario, decision, defaultPolicy)]);
  run.provenance!.inputDigest = createAgentInput(defaultPolicy, [scenario]).inputDigest;
  const fixture = { ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel'), status: 'CAPTURED' as const, captureId: 'CAPTURE-TEST' };
  await store.update(state => { state.fixtures.push(fixture); });
  const execution = await SandboxExecution.begin(store, run);
  await execution.reserveFixture(fixture.id, scenario.id);
  let refunds = 0, reads = 0;
  const records = new Map<string, RefundRecord>();
  const gateway: RefundGateway = {
    provider: 'paypal', captureId: fixture.captureId, openingRefunds: [],
    verifyOpening: async () => ({ captureId: fixture.captureId, capturedCents: scenario.capturedCents, refundedCents: 0, captureStatus: 'COMPLETED', basis: 'capture-status' }),
    refund: async (amountCents, requestId) => {
      refunds++;
      const record: RefundRecord = { id: 'REFUND-TEST', captureId: fixture.captureId, requestId, amountCents, currency: 'USD', status: 'COMPLETED', source: 'paypal' };
      records.set(record.id, record); return record;
    },
    readRefund: async id => { reads++; const record = records.get(id); assert.ok(record); return record; },
  };
  return { store, execution, gateway, run, scenario, decision, file, fixture,
    counts: () => ({ refunds, reads }), close: () => rm(dir, { recursive: true, force: true }) };
}

test('unfinished payment response survives a fresh Store with stable fixture/report links and unconfirmed totals', async () => {
  const w = await setup();
  try {
    const observed = w.execution.gateway(w.scenario.id, w.gateway);
    await observed.refund(w.scenario.requestedCents, 'original-payment-key');
    const afterRestart = await new Store(w.file).read();
    const saved = afterRestart.runs[0];
    assert.equal(saved.id, w.run.id);
    assert.equal(saved.status, 'inconclusive');
    assert.equal(saved.results[0].evidenceComplete, false);
    assert.deepEqual(saved.results[0].refunds, [], 'response objects cannot become independently verified records');
    assert.equal(afterRestart.fixtures[0].status, 'USED');
    assert.equal(afterRestart.fixtures[0].execution!.runId, saved.id);
    assert.equal(afterRestart.fixtures[0].execution!.caseId, saved.results[0].id);
    assert.equal(afterRestart.fixtures[0].execution!.recordedAt, undefined);
    assert.equal(saved.results[0].events.find(e => e.kind === 'attempt')!.data!.requestId, 'original-payment-key');
    assert.equal(saved.results[0].events.find(e => e.kind === 'tool-response')!.data!.id, 'REFUND-TEST');
    assert.deepEqual(validateEvidenceDocument(createEvaluationExport(saved)), saved);
    assert.deepEqual(w.counts(), { refunds: 1, reads: 0 }, 'reading persisted evidence makes no provider request');
  } finally { await w.close(); }
});

test('checkpoint failure before a refund blocks that call and every later provider operation even if storage recovers', async () => {
  const w = await setup();
  try {
    const observed = w.execution.gateway(w.scenario.id, w.gateway);
    w.store.failWrites = true;
    await assert.rejects(observed.refund(1000, 'never-sent'), /progress could not be saved/);
    w.store.failWrites = false;
    await assert.rejects(observed.refund(1000, 'do-not-retry'), /progress could not be saved/);
    await assert.rejects(observed.readRefund('REFUND-TEST'), /progress could not be saved/);
    await assert.rejects(observed.verifyOpening!(), /progress could not be saved/);
    assert.deepEqual(w.counts(), { refunds: 0, reads: 0 });
    assert.equal((await new Store(w.file).read()).runs[0].status, 'inconclusive');
  } finally { await w.close(); }
});

test('storage failure after provider mutation retains the pre-call identity and blocks further provider requests', async () => {
  const w = await setup();
  try {
    const observed = w.execution.gateway(w.scenario.id, { ...w.gateway, refund: async (amount, id) => {
      const response = await w.gateway.refund(amount, id); w.store.failWrites = true; return response;
    } });
    await assert.rejects(observed.refund(1000, 'committed-but-not-saved'), /progress could not be saved/);
    w.store.failWrites = false;
    await assert.rejects(observed.refund(1000, 'must-not-duplicate'), /progress could not be saved/);
    const saved = (await new Store(w.file).read()).runs[0];
    assert.equal(saved.status, 'inconclusive');
    assert.equal(saved.results[0].events.find(e => e.kind === 'attempt')!.data!.requestId, 'committed-but-not-saved');
    assert.deepEqual(w.counts(), { refunds: 1, reads: 0 });
  } finally { await w.close(); }
});

test('completed execution replaces the placeholder atomically while preserving its published run and case IDs', async () => {
  const w = await setup();
  try {
    const result = await executeScenario({ scenario: w.scenario, policy: defaultPolicy, agent: 'corrected', gateway: w.execution.gateway(w.scenario.id, w.gateway) });
    assert.equal(result.verdict, 'pass');
    await w.execution.completeCase(w.scenario.id, result);
    const saved = await w.execution.snapshot();
    assert.equal(saved.id, w.run.id); assert.equal(saved.createdAt, w.run.createdAt);
    assert.equal(saved.results[0].id, w.run.results[0].id);
    assert.equal(saved.status, 'passed'); assert.equal(saved.summary.legitimateCompleted, 1);
    assert.ok((await new Store(w.file).read()).fixtures[0].execution!.recordedAt);
    assert.deepEqual(validateEvidenceDocument(createEvaluationExport(saved)), saved);
  } finally { await w.close(); }
});

test('an unexpected runner exception preserves known provider IDs and keeps the fixture unfinished', async () => {
  const w = await setup();
  try {
    await w.execution.gateway(w.scenario.id, w.gateway).refund(1000, 'retain-after-exception');
    const interrupted = unfinishedSandboxCase(w.scenario, w.decision, defaultPolicy);
    interrupted.checks = [{ name: 'Runner completion', status: 'unknown', detail: 'Controlled exception after provider response.' }];
    interrupted.events = [{ at: new Date().toISOString(), kind: 'runner-error', title: 'Execution interrupted', detail: 'Controlled exception.' }];
    await w.execution.completeCase(w.scenario.id, interrupted);
    const state = await new Store(w.file).read();
    const saved = state.runs[0];
    assert.equal(saved.id, w.run.id);
    assert.equal(saved.status, 'inconclusive');
    assert.equal(saved.results[0].id, w.run.results[0].id);
    assert.ok(saved.results[0].events.some(event => event.data?.requestId === 'retain-after-exception'));
    assert.ok(saved.results[0].events.some(event => event.data?.id === 'REFUND-TEST'));
    assert.ok(saved.results[0].events.some(event => event.kind === 'runner-error'));
    assert.equal(state.fixtures[0].execution!.recordedAt, undefined);
    assert.deepEqual(validateEvidenceDocument(createEvaluationExport(saved)), saved);
    assert.deepEqual(w.counts(), { refunds: 1, reads: 0 });
  } finally { await w.close(); }
});
