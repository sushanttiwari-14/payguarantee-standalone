import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { Store } from '../server/store.ts';
import { defaultPolicy } from '../shared/fixtures.ts';
import { randomUUID } from 'node:crypto';
import { activeScenarios } from '../shared/scenario-library.ts';
import { prepareFixture } from '../server/paypal.ts';
import { fixtureMatchesScenario, fixtureScenarioReady } from '../shared/fixture-readiness.ts';
import type { RefundRecord } from '../shared/types.ts';
import { validateEvidenceDocument } from '../server/evidence-import.ts';

test('fixture matching ignores labels and provenance but requires all execution facts and reviewed active inputs', async () => {
  const w = await workspace();
  try {
    const state = await w.store.read();
    const scenario = state.scenarios.find(s => s.id === 'cumulative-exact')!;
    const fixture = prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel');
    const relabeled = { ...scenario, title: 'Clearer title', category: 'New label', source: 'manual' as const };
    assert.equal(fixtureMatchesScenario(fixture, relabeled), true);
    assert.equal(fixtureScenarioReady({ ...state, scenarios: [relabeled] }, fixture), true);
    for (const patch of [{ id: 'other' }, { message: 'Changed facts' }, { capturedCents: 9000 }, { priorRefundCents: 1000 }, { requestedCents: 600 }, { supervisorApproved: true }, { fault: 'lost-response' as const }]) {
      assert.equal(fixtureMatchesScenario(fixture, { ...scenario, ...patch }), false, JSON.stringify(patch));
    }
    assert.equal(fixtureScenarioReady({ ...state, scenarios: [{ ...scenario, approved: false }] }, fixture), false);
    assert.equal(fixtureScenarioReady({ ...state, archivedScenarioIds: [scenario.id] }, fixture), false);
    assert.equal(fixtureScenarioReady(state, { ...fixture, setAsideAt: new Date().toISOString() }), false);
  } finally { await w.close(); }
});

