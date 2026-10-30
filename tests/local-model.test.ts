import test from 'node:test';
import assert from 'node:assert/strict';
import { requestLocalDecisions, evaluateLocalDecisions, LOCAL_MODEL } from '../server/local-model.ts';
import { createAgentInput, createEvaluationExport } from '../server/decision-bundle.ts';
import { createAgentRequest } from '../server/agent-request.ts';
import { proofInputs } from '../server/proof-demo.ts';
import { importEvidence } from '../server/evidence-import.ts';
import { replayEvidence } from '../server/replay.ts';

const fixed = proofInputs();
const input = createAgentInput(fixed.policy, fixed.scenarios);
const digest = 'a'.repeat(64);
const model = { name: LOCAL_MODEL, digest, size: 523000000, details: { format: 'gguf' } };
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const decision = (id: string, action: 'refund' | 'escalate', amountCents: number) => ({ scenarioId: id, action, amountCents, reason: 'Local model test response.', customerMessage: action === 'refund' ? 'I will attempt the requested refund.' : 'This request needs review.' });
const aliases = createAgentRequest(input).scenarios.map(s => s.id);

test('local inference sends opaque inputs to loopback only and saves exact response before evaluation', async () => {
  const saved = new Map<string, any>();
  const calls: string[] = [];
  const value = { decisions: [decision(aliases[0], 'refund', 1000), decision(aliases[1], 'refund', 500)] };
  const fake: typeof fetch = async (url, init) => {
    const path = String(url); calls.push(path);
    assert.ok(path.startsWith('http://127.0.0.1:11434/api/'));
    assert.equal(init?.redirect, 'error');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    if (path.endsWith('/tags')) return response({ models: [model] });
    if (path.endsWith('/version')) return response({ version: 'test-runtime' });
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, LOCAL_MODEL);
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.tools, undefined);
    const sent = JSON.stringify(body);
    for (const hidden of ['cumulative-over', 'cumulative-exact', 'expectedAction', 'fault', 'corrected', 'seeded']) assert.ok(!sent.includes(hidden));
    assert.ok(saved.has('request.json'));
    return response({ model: LOCAL_MODEL, done: true, done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(value) } });
  };
  const result = await requestLocalDecisions(input, async (name, data) => { saved.set(name, data); }, fake);
  assert.deepEqual(result.value, value);
  assert.equal(calls.filter(p => p.endsWith('/chat')).length, 1);
  assert.deepEqual(JSON.parse(saved.get('response.json').message.content), value);
  assert.equal(result.observation.model.digest, digest);
  const run = await evaluateLocalDecisions(input, result.value, digest);
  assert.equal(run.agent, 'imported');
  assert.equal(run.provider, 'simulator');
  assert.equal(run.ai, undefined);
  assert.equal(run.summary.failed, 1); // A bad local answer must remain a failure.
  assert.equal(run.summary.passed, 1);
  const imported = importEvidence(createEvaluationExport(run));
  const replay = await replayEvidence(createEvaluationExport(imported));
  assert.deepEqual(replay.results.map(r => r.verdict), run.results.map(r => r.verdict));
  assert.deepEqual(replay.results.map(r => r.decision), run.results.map(r => r.decision));
});

test('cloud metadata and missing local weights stop before inference', async () => {
  for (const models of [[], [{ ...model, remote_host: 'https://ollama.com' }], [{ ...model, details: { format: '' } }]]) {
    let calls = 0;
    await assert.rejects(requestLocalDecisions(input, async () => undefined, async url => {
      calls++; assert.ok(String(url).endsWith('/tags')); return response({ models });
    }));
    assert.equal(calls, 1);
  }
});

test('incomplete, invalid JSON and model-change responses are retained without retry', async () => {
  for (const mode of ['incomplete', 'invalid-json', 'changed-model']) {
    const saved = new Map<string, any>();
    let chats = 0, tags = 0;
    await assert.rejects(requestLocalDecisions(input, async (name, data) => { saved.set(name, data); }, async url => {
      if (String(url).endsWith('/tags')) {
        tags++;
        return response({ models: [{ ...model, digest: mode === 'changed-model' && tags > 1 ? 'b'.repeat(64) : digest }] });
      }
      if (String(url).endsWith('/version')) return response({ version: 'test-runtime' });
      chats++;
      return response({ model: LOCAL_MODEL, done: true, done_reason: mode === 'incomplete' ? 'length' : 'stop', message: { role: 'assistant', content: mode === 'invalid-json' ? '{broken' : '{"decisions":[]}' } });
    }));
    assert.equal(chats, 1);
    assert.ok(saved.has('response.json'));
    assert.equal(saved.has('inference.json'), false);
  }
});

test('malformed structured output remains failed evidence with no simulated payment attempts', async () => {
  const value = { decisions: [decision(aliases[0], 'escalate', 0)] };
  const run = await evaluateLocalDecisions(input, value, digest);
  assert.ok(run.summary.failed > 0);
  assert.ok(run.results.every(r => r.attemptedCents === 0 && !r.evidenceComplete));
  assert.equal(run.results[0].decisionValid, false);
  assert.deepEqual((run.results[0].submittedDecision as any).structuredResponse, value);
  assert.doesNotThrow(() => importEvidence(createEvaluationExport(run)));
});

test('unavailable runtime and oversized responses stop without saved inference', async () => {
  const saved: string[] = [];
  await assert.rejects(requestLocalDecisions(input, async name => { saved.push(name); }, async () => { throw new Error('unavailable'); }), /unavailable/);
  await assert.rejects(requestLocalDecisions(input, async name => { saved.push(name); }, async () => new Response('x'.repeat(1_048_577))), /exceeds/);
  assert.deepEqual(saved, []);
});

test('oversized model input is rejected before a runtime can truncate policy or customer facts', async () => {
  const large = createAgentInput(fixed.policy, fixed.scenarios.map(s => ({ ...s, message: 'x'.repeat(4000) })));
  let chats = 0;
  await assert.rejects(requestLocalDecisions(large, async () => undefined, async url => {
    if (String(url).endsWith('/tags')) return response({ models: [model] });
    if (String(url).endsWith('/version')) return response({ version: 'test-runtime' });
    chats++;
    throw new Error('Unexpected inference');
  }), /too large/);
  assert.equal(chats, 0);
});
