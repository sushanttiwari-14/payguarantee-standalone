import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { Store } from '../server/store.ts';
import { createEvaluationExport } from '../server/decision-bundle.ts';
import type { Run } from '../shared/types.ts';

async function workspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-evidence-api-'));
  const store = new Store(path.join(dir, 'state.json'));
  let aiCalls = 0, paymentCalls = 0;
  const forbiddenAI = async (): Promise<never> => { aiCalls++; throw new Error('Replay/import must not invoke AI.'); };
  const forbiddenPayment = async (): Promise<never> => { paymentCalls++; throw new Error('Replay/import must not invoke PayPal.'); };
  const server = createApp(store, 4318, {
    decideWithCodex: forbiddenAI, generateScenarios: forbiddenAI,
    paypal: { configured: () => true, createPreparedFixture: forbiddenPayment, captureFixture: forbiddenPayment, resumeFixture: forbiddenPayment },
  }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (route: string, method = 'GET', body?: unknown) => new Promise<Response>((resolve, reject) => {
    const req = httpRequest(`${base}${route}`, { method, headers: { Host: '127.0.0.1:4318', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const close = async () => {
    assert.equal(aiCalls, 0, 'Import/replay called AI'); assert.equal(paymentCalls, 0, 'Import/replay called PayPal');
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  };
  const run = async () => (await (await request('/api/runs', 'POST', { agent: 'seeded', provider: 'simulator', scenarioIds: ['cumulative-over', 'cumulative-exact'] })).json()) as Run;
  return { store, request, close, run };
}

test('saved-run replay uses immutable policy/cases/decisions and persists only a fresh simulator evaluation', async () => {
  const w = await workspace();
  try {
    const source = await w.run();
    await w.request('/api/policy', 'PATCH', { name: 'Changed workspace policy', limitCents: 0 });
    await w.store.update(state => { state.archivedScenarioIds = state.scenarios.map(s => s.id); });
    const before = await w.store.read();
    const response = await w.request(`/api/runs/${source.id}/replay`, 'POST', {});
    assert.equal(response.status, 200, await response.clone().text());
    const replay = await response.json() as Run;
    const after = await w.store.read();
    assert.notEqual(replay.id, source.id); assert.equal(replay.provider, 'simulator');
    assert.equal(replay.ai, undefined); assert.equal(replay.origin, undefined);
    assert.deepEqual(replay.policy, source.policy);
    assert.deepEqual(replay.results.map(r => r.scenario), source.results.map(r => r.scenario));
    assert.deepEqual(replay.results.map(r => r.decision), source.results.map(r => r.decision));
    assert.equal(replay.replay!.sourceRunId, source.id); assert.equal(replay.replay!.inputIntegrity, 'verified');
    assert.deepEqual(after.runs[1], source); assert.deepEqual(after.policy, before.policy); assert.deepEqual(after.scenarios, before.scenarios);
    assert.deepEqual(after.fixtures, before.fixtures); assert.deepEqual(after.archivedScenarioIds, before.archivedScenarioIds);
    assert.equal(after.runs.length, before.runs.length + 1);
    assert.equal((await w.request(`/api/runs/${source.id}/replay`, 'POST', { agent: 'corrected' })).status, 400);
    assert.equal((await w.request('/api/runs/missing/replay', 'POST', {})).status, 404);
  } finally { await w.close(); }
});

test('import appends unverified external evidence and repeated replay/reimport retains complete source lineage', async () => {
  const w = await workspace();
  try {
    const source = await w.run();
    const document = createEvaluationExport(structuredClone(source));
    document.run.provider = 'paypal'; document.run.agent = 'codex'; document.run.ai = { threadId: 'file-claimed-id', model: 'file-claimed-model' };
    document.run.provenance!.verifierVersion = 'historical-declared-verifier';
    for (const result of document.run.results) {
      result.refunds.forEach(refund => { refund.source = 'paypal'; });
      result.events.find(event => event.kind === 'environment')!.data!.provider = 'paypal';
    }
    const before = await w.store.read();
    const response = await w.request('/api/runs/import', 'POST', document);
    assert.equal(response.status, 200, await response.clone().text());
    const imported = await response.json() as Run;
    assert.notEqual(imported.id, source.id); assert.equal(imported.origin!.sourceRunId, source.id); assert.equal(imported.origin!.kind, 'imported-evidence');
    assert.equal(imported.provider, 'paypal'); assert.deepEqual(imported.ai, document.run.ai);
    const after = await w.store.read();
    assert.deepEqual(after.runs.slice(1), before.runs); assert.deepEqual(after.policy, before.policy); assert.deepEqual(after.scenarios, before.scenarios); assert.deepEqual(after.fixtures, before.fixtures);
    const replay = await (await w.request(`/api/runs/${imported.id}/replay`, 'POST', {})).json() as Run;
    assert.equal(replay.provider, 'simulator'); assert.equal(replay.origin, undefined); assert.equal(replay.ai, undefined);
    assert.deepEqual(replay.replay!.sourceOrigin, imported.origin); assert.equal(replay.replay!.sourceProvider, 'paypal');
    assert.deepEqual(replay.replay!.sourceAI, imported.ai); assert.deepEqual(replay.replay!.sourceProvenance, imported.provenance);
    const replayExport = await (await w.request(`/api/runs/${replay.id}/export`)).json();
    const reimport = await (await w.request('/api/runs/import', 'POST', replayExport)).json() as Run;
    assert.deepEqual(reimport.replay, replay.replay);
    const again = await (await w.request(`/api/runs/${reimport.id}/replay`, 'POST', {})).json() as Run;
    assert.deepEqual(again.replay!.sourceOrigin, reimport.origin); assert.deepEqual(again.replay!.sourceReplay, replay.replay);
    assert.deepEqual(again.replay!.sourceAI, imported.ai);
  } finally { await w.close(); }
});

test('malformed imports and changed source digests reject before adding or replacing stored evidence', async () => {
  const w = await workspace();
  try {
    const source = await w.run();
    const document = createEvaluationExport(source);
    const before = await w.store.read();
    for (const mutate of [
      (d: any) => { d.run.results[0].checks = 'bad'; },
      (d: any) => { d.run.summary.passed = 20; },
      (d: any) => { d.run.results[0].refunds.push({ status: 'COMPLETED' }); },
      (d: any) => { d.run.results[0].scenario.message = 'Changed input.'; },
      (d: any) => { d.run.results.push(d.run.results[0]); },
      (d: any) => { d.run.results = Array(21).fill(d.run.results[0]); },
      (d: any) => { d.run.results[0].decision.customerMessage = 'x'.repeat(1_000_001); },
    ]) {
      const invalid = structuredClone(document); mutate(invalid);
      const response = await w.request('/api/runs/import', 'POST', invalid);
      assert.equal(response.status, 400, await response.clone().text());
      assert.deepEqual(await w.store.read(), before);
    }
    await w.store.update(state => { state.runs[0].results[0].scenario.message = 'Changed after saving.'; });
    const tampered = await w.store.read();
    const rejected = await w.request(`/api/runs/${source.id}/replay`, 'POST', {});
    assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /digest does not match/);
    assert.deepEqual(await w.store.read(), tampered);
  } finally { await w.close(); }
});