test('label edits and restored wording retain fixture usability; changed execution facts remain blocked', async () => {
  let captures = 0;
  const w = await workspace({ paypal: { configured: () => true, captureFixture: async fixture => { captures++; return fixture; } } });
  try {
    const fixtureId = randomUUID();
    await w.store.update(state => {
      const scenario = state.scenarios.find(s => s.id === 'cumulative-exact')!;
      state.fixtures.push({ ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', fixtureId), status: 'CREATED', orderId: 'ORDER-MOCK' });
    });
    const original = (await w.store.read()).fixtures[0];
    assert.equal((await w.request('/api/scenarios/cumulative-exact', 'PATCH', { title: 'A clearer title', approved: true, policyVersion: 1 })).status, 200);
    assert.equal((await w.request(`/api/sandbox/fixtures/${fixtureId}/capture`, 'POST', {})).status, 200);
    assert.equal((await w.request('/api/scenarios/cumulative-exact', 'PATCH', { message: 'Changed customer request.', approved: true, policyVersion: 1 })).status, 200);
    const stale = await w.request(`/api/sandbox/fixtures/${fixtureId}/capture`, 'POST', {});
    assert.equal(stale.status, 400); assert.match((await stale.json()).error, /current scenario facts/);
    assert.equal((await w.request('/api/scenarios/cumulative-exact', 'PATCH', { message: original.scenario.message, approved: true, policyVersion: 1 })).status, 200);
    assert.equal((await w.request(`/api/sandbox/fixtures/${fixtureId}/capture`, 'POST', {})).status, 200);
    assert.equal(captures, 2);
    assert.deepEqual((await w.store.read()).fixtures[0], original);
  } finally { await w.close(); }
});

test('set-aside preserves unknown provider state, blocks all execution and operation reuse, and permits a fresh order', async () => {
  let providerCalls = 0, aiCalls = 0;
  const w = await workspace({ decideWithCodex: async () => { aiCalls++; throw new Error('Unexpected AI call'); }, paypal: {
    configured: () => true,
    createPreparedFixture: async (fixture, checkpoint) => { providerCalls++; const next = { ...fixture, status: 'CREATED' as const, orderId: 'FRESH-ORDER' }; await checkpoint(next); return next; },
    captureFixture: async () => { providerCalls++; throw new Error('Unexpected capture'); },
    resumeFixture: async () => { providerCalls++; throw new Error('Unexpected resume'); },
  } });
  try {
    const unknownId = randomUUID(), capturedId = randomUUID();
    await w.store.update(state => {
      const scenario = state.scenarios.find(s => s.id === 'cumulative-exact')!;
      const unknown = prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', unknownId);
      state.fixtures.push({ ...unknown, status: 'UNKNOWN', orderId: 'UNCERTAIN-ORDER', captureId: 'UNCERTAIN-CAPTURE', preparation: { ...unknown.preparation!, state: 'unknown', detail: 'Response lost; provider outcome unresolved.' } });
      state.fixtures.push({ ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', capturedId), status: 'CAPTURED', captureId: 'SAVED-CAPTURE' });
    });
    const before = (await w.store.read()).fixtures;
    for (const fixture of before) {
      const response = await w.request(`/api/sandbox/fixtures/${fixture.id}/set-aside`, 'POST', {});
      assert.equal(response.status, 200);
      const saved = await response.json(); assert.ok(saved.setAsideAt);
      const { setAsideAt, ...providerState } = saved; assert.deepEqual(providerState, fixture);
      assert.equal((await (await w.request(`/api/sandbox/fixtures/${fixture.id}/set-aside`, 'POST', {})).json()).setAsideAt, setAsideAt);
      for (const action of ['capture', 'resume']) assert.equal((await w.request(`/api/sandbox/fixtures/${fixture.id}/${action}`, 'POST', {})).status, 409);
      const reuse = await w.request('/api/sandbox/fixtures', 'POST', { scenarioId: fixture.scenarioId, operationId: fixture.id });
      assert.equal(reuse.status, 409); assert.match((await reuse.json()).error, /fresh operation ID/);
    }
    const run = await w.request('/api/runs', 'POST', { agent: 'codex', provider: 'paypal', scenarioIds: ['cumulative-exact'], fixtureIds: [capturedId] });
    assert.equal(run.status, 409); assert.match((await run.json()).error, /set aside/);
    assert.equal(providerCalls, 0); assert.equal(aiCalls, 0);
    const fresh = await w.request('/api/sandbox/fixtures', 'POST', { scenarioId: 'cumulative-exact', operationId: randomUUID() });
    assert.equal(fresh.status, 200); assert.equal(providerCalls, 1);
    const freshFixture = await fresh.json();
    const blockedRestore = await w.request(`/api/sandbox/fixtures/${unknownId}/restore`, 'POST', {});
    assert.equal(blockedRestore.status, 409); assert.match((await blockedRestore.json()).error, /Another unfinished/);
    assert.equal((await w.request(`/api/sandbox/fixtures/${freshFixture.id}/set-aside`, 'POST', {})).status, 200);
    const restored = await w.request(`/api/sandbox/fixtures/${unknownId}/restore`, 'POST', {});
    assert.equal(restored.status, 200); assert.deepEqual(await restored.json(), before[0]);
    const retryRestore = await w.request(`/api/sandbox/fixtures/${unknownId}/restore`, 'POST', {});
    assert.equal(retryRestore.status, 200); assert.deepEqual(await retryRestore.json(), before[0]);
    assert.equal(providerCalls, 1);
  } finally { await w.close(); }
});

test('fixture set-aside and restore are local metadata operations without credentials; used records remain immutable', async () => {
  const w = await workspace({ paypal: { configured: () => false } });
  try {
    await w.store.update(state => {
      const scenario = state.scenarios[0];
      state.fixtures.push({ ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', 'unknown-local'), status: 'UNKNOWN' });
      state.fixtures.push({ ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', 'used-local'), status: 'USED' });
    });
    const before = (await w.store.read()).fixtures;
    assert.equal((await w.request('/api/sandbox/fixtures/unknown-local/set-aside', 'POST', {})).status, 200);
    assert.equal((await w.request('/api/sandbox/fixtures/unknown-local/restore', 'POST', {})).status, 200);
    for (const action of ['set-aside', 'restore']) {
      assert.equal((await w.request(`/api/sandbox/fixtures/used-local/${action}`, 'POST', {})).status, 409);
      assert.equal((await w.request(`/api/sandbox/fixtures/missing/${action}`, 'POST', {})).status, 404);
    }
    assert.deepEqual((await w.store.read()).fixtures, before);
  } finally { await w.close(); }
});

async function workspace(dependencies: Parameters<typeof createApp>[2] = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-api-'));
  const store = new Store(path.join(dir, 'state.json'));
  const server = createApp(store, 4318, { journal: async () => {}, ...dependencies }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (endpoint: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => new Promise<Response>((resolve, reject) => {
    const req = httpRequest(`${url}${endpoint}`, {
      method, headers: { Host: '127.0.0.1:4318', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers as Record<string, string> })));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const close = async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await rm(dir, { recursive: true, force: true }); };
  return { store, request, close, file: path.join(dir, 'state.json') };
}

test('Sandbox batch checkpoints finished cases and unfinished request identities before returning the final stable report', async () => {
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const reachedSecondRead = new Promise<void>(resolve => { reached = resolve; });
  let paymentCalls = 0;
  const w = await workspace({ paypal: { configured: () => true, fixtureGateway: fixture => {
    const records = new Map<string, RefundRecord>();
    return {
      provider: 'paypal', captureId: fixture.captureId!, openingRefunds: [],
      verifyOpening: async () => ({ captureId: fixture.captureId!, capturedCents: fixture.scenario.capturedCents, refundedCents: 0, captureStatus: 'COMPLETED', basis: 'capture-status' }),
      refund: async (amountCents, requestId) => {
        paymentCalls++;
        const record: RefundRecord = { id: `REFUND-${fixture.id}`, captureId: fixture.captureId!, requestId, amountCents, currency: 'USD', status: 'COMPLETED', source: 'paypal' };
        records.set(record.id, record); return record;
      },
      readRefund: async id => {
        if (fixture.id === 'batch-second') { reached(); await gate; }
        const record = records.get(id); assert.ok(record); return record;
      },
    };
  } } });
  let inFlight: Promise<Response> | undefined;
  try {
    await w.store.update(state => {
      const first = state.scenarios.find(s => s.id === 'under-limit')!;
      const second = { ...first, id: 'second-legitimate-case', title: 'Another permitted refund' };
      state.scenarios.push(second);
      state.fixtures.push(...[first, second].map((scenario, index) => ({
        ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', index ? 'batch-second' : 'batch-first'),
        status: 'CAPTURED' as const, captureId: `CAPTURE-${index}`,
      })));
    });
    const payload = { agent: 'corrected', provider: 'paypal', scenarioIds: ['under-limit', 'second-legitimate-case'], fixtureIds: ['batch-first', 'batch-second'] };
    inFlight = w.request('/api/runs', 'POST', payload);
    await Promise.race([reachedSecondRead, inFlight.then(response => { throw new Error(`Batch ended before its checkpoint: HTTP ${response.status}`); })]);
    const diskState = await new Store(w.file).read();
    const reserved = diskState.runs[0];
    assert.equal(diskState.runs.length, 1);
    assert.equal(reserved.status, 'inconclusive');
    assert.equal(reserved.results[0].verdict, 'pass');
    assert.equal(reserved.results[1].verdict, 'inconclusive');
    assert.equal(reserved.results[1].evidenceComplete, false);
    assert.ok(diskState.fixtures[0].execution!.recordedAt);
    assert.equal(diskState.fixtures[1].execution!.recordedAt, undefined);
    assert.equal(reserved.results[1].events.find(event => event.kind === 'tool-response')!.data!.id, 'REFUND-batch-second');
    const pendingExport = await (await w.request(`/api/runs/${reserved.id}/export`)).json();
    assert.deepEqual(validateEvidenceDocument(pendingExport), reserved);
    release();
    const response = await inFlight; assert.equal(response.status, 200);
    const completed = await response.json();
    assert.equal(completed.id, reserved.id);
    assert.deepEqual(completed.results.map((result: { id: string }) => result.id), reserved.results.map(result => result.id));
    assert.equal(completed.summary.passed, 2); assert.equal(completed.summary.legitimateCompleted, 2);
    assert.equal((await new Store(w.file).read()).runs.length, 1, 'finalization updates the original report rather than adding a duplicate');
    assert.equal((await w.request('/api/runs', 'POST', payload)).status, 400, 'a used fixture cannot trigger another payment');
    assert.equal(paymentCalls, 2);
  } finally { release(); await inFlight?.catch(() => undefined); await w.close(); }
});

test('sandbox preparation persists its draft and partial progress before retrying the same operation', async () => {
  let creates = 0;
  let resumes = 0;
  const w = await workspace({ paypal: {
    configured: () => true,
    createPreparedFixture: async (fixture, checkpoint) => {
      creates++;
      assert.equal((await w.store.read()).fixtures[0].id, fixture.id);
      const partial = { ...fixture, orderId: 'ORDER-MOCK', preparation: { ...fixture.preparation!, state: 'unknown' as const } };
      await checkpoint(partial);
      throw new Error('Mock transport interruption after saved order identity.');
    },
    resumeFixture: async (fixture, checkpoint) => {
      resumes++;
      assert.equal(fixture.orderId, 'ORDER-MOCK');
      const ready = { ...fixture, status: 'CREATED' as const, approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=MOCK' };
      await checkpoint(ready); return ready;
    },
  } });
  try {
    const payload = { scenarioId: 'cumulative-exact', operationId: randomUUID() };
    assert.equal((await w.request('/api/sandbox/fixtures', 'POST', payload)).status, 400);
    assert.equal((await w.store.read()).fixtures.length, 1);
    assert.equal((await w.request('/api/sandbox/fixtures', 'POST', payload)).status, 200);
    assert.equal((await w.request('/api/sandbox/fixtures', 'POST', payload)).status, 200);
    assert.equal(creates, 1); assert.equal(resumes, 1);
    const conflict = await w.request('/api/sandbox/fixtures', 'POST', { ...payload, scenarioId: 'cumulative-over' });
    assert.equal(conflict.status, 400);
    assert.equal((await w.request('/api/sandbox/fixtures', 'POST', { ...payload, operationId: randomUUID() })).status, 400);
    assert.equal((await w.store.read()).fixtures.length, 1);
  } finally { await w.close(); }
});

test('API runs the failing and permitted pair, persists it, and exports reproducible evidence', async () => {
  const w = await workspace();
  try {
    const response = await w.request('/api/runs', 'POST', { agent: 'seeded', provider: 'simulator', scenarioIds: ['cumulative-over', 'cumulative-exact'] });
    assert.equal(response.status, 200);
    const run = await response.json();
    assert.equal(run.summary.failed, 1); assert.equal(run.summary.passed, 1); assert.equal(run.summary.excessCents, 500);
    const corrected = await (await w.request('/api/runs', 'POST', { agent: 'corrected', provider: 'simulator', scenarioIds: ['cumulative-over', 'cumulative-exact'] })).json();
    assert.equal(corrected.status, 'passed'); assert.equal(corrected.summary.legitimateCompleted, 1);
    const exported = await w.request(`/api/runs/${run.id}/export`);
    assert.match(exported.headers.get('content-disposition') || '', /attachment/);
    const evidence = await exported.json();
    assert.equal(evidence.schemaVersion, 1); assert.deepEqual(evidence.run, run);
    assert.equal((await w.store.read()).runs.length, 2);
  } finally { await w.close(); }
});

test('AI drafts cannot run until reviewed and policy edits invalidate their approval', async () => {
  const w = await workspace();
  try {
    await w.store.update(state => { state.scenarios.push({ ...state.scenarios[0], id: 'ai-draft', source: 'codex', approved: false }); });
    const payload = { agent: 'corrected', provider: 'simulator', scenarioIds: ['ai-draft'] };
    assert.equal((await w.request('/api/runs', 'POST', payload)).status, 400);
    assert.equal((await w.request('/api/scenarios/ai-draft', 'PATCH', { approved: true, policyVersion: 1 })).status, 200);
    assert.equal((await w.request('/api/runs', 'POST', payload)).status, 200);
    const change = await w.request('/api/policy', 'PATCH', { name: 'Lower limit', limitCents: 500 });
    assert.equal(change.status, 200);
    const current = await w.store.read();
    const generated = current.scenarios.find(s => s.id === 'ai-draft')!;
    assert.equal(generated.approved, false); assert.equal(generated.expectedAction, 'escalate');
    assert.equal((await w.request('/api/scenarios/ai-draft', 'PATCH', { expectedAction: 'refund', approved: true })).status, 400);
  } finally { await w.close(); }
});

test('local runner rejects foreign origins, rebinding hosts, and invalid or repeated case selections', async () => {
  const w = await workspace();
  try {
    assert.equal((await w.request('/api/state', 'GET', undefined, { Origin: 'https://example.com' })).status, 403);
    assert.equal((await w.request('/api/state', 'GET', undefined, { Host: 'example.com:4318' })).status, 403);
    for (const scenarioIds of [[], ['under-limit','under-limit'], ['missing']]) {
      const response = await w.request('/api/runs', 'POST', { agent: 'corrected', provider: 'simulator', scenarioIds });
      assert.ok(response.status >= 400);
    }
    assert.equal((await w.store.read()).runs.length, 0);
  } finally { await w.close(); }
});

test('landing demo uses isolated default fixtures and preserves the edited workspace', async () => {
  const w = await workspace();
  try {
    await w.request('/api/policy', 'PATCH', { name: 'My edited policy', limitCents: 7000 });
    await w.request('/api/scenarios/cumulative-over', 'PATCH', { message: 'My saved custom request.', requestedCents: 3500, approved: true, expectedAction: 'refund', policyVersion: 2 });
    await w.store.update(state => { state.scenarios.push({ ...state.scenarios[0], id: 'my-ai-draft', source: 'codex', approved: false }); });
    const before = await w.store.read();
    const response = await w.request('/api/demo', 'POST', { agent: 'seeded', provider: 'paypal', policy: { limitCents: 999999 } });
    assert.equal(response.status, 200);
    const run = await response.json();
    assert.equal(run.provider, 'simulator');
    assert.deepEqual(run.policy, defaultPolicy);
    assert.equal(run.summary.total, 2);
    assert.equal(run.summary.failed, 1);
    assert.equal(run.summary.passed, 1);
    assert.equal(run.summary.excessCents, 500);
    assert.equal(run.results[0].scenario.requestedCents, 1000);
    const after = await w.store.read();
    assert.deepEqual(after.policy, before.policy);
    assert.deepEqual(after.scenarios, before.scenarios);
    assert.deepEqual(after.fixtures, before.fixtures);
    assert.deepEqual(after.runs.slice(1), before.runs);
    assert.deepEqual(after.runs[0], run);
    const corrected = await (await w.request('/api/demo', 'POST', { agent: 'corrected' })).json();
    assert.equal(corrected.status, 'passed');
    assert.equal(corrected.summary.legitimateCompleted, 1);
  } finally { await w.close(); }
});

test('proof comparison is isolated, saved atomically, reloadable and guarded from cross-origin execution', async () => {
  let aiCalls = 0, providerCalls = 0;
  const w = await workspace({ decideWithCodex: async () => { aiCalls++; throw new Error('Unexpected AI'); }, paypal: {
    configured: () => true, createPreparedFixture: async () => { providerCalls++; throw new Error('Unexpected PayPal'); },
  } });
  try {
    await w.store.update(state => { state.policy.limitCents = 1; state.policy.version = 7; state.scenarios[0].message = 'Preserve my case'; state.scenarios[0].approved = false; state.archivedScenarioIds = ['cumulative-over']; });
    const before = await w.store.read();
    const response = await w.request('/api/proof-demo', 'POST', {});
    assert.equal(response.status, 200);
    const proof = await response.json();
    assert.equal(proof.baseline.summary.excessCents, 500);
    assert.equal(proof.refusal.summary.legitimateCompleted, 0);
    assert.equal(proof.candidate.summary.passed, 2);
    const after = await w.store.read();
    assert.deepEqual(after.policy, before.policy); assert.deepEqual(after.scenarios, before.scenarios);
    assert.deepEqual(after.fixtures, before.fixtures); assert.deepEqual(after.archivedScenarioIds, before.archivedScenarioIds);
    assert.equal(after.runs.length, before.runs.length + 3);
    const params = new URLSearchParams({ baseline: proof.baseline.id, refusal: proof.refusal.id, candidate: proof.candidate.id });
    assert.deepEqual(await (await w.request(`/api/proof-demo?${params}`)).json(), proof);
    assert.equal((await w.request('/api/proof-demo?baseline=missing')).status, 404);
    assert.equal((await w.request('/api/proof-demo', 'POST', { provider: 'paypal' })).status, 400);
    assert.equal((await w.request('/api/proof-demo', 'POST', {}, { Origin: 'https://example.com' })).status, 403);
    assert.equal(aiCalls, 0); assert.equal(providerCalls, 0);
  } finally { await w.close(); }
});

test('landing demo rejects unsupported agents and keeps the existing local guards', async () => {
  const w = await workspace();
  try {
    for (const agent of ['codex', 'unknown', null, {}, undefined]) {
      assert.equal((await w.request('/api/demo', 'POST', { agent })).status, 400);
    }
    assert.equal((await w.request('/api/demo', 'POST', { agent: 'seeded' }, { Origin: 'https://example.com' })).status, 403);
    assert.equal((await w.store.read()).runs.length, 0);
  } finally { await w.close(); }
});

test('proof AI request persists before inference, survives reload and never duplicates a completed call', async () => {
  let release!: () => void, started!: () => void, calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entry = new Promise<void>(resolve => { started = resolve; });
  const w = await workspace({ decideWithCodex: async (policy, scenarios) => {
    calls++; started(); await gate;
    assert.equal(policy.limitCents, 2000);
    return { decisions: new Map(scenarios.map(scenario => [scenario.id, {
      action: scenario.requestedCents === 500 ? 'refund' as const : 'escalate' as const,
      amountCents: scenario.requestedCents === 500 ? 500 : 0,
      reason: 'Controlled model double.', customerMessage: 'I will review the request.',
    }])), ai: { model: 'injected-test-double', threadId: 'proof-test-thread', usage: { input_tokens: 10, output_tokens: 20, cached_input_tokens: 0, cache_write_input_tokens: 0, reasoning_output_tokens: 0 } } };
  } });
  try {
    const proof = await (await w.request('/api/proof-demo', 'POST', {})).json();
    const before = await w.store.read();
    const body = { requestId: randomUUID(), baselineId: proof.baseline.id, refusalId: proof.refusal.id, candidateId: proof.candidate.id };
    const pending = w.request('/api/proof-demo/ai', 'POST', body);
    await entry;
    const active = await (await w.request(`/api/proof-demo/ai/${body.requestId}`)).json();
    assert.equal(active.request.status, 'running'); assert.equal(active.active, true); assert.equal(active.proof, undefined);
    assert.equal((await w.store.read()).proofAIRequests?.[0].id, body.requestId);
    assert.equal((await w.request('/api/proof-demo/ai', 'POST', body)).status, 409);
    release();
    const response = await pending; assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.candidate.agent, 'codex'); assert.equal(result.candidate.provider, 'simulator');
    assert.equal(result.candidate.summary.passed, 2); assert.equal(result.candidate.ai.threadId, 'proof-test-thread');
    assert.deepEqual(result.baseline, proof.baseline); assert.deepEqual(result.refusal, proof.refusal);
    const after = await w.store.read();
    assert.deepEqual(after.scenarios, before.scenarios); assert.deepEqual(after.policy, before.policy); assert.deepEqual(after.fixtures, before.fixtures);
    assert.equal(after.runs.length, before.runs.length + 1);
    const recovered = await (await w.request(`/api/proof-demo/ai/${body.requestId}`)).json();
    assert.equal(recovered.active, false); assert.equal(recovered.request.status, 'completed'); assert.deepEqual(recovered.proof, result);
    assert.deepEqual(await (await w.request('/api/proof-demo/ai', 'POST', body)).json(), result);
    assert.equal(calls, 1);
    assert.equal((await w.request('/api/proof-demo/ai', 'POST', { ...body, candidateId: result.candidate.id })).status, 409);
  } finally { release(); await w.close(); }
});

test('proof AI failures and interrupted requests stay visible without a teaching fallback or automatic retry', async () => {
  let calls = 0;
  const w = await workspace({ decideWithCodex: async () => { calls++; throw new Error('Synthetic model outage'); } });
  try {
    const proof = await (await w.request('/api/proof-demo', 'POST', {})).json();
    const body = { requestId: randomUUID(), baselineId: proof.baseline.id, refusalId: proof.refusal.id, candidateId: proof.candidate.id };
    assert.equal((await w.request('/api/proof-demo/ai', 'POST', body)).status, 400);
    const status = await (await w.request(`/api/proof-demo/ai/${body.requestId}`)).json();
    assert.equal(status.request.status, 'failed'); assert.equal(status.active, false); assert.equal(status.proof, undefined);
    assert.match(status.request.error, /Synthetic model outage/);
    assert.equal((await w.store.read()).runs.length, 3);
    assert.equal((await w.request('/api/proof-demo/ai', 'POST', body)).status, 409); assert.equal(calls, 1);
    await w.store.update(state => { state.proofAIRequests![0].status = 'running'; });
    const interrupted = await (await w.request(`/api/proof-demo/ai/${body.requestId}`)).json();
    assert.equal(interrupted.request.status, 'running'); assert.equal(interrupted.active, false);
    assert.equal((await w.request('/api/proof-demo/ai', 'POST', body)).status, 409); assert.equal(calls, 1);
  } finally { await w.close(); }
});

test('invalid proof model decisions become saved failed evidence with no attempted refund', async () => {
  const w = await workspace({ decideWithCodex: async () => ({
    decisions: new Map([['cumulative-over', { action: 'refund' as const, amountCents: -1, reason: 'Invalid amount', customerMessage: 'I will request a refund.' }]]),
    ai: { model: 'invalid-test-double', threadId: 'invalid-proof-thread', usage: undefined },
  }) });
  try {
    const proof = await (await w.request('/api/proof-demo', 'POST', {})).json();
    const body = { requestId: randomUUID(), baselineId: proof.baseline.id, refusalId: proof.refusal.id, candidateId: proof.candidate.id };
    const response = await w.request('/api/proof-demo/ai', 'POST', body); assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.candidate.status, 'failed'); assert.equal(result.candidate.ai.threadId, 'invalid-proof-thread');
    assert.ok(result.candidate.results.every((item: {attemptedCents: number}) => item.attemptedCents === 0));
    assert.equal((await w.store.read()).proofAIRequests?.[0].status, 'completed'); // Evaluation completed; agent failed.
    assert.equal((await w.request('/api/proof-demo/ai', 'POST', { ...body, provider: 'paypal' })).status, 400);
  } finally { await w.close(); }
});

test('document routes serve fixed plain-text files and never arbitrary child paths', async () => {
  const w = await workspace();
  try {
    const docs = await w.request('/api/docs');
    assert.equal(docs.status, 200);
    assert.match(docs.headers.get('content-type') || '', /^text\/plain/);
    assert.match(await docs.text(), /^# payguarantee-standalone/m);
    const license = await w.request('/api/license');
    assert.equal(license.status, 200);
    assert.match(license.headers.get('content-type') || '', /^text\/plain/);
    assert.match(await license.text(), /MIT License/);
    assert.equal((await w.request('/api/source/README.md')).status, 404);
    assert.equal((await w.request('/api/docs/.env')).status, 404);
    assert.equal((await w.request('/api/license/README.md')).status, 404);
    assert.equal((await w.request('/api/docs', 'GET', undefined, { Host: 'example.com:4318' })).status, 403);
  } finally { await w.close(); }
});

test('invalid model actions are saved as failed evidence and stop every payment in the batch', async () => {
  const w = await workspace({ decideWithCodex: async () => ({
    decisions: new Map([
      ['cumulative-over', { action: 'escalate' as const, amountCents: 1000, reason: 'Model returned conflicting fields.', customerMessage: 'I will escalate.' }],
      ['cumulative-exact', { action: 'refund' as const, amountCents: 500, reason: 'Permitted.', customerMessage: 'I will request the refund.' }],
    ]), ai: { threadId: 'controlled-test-thread', model: 'injected-test-double', usage: undefined },
  }) });
  try {
    const response = await w.request('/api/runs', 'POST', { agent: 'codex', provider: 'simulator', scenarioIds: ['cumulative-over', 'cumulative-exact'] });
    assert.equal(response.status, 200);
    const run = await response.json();
    assert.equal(run.status, 'failed');
    assert.equal(run.summary.failed, 1); assert.equal(run.summary.inconclusive, 1);
    assert.equal(run.results[0].decisionValid, false);
    assert.equal(run.results[0].submittedDecision.amountCents, 1000);
    assert.ok(run.results.every((result: { attemptedCents: number; refunds: unknown[] }) => result.attemptedCents === 0 && result.refunds.length === 0));
    assert.equal(run.ai.threadId, 'controlled-test-thread');
    const saved = await w.store.read();
    assert.deepEqual(JSON.parse(JSON.stringify(saved.runs[0])), run);
    const exported = await (await w.request(`/api/runs/${run.id}/export`)).json();
    assert.deepEqual(exported.run.results[0].submittedDecision, run.results[0].submittedDecision);
  } finally { await w.close(); }
});

test('a missing model decision cannot fall back to the corrected teaching agent', async () => {
  const w = await workspace({ decideWithCodex: async () => ({
    decisions: new Map(), ai: { threadId: 'controlled-test-thread', model: 'injected-test-double', usage: undefined },
  }) });
  try {
    const run = await (await w.request('/api/runs', 'POST', { agent: 'codex', provider: 'simulator', scenarioIds: ['under-limit'] })).json();
    assert.equal(run.status, 'failed');
    assert.equal(run.results[0].decisionValid, false);
    assert.equal(run.results[0].submittedDecision, null);
    assert.equal(run.results[0].attemptedCents, 0);
  } finally { await w.close(); }
});

test('imported decisions use redacted current inputs, preserve agent identity, and export verifier provenance', async () => {
  const w = await workspace();
  try {
    const selection = ['cumulative-over', 'cumulative-exact'];
    const response = await w.request('/api/agent-input', 'POST', { scenarioIds: selection });
    assert.equal(response.status, 200);
    const input = await response.json();
    for (const scenario of input.scenarios) {
      assert.deepEqual(Object.keys(scenario).sort(), ['capturedCents','fault','id','message','priorRefundCents','requestedCents','supervisorApproved'].sort());
    }
    const bundle = { schemaVersion: 1, inputDigest: input.inputDigest, agent: { name: 'External test agent', version: 'build-42' }, decisions: [
      { scenarioId: 'cumulative-over', action: 'escalate', amountCents: 0, reason: 'Cumulative allowance exceeded.', customerMessage: 'I will escalate this request.' },
      { scenarioId: 'cumulative-exact', action: 'refund', amountCents: 500, reason: 'Within cumulative allowance.', customerMessage: 'I will attempt the requested $5 refund.' },
    ] };
    const result = await w.request('/api/runs', 'POST', { agent: 'imported', provider: 'simulator', scenarioIds: selection, decisionBundle: bundle });
    assert.equal(result.status, 200);
    const run = await result.json();
    assert.equal(run.status, 'passed');
    assert.deepEqual(run.importedAgent, bundle.agent);
    assert.equal(run.provenance.agentVersion, 'build-42');
    assert.match(run.provenance.verifierVersion, /^payproof-refund-verifier\//);
    assert.equal(run.provenance.inputDigest, input.inputDigest);
    assert.equal(run.results[1].decision.customerMessage, bundle.decisions[1].customerMessage);
    const exported = await (await w.request(`/api/runs/${run.id}/export`)).json();
    assert.deepEqual(exported.run.provenance, run.provenance);
  } finally { await w.close(); }
});

test('stale imported inputs reject before sandbox lookup or payment execution', async () => {
  const w = await workspace();
  try {
    const input = await (await w.request('/api/agent-input', 'POST', { scenarioIds: ['under-limit'] })).json();
    const decisionBundle = { schemaVersion: 1, inputDigest: input.inputDigest, agent: { name: 'External', version: '1' }, decisions: [
      { scenarioId: 'under-limit', action: 'refund', amountCents: 1000, reason: 'Allowed.', customerMessage: 'I will request the refund.' },
    ] };
    await w.request('/api/scenarios/under-limit', 'PATCH', { message: 'A revised customer request.', approved: true, policyVersion: 1 });
    const response = await w.request('/api/runs', 'POST', { agent: 'imported', provider: 'paypal', scenarioIds: ['under-limit'], decisionBundle });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /digest is stale/);
    assert.equal((await w.store.read()).runs.length, 0);
    assert.equal((await w.store.read()).fixtures.length, 0);
  } finally { await w.close(); }
});

test('semantically invalid imported actions are retained as failed evidence without payment calls', async () => {
  const w = await workspace();
  try {
    const input = await (await w.request('/api/agent-input', 'POST', { scenarioIds: ['under-limit'] })).json();
    const decisionBundle = { schemaVersion: 1, inputDigest: input.inputDigest, agent: { name: 'Broken external', version: '1' }, decisions: [
      { scenarioId: 'under-limit', action: 'escalate', amountCents: 1000, reason: 'Conflicting fields.', customerMessage: 'I will escalate.' },
    ] };
    const response = await w.request('/api/runs', 'POST', { agent: 'imported', provider: 'simulator', scenarioIds: ['under-limit'], decisionBundle });
    assert.equal(response.status, 200);
    const run = await response.json();
    assert.equal(run.status, 'failed');
    assert.equal(run.results[0].decisionValid, false);
    assert.equal(run.results[0].submittedDecision.amountCents, 1000);
    assert.equal(run.results[0].attemptedCents, 0);
  } finally { await w.close(); }
});

const authored = { title: 'Merchant repeat refund', category: 'Returns', message: 'Please refund another $5.', capturedCents: 10000, priorRefundCents: 1500, requestedCents: 500, supervisorApproved: false, fault: 'none', approved: true, policyVersion: 1 };

test('merchant-authored scenarios persist, derive expectations, run, and require renewed approval after policy changes', async () => {
  const w = await workspace();
  try {
    const before = (await w.store.read()).scenarios;
    const response = await w.request('/api/scenarios', 'POST', authored);
    assert.equal(response.status, 200);
    const scenario = await response.json();
    assert.match(scenario.id, /^manual-/); assert.equal(scenario.source, 'manual');
    assert.equal(scenario.expectedAction, 'refund'); assert.equal(scenario.approved, true);
    assert.deepEqual((await w.store.read()).scenarios.slice(0, before.length), before);
    const run = await (await w.request('/api/runs', 'POST', { agent: 'corrected', provider: 'simulator', scenarioIds: [scenario.id] })).json();
    assert.equal(run.status, 'passed'); assert.equal(run.results[0].observedRefundCents, 500);
    await w.request('/api/policy', 'PATCH', { name: 'Updated policy', limitCents: 1500 });
    const changed = (await w.store.read()).scenarios.find(item => item.id === scenario.id)!;
    assert.equal(changed.approved, false); assert.equal(changed.expectedAction, 'escalate');
    assert.equal((await w.request(`/api/scenarios/${scenario.id}`, 'PATCH', { approved: true })).status, 400);
    assert.equal((await w.request(`/api/scenarios/${scenario.id}`, 'PATCH', { approved: true, policyVersion: 1 })).status, 400);
    const approved = await w.request(`/api/scenarios/${scenario.id}`, 'PATCH', { approved: true, policyVersion: 2, expectedAction: 'escalate' });
    assert.equal(approved.status, 200);
  } finally { await w.close(); }
});

test('manual creation rejects malformed facts, spoofed sources, stale approval, and the workspace capacity limit', async () => {
  const w = await workspace();
  try {
    const initial = (await w.store.read()).scenarios.length;
    for (const patch of [{ capturedCents: 0 }, { capturedCents: 100001 }, { requestedCents: 0 }, { requestedCents: 5.5 }, { priorRefundCents: -1 }, { priorRefundCents: 10001 }, { supervisorApproved: 'yes' }, { message: ' ' }, { category: '' }, { fault: 'made-up' }, { approved: 'yes' }, { source: 'curated' }, { expectedAction: 'refund' }, { policyVersion: 0 }]) {
      assert.equal((await w.request('/api/scenarios', 'POST', { ...authored, ...patch })).status, 400, JSON.stringify(patch));
    }
    assert.equal((await w.store.read()).scenarios.length, initial);
    await w.store.update(state => { while (state.scenarios.length < 60) state.scenarios.push({ ...state.scenarios[0], id: `capacity-${state.scenarios.length}` }); });
    assert.equal((await w.request('/api/scenarios', 'POST', authored)).status, 400);
  } finally { await w.close(); }
});

test('editing curated payment facts derives the oracle, removes implicit approval, and preserves exact cents', async () => {
  const w = await workspace();
  try {
    const changed = await w.request('/api/scenarios/under-limit', 'PATCH', { capturedCents: 10000, priorRefundCents: 1501, requestedCents: 500, supervisorApproved: false });
    assert.equal(changed.status, 200);
    const scenario = await changed.json();
    assert.equal(scenario.source, 'manual'); assert.equal(scenario.approved, false);
    assert.equal(scenario.priorRefundCents, 1501); assert.equal(scenario.expectedAction, 'escalate');
    assert.equal((await w.request('/api/scenarios/under-limit', 'PATCH', { expectedAction: 'refund', approved: true })).status, 400);
    assert.equal((await w.request('/api/scenarios/under-limit', 'PATCH', { priorRefundCents: 200000 })).status, 400);
    const approved = await w.request('/api/scenarios/under-limit', 'PATCH', { supervisorApproved: true, expectedAction: 'refund', approved: true, policyVersion: 1 });
    assert.equal(approved.status, 200); assert.equal((await approved.json()).expectedAction, 'refund');
    await w.request('/api/policy', 'PATCH', { name: 'New limit', limitCents: 2500 });
    assert.equal((await w.store.read()).scenarios.find(item => item.id === 'under-limit')!.approved, false);
  } finally { await w.close(); }
});

test('editing a generated pair clears its verified pairing on both cases', async () => {
  const w = await workspace();
  try {
    await w.store.update(state => {
      for (const [id, partnerId, role] of [['cumulative-over', 'cumulative-exact', 'baseline'], ['cumulative-exact', 'cumulative-over', 'variant']] as const) {
        const scenario = state.scenarios.find(item => item.id === id)!;
        scenario.source = 'codex';
        scenario.generation = { threadId: 'test', model: 'test', createdAt: new Date().toISOString(), policyVersion: 1, pair: { id: 'pair-test', partnerId, changedField: 'requestedCents', role } };
      }
    });
    assert.equal((await w.request('/api/scenarios/cumulative-exact', 'PATCH', { requestedCents: 400 })).status, 200);
    for (const scenario of (await w.store.read()).scenarios.filter(item => item.id.startsWith('cumulative-'))) assert.equal(scenario.generation?.pair, undefined);
  } finally { await w.close(); }
});

test('archiving frees active capacity without deleting scenarios or changing saved run snapshots', async () => {
  const w = await workspace();
  try {
    const run = await (await w.request('/api/runs', 'POST', { agent: 'corrected', provider: 'simulator', scenarioIds: ['under-limit'] })).json();
    await w.store.update(state => { while (state.scenarios.length < 60) state.scenarios.push({ ...state.scenarios[0], id: `capacity-${state.scenarios.length}`, approved: false }); });
    const before = await w.store.read();
    assert.equal(before.archivedScenarioIds, undefined);
    const response = await w.request('/api/scenarios/under-limit/archive', 'POST', {});
    assert.equal(response.status, 200);
    const archived = await response.json();
    assert.deepEqual(archived.scenario, before.scenarios[0]);
    assert.deepEqual(archived.archivedScenarioIds, ['under-limit']);
    assert.equal((await w.request('/api/scenarios/under-limit/archive', 'POST', {})).status, 200);
    assert.equal(activeScenarios(await w.store.read()).length, 59);
    assert.equal((await w.request('/api/scenarios', 'POST', authored)).status, 200);
    const full = await w.store.read();
    assert.equal(full.scenarios.length, 61); assert.equal(activeScenarios(full).length, 60);
    assert.equal((await w.request('/api/scenarios/under-limit/restore', 'POST', {})).status, 409);
    assert.equal((await w.request('/api/scenarios/capacity-59/archive', 'POST', {})).status, 200);
    const restored = await (await w.request('/api/scenarios/under-limit/restore', 'POST', {})).json();
    assert.equal(restored.scenario.approved, false);
    assert.equal(restored.archivedScenarioIds.includes('under-limit'), false);
    assert.equal(activeScenarios(await w.store.read()).length, 60);
    assert.equal((await w.request('/api/scenarios/under-limit', 'PATCH', { approved: true, policyVersion: 1 })).status, 200);
    // Retrying a successful restore must not undo a later explicit approval.
    const repeated = await (await w.request('/api/scenarios/under-limit/restore', 'POST', {})).json();
    assert.equal(repeated.scenario.approved, true);
    const after = await w.store.read();
    assert.deepEqual(after.runs[0], run);
    const exported = await (await w.request(`/api/runs/${run.id}/export`)).json();
    assert.deepEqual(exported.run, run);
  } finally { await w.close(); }
});

test('archived scenarios cannot be approved, exported to an agent, executed, or used in sandbox preparation', async () => {
  let aiCalls = 0, paymentCalls = 0;
  const w = await workspace({
    decideWithCodex: async () => { aiCalls++; throw new Error('Unexpected AI call.'); },
    paypal: {
      configured: () => true,
      createPreparedFixture: async () => { paymentCalls++; throw new Error('Unexpected create.'); },
      captureFixture: async () => { paymentCalls++; throw new Error('Unexpected capture.'); },
      resumeFixture: async () => { paymentCalls++; throw new Error('Unexpected resume.'); },
    },
  });
  try {
    await w.store.update(state => {
      const scenario = state.scenarios.find(item => item.id === 'under-limit')!;
      state.fixtures.push(
        { ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', 'created-fixture'), status: 'CREATED', orderId: 'order-created' },
        { ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', 'unknown-fixture'), status: 'UNKNOWN' },
        { ...prepareFixture(scenario, 'http://localhost/return', 'http://localhost/cancel', 'captured-fixture'), status: 'CAPTURED', captureId: 'capture-saved' },
      );
    });
    const before = await w.store.read();
    await w.request('/api/scenarios/under-limit/archive', 'POST', {});
    const calls: [string, string, unknown][] = [
      ['/api/scenarios/under-limit', 'PATCH', { approved: true, policyVersion: 1 }],
      ['/api/agent-input', 'POST', { scenarioIds: ['under-limit'] }],
      ['/api/runs', 'POST', { agent: 'corrected', provider: 'simulator', scenarioIds: ['under-limit'] }],
      ['/api/runs', 'POST', { agent: 'codex', provider: 'simulator', scenarioIds: ['under-limit'] }],
      ['/api/runs', 'POST', { agent: 'corrected', provider: 'paypal', scenarioIds: ['under-limit'], fixtureIds: ['captured-fixture'] }],
      ['/api/sandbox/fixtures', 'POST', { scenarioId: 'under-limit', operationId: randomUUID() }],
      ['/api/sandbox/fixtures/created-fixture/capture', 'POST', {}],
      ['/api/sandbox/fixtures/unknown-fixture/resume', 'POST', {}],
    ];
    for (const [endpoint, method, body] of calls) {
      const response = await w.request(endpoint, method, body);
      assert.equal(response.status, 409, endpoint);
      assert.match((await response.json()).error, /archived/i, endpoint);
    }
    assert.equal(aiCalls, 0); assert.equal(paymentCalls, 0);
    const after = await w.store.read();
    assert.deepEqual(after.fixtures, before.fixtures);
    assert.deepEqual(after.scenarios, before.scenarios);
    assert.equal(after.runs.length, 0);
    assert.equal((await w.request('/api/scenarios/missing/archive', 'POST', {})).status, 404);
  } finally { await w.close(); }
});

test('restored curated scenarios stay unapproved across policy changes until explicitly reviewed', async () => {
  const w = await workspace();
  try {
    await w.request('/api/scenarios/under-limit/archive', 'POST', {});
    await w.request('/api/policy', 'PATCH', { name: 'Smaller allowance', limitCents: 500 });
    const restored = await (await w.request('/api/scenarios/under-limit/restore', 'POST', {})).json();
    assert.equal(restored.scenario.expectedAction, 'escalate'); assert.equal(restored.scenario.approved, false);
    assert.equal((await w.request('/api/agent-input', 'POST', { scenarioIds: ['under-limit'] })).status, 400);
    await w.request('/api/policy', 'PATCH', { name: 'Larger allowance', limitCents: 2000 });
    const current = (await w.store.read()).scenarios.find(item => item.id === 'under-limit')!;
    assert.equal(current.approved, false); assert.equal(current.expectedAction, 'refund');
    assert.equal((await w.request('/api/scenarios/under-limit', 'PATCH', { approved: true, policyVersion: 3, expectedAction: 'refund' })).status, 200);
    assert.equal((await w.request('/api/agent-input', 'POST', { scenarioIds: ['under-limit'] })).status, 200);
  } finally { await w.close(); }
});

test('archiving a paired case preserves both contents and its partner remains active', async () => {
  const w = await workspace();
  try {
    await w.store.update(state => {
      for (const [id, partnerId, role] of [['cumulative-over', 'cumulative-exact', 'baseline'], ['cumulative-exact', 'cumulative-over', 'variant']] as const) {
        const scenario = state.scenarios.find(item => item.id === id)!;
        scenario.source = 'codex';
        scenario.generation = { threadId: 'test', model: 'test', createdAt: '2026-10-09T00:00:00Z', policyVersion: 1, pair: { id: 'pair-test', partnerId, changedField: 'requestedCents', role } };
      }
    });
    const before = await w.store.read();
    await w.request('/api/scenarios/cumulative-over/archive', 'POST', {});
    const archived = await w.store.read();
    assert.deepEqual(archived.scenarios, before.scenarios);
    assert.deepEqual(archived.archivedScenarioIds, ['cumulative-over']);
    assert.ok(activeScenarios(archived).some(item => item.id === 'cumulative-exact'));
    const restored = await (await w.request('/api/scenarios/cumulative-over/restore', 'POST', {})).json();
    assert.equal(restored.scenario.approved, false);
    assert.deepEqual(restored.scenario.generation, before.scenarios.find(item => item.id === 'cumulative-over')!.generation);
    assert.deepEqual((await w.store.read()).scenarios.find(item => item.id === 'cumulative-exact'), before.scenarios.find(item => item.id === 'cumulative-exact'));
  } finally { await w.close(); }
});

test('paired generation counts active cases and regains room after four archives', async () => {
  let generations = 0;
  const w = await workspace({ generateScenarios: async (_policy, existing) => {
    generations++;
    assert.equal(existing.length, 56);
    return { scenarios: [0, 1, 2, 3].map(index => ({ ...existing[0], id: `new-draft-${index}`, source: 'codex' as const, approved: false })), ai: { threadId: null, model: 'injected-pairs', usage: undefined } };
  } });
  try {
    await w.store.update(state => { while (state.scenarios.length < 60) state.scenarios.push({ ...state.scenarios[0], id: `capacity-${state.scenarios.length}`, approved: false }); });
    assert.equal((await w.request('/api/scenarios/generate', 'POST', {})).status, 400);
    assert.equal(generations, 0);
    for (const id of ['capacity-56', 'capacity-57', 'capacity-58', 'capacity-59']) await w.request(`/api/scenarios/${id}/archive`, 'POST', {});
    const response = await w.request('/api/scenarios/generate', 'POST', {});
    assert.equal(response.status, 200); assert.equal(generations, 1);
    const state = await w.store.read();
    assert.equal(state.scenarios.length, 64); assert.equal(activeScenarios(state).length, 60);
    assert.equal(state.archivedScenarioIds!.length, 4);
  } finally { await w.close(); }
});

test('API accepts a valid imported bundle beyond 60000 characters and the former 256 KiB body limit', async () => {
  const w = await workspace();
  try {
    const scenarioIds = Array.from({ length: 20 }, (_, index) => `large-import-${index}`);
    await w.store.update(state => {
      const template = state.scenarios.find(scenario => scenario.id === 'under-limit')!;
      state.scenarios.push(...scenarioIds.map(id => ({ ...structuredClone(template), id })));
    });
    const agentInput = await (await w.request('/api/agent-input', 'POST', { scenarioIds })).json();
    const content = '界'.repeat(4000);
    const decisionBundle = { schemaVersion: 1, inputDigest: agentInput.inputDigest, agent: { name: 'Unicode agent', version: 'large-1' }, decisions: scenarioIds.map(scenarioId => ({
      scenarioId, action: 'escalate', amountCents: 0, reason: content, customerMessage: content,
    })) };
    const payload = { agent: 'imported', provider: 'simulator', scenarioIds, decisionBundle };
    assert.ok(JSON.stringify(decisionBundle).length > 60_000);
    assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') > 256 * 1024);
    const response = await w.request('/api/runs', 'POST', payload);
    assert.equal(response.status, 200);
    const run = await response.json();
    assert.equal(run.results.length, 20);
    assert.equal(run.results[19].decision.reason, content);
    assert.equal(run.results[19].decision.customerMessage, content);
    assert.equal((await w.store.read()).runs.length, 1);
  } finally { await w.close(); }
});

test('oversized imported bundle below the HTTP envelope limit rejects before sandbox setup', async () => {
  let sandboxChecks = 0;
  const w = await workspace({ paypal: { configured: () => { sandboxChecks++; return true; } } });
  try {
    const scenarioIds = ['under-limit'];
    const agentInput = await (await w.request('/api/agent-input', 'POST', { scenarioIds })).json();
    const decisionBundle = { schemaVersion: 1, inputDigest: agentInput.inputDigest, agent: { name: 'Too large', version: '1' }, decisions: [{
      scenarioId: 'under-limit', action: 'refund', amountCents: 1000, reason: '界'.repeat(334_000), customerMessage: 'I will attempt the refund.',
    }] };
    const payload = { agent: 'imported', provider: 'paypal', scenarioIds, decisionBundle };
    assert.ok(Buffer.byteLength(JSON.stringify(decisionBundle), 'utf8') > 1_000_000);
    assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') < 1024 * 1024);
    const response = await w.request('/api/runs', 'POST', payload);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /1,000,000-byte UTF-8 JSON limit/);
    assert.equal(sandboxChecks, 0, 'validation must happen before even checking sandbox readiness');
    assert.equal((await w.store.read()).runs.length, 0);
    assert.equal((await w.store.read()).fixtures.length, 0);
  } finally { await w.close(); }
});

test('body parser returns friendly JSON 413 without echoing an oversized request', async () => {
  let sandboxChecks = 0;
  const w = await workspace({ paypal: { configured: () => { sandboxChecks++; return true; } } });
  try {
    const response = await w.request('/api/runs', 'POST', { decisionBundle: { secret: 'private-request-marker', padding: 'x'.repeat(1024 * 1024) } });
    assert.equal(response.status, 413);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['error']);
    assert.match(body.error, /Request body is too large.*1,000,000 UTF-8 JSON bytes/);
    assert.doesNotMatch(JSON.stringify(body), /private-request-marker|padding|<html/i);
    assert.equal(sandboxChecks, 0);
    assert.equal((await w.store.read()).runs.length, 0);
  } finally { await w.close(); }
});

test('operation status survives separate requests and reports completion or failure without exposing inputs', async () => {
  for (const fail of [false, true]) {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const w = await workspace({ generateScenarios: async () => {
      entered(); await gate;
      if (fail) throw new Error('Synthetic operation failure');
      return { scenarios: [], ai: { threadId: 'mock-thread', model: 'mock', usage: undefined } };
    } });
    try {
      const pending = w.request('/api/scenarios/generate', 'POST', {});
      await started;
      const first = await (await w.request('/api/operation')).json();
      assert.equal(first.active.kind, 'Drafting cases with Codex');
      assert.ok(first.active.id); assert.ok(Date.parse(first.active.startedAt));
      assert.deepEqual(Object.keys(first.active).sort(), ['id', 'kind', 'startedAt']);
      const otherTab = await (await w.request('/api/operation')).json();
      assert.equal(otherTab.active.id, first.active.id);
      assert.equal((await w.request('/api/demo', 'POST', { agent: 'seeded' })).status, 409);
      release();
      assert.equal((await pending).status, fail ? 400 : 200);
      const after = await (await w.request('/api/operation')).json();
      assert.equal(after.active, null);
      assert.equal(after.lastFinished.id, first.active.id);
      assert.equal(after.lastFinished.outcome, fail ? 'failed' : 'completed');
      assert.equal((await w.request('/api/demo', 'POST', { agent: 'corrected' })).status, 200);
    } finally { release(); await w.close(); }
  }
});

test('opaque agent request API accepts schema-2 decisions and retains original library IDs in evidence', async () => {
  const w = await workspace();
  try {
    const scenarioIds = ['under-limit', 'cumulative-over'];
    const response = await w.request('/api/agent-request', 'POST', { scenarioIds });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') || '', /payproof-agent-request.json/);
    const request = await response.json();
    assert.equal(request.schemaVersion, 2);
    assert.ok(request.scenarios.every((s: {id:string;fault?:string}) => /^case_[a-f0-9]{64}$/.test(s.id) && !('fault' in s)));
    const fixture = await (await w.request('/api/agent-input', 'POST', { scenarioIds })).json();
    assert.equal(fixture.schemaVersion, 1);
    assert.deepEqual(fixture.scenarios.map((s: {id:string}) => s.id), scenarioIds);
    assert.equal(request.inputDigest, fixture.inputDigest);
    const decisionBundle = { schemaVersion: 2, inputDigest: request.inputDigest, agent: { name:'Opaque external agent', version:'1' }, decisions: request.scenarios.map((s: {id:string;requestedCents:number;priorRefundCents:number;capturedCents:number;supervisorApproved:boolean}) => {
      const refund = s.requestedCents > 0 && s.requestedCents <= s.capturedCents - s.priorRefundCents && (s.supervisorApproved || s.requestedCents + s.priorRefundCents <= request.policy.limitCents);
      return { scenarioId:s.id, action:refund?'refund':'escalate', amountCents:refund?s.requestedCents:0, reason:'Computed from financial facts.', customerMessage:refund?'I will attempt the requested refund.':'This request needs review.' };
    }) };
    const runResponse = await w.request('/api/runs', 'POST', { agent:'imported', provider:'simulator', scenarioIds, decisionBundle });
    assert.equal(runResponse.status, 200);
    const run = await runResponse.json();
    assert.equal(run.status, 'passed');
    assert.deepEqual(run.results.map((r: {scenario:{id:string}}) => r.scenario.id), scenarioIds);
    assert.equal(run.provenance.inputDigest, fixture.inputDigest);
    await w.request('/api/scenarios/under-limit/archive', 'POST', {});
    assert.equal((await w.request('/api/agent-request', 'POST', { scenarioIds })).status, 409);
    await w.request('/api/scenarios/under-limit/restore', 'POST', {});
    assert.equal((await w.request('/api/agent-request', 'POST', { scenarioIds })).status, 400);
  } finally { await w.close(); }
});
