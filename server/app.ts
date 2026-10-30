import express from 'express';
import { appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AgentKind, AppState, CaseResult, Fixture, ProviderKind, RefundGateway, Scenario, ProofAIRequest } from '../shared/types.ts';
import { Store } from './store.ts';
import { executeScenario, expectedActionFor, makeRun, validateScenario } from './engine.ts';
import { decisionPreflight } from './decision-evidence.ts';
import { createAgentInput, createEvaluationExport, validateDecisionBundle } from './decision-bundle.ts';
import { createAgentRequest } from './agent-request.ts';
import { correctedDecision, seededDecision } from '../adapters/example-agent.ts';
import { randomUUID } from 'node:crypto';
import { codexStatus, decideWithCodex, generateScenarios } from './ai.ts';
import { captureFixture, prepareFixture, createPreparedFixture, resumeFixture, fixtureGateway, paypalConfigured } from './paypal.ts';
import { curatedScenarios, defaultPolicy } from '../shared/fixtures.ts';
import { MAX_DECISION_BUNDLE_BYTES } from '../shared/limits.ts';
import { activeScenarios, isScenarioArchived, MAX_ACTIVE_SCENARIOS } from '../shared/scenario-library.ts';
import { fixtureMatchesScenario } from '../shared/fixture-readiness.ts';
import { replayEvidence } from './replay.ts';
import { importEvidence } from './evidence-import.ts';
import type { OperationStatus } from '../shared/operation.ts';
import { createProofDemo, evaluateProofAI, proofInputs } from './proof-demo.ts';
import { summarizeProof } from '../shared/proof-demo.ts';
import { SandboxExecution, unfinishedSandboxCase } from './sandbox-execution.ts';

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function assert(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new HttpError(status, message); }
function scenarioById(scenarios: Scenario[], id: unknown) { const item = scenarios.find(s => s.id === id); assert(item, 'Scenario not found.', 404); return item; }
function assertActiveScenario(state: AppState, id: string) {
  assert(!isScenarioArchived(state, id), 'This scenario is archived. Restore and review it before using it.', 409);
}
function assertFixtureScenarioReady(state: AppState, fixture: Fixture) {
  assert(!fixture.setAsideAt, 'This fixture is set aside. Restore it before using its saved payment state.', 409);
  assertActiveScenario(state, fixture.scenarioId);
  const scenario = scenarioById(state.scenarios, fixture.scenarioId);
  assert(scenario.approved, 'Review and approve this scenario before preparing its payment fixture.');
  assert(fixtureMatchesScenario(fixture, scenario), 'Fixture does not match the current scenario facts. Review its saved payment state and set it aside before preparing a fresh order.');
}
function validateAuthoredScenario(scenario: Scenario) {
  for (const [field, max] of [['title', 200], ['category', 80], ['message', 4000]] as const) {
    assert(typeof scenario[field] === 'string' && scenario[field].trim().length > 0 && scenario[field].length <= max, `${field} must be 1–${max} characters.`);
  }
  for (const field of ['capturedCents', 'priorRefundCents', 'requestedCents'] as const) {
    assert(Number.isSafeInteger(scenario[field]) && scenario[field] >= (field === 'priorRefundCents' ? 0 : 1) && scenario[field] <= 100000, `${field} must be ${field === 'priorRefundCents' ? 0 : 1}–100000 integer cents.`);
  }
  assert(typeof scenario.approved === 'boolean', 'Approval must be true or false.');
  validateScenario(scenario);
}

const journalDir = fileURLToPath(new URL('../.payproof/', import.meta.url));
async function journal(event: Record<string, unknown>) {
  await mkdir(journalDir, { recursive: true });
  await appendFile(`${journalDir}sandbox-journal.ndjson`, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
}
function journaledGateway(gateway: RefundGateway, fixtureId: string, recordJournal = journal): RefundGateway {
  return {
    ...gateway,
    async refund(amountCents, requestId) {
      await recordJournal({ kind: 'refund-request', fixtureId, captureId: gateway.captureId, amountCents, requestId });
      try {
        const refund = await gateway.refund(amountCents, requestId);
        await recordJournal({ kind: 'refund-response', fixtureId, refund });
        return refund;
      } catch (error) {
        await recordJournal({ kind: 'refund-response-unknown', fixtureId, requestId });
        throw error;
      }
    },
    async readRefund(id) {
      const refund = await gateway.readRefund(id);
      await recordJournal({ kind: 'refund-readback', fixtureId, refund });
      return refund;
    },
  };
}

export function createApp(store = new Store(), port = 4318, dependencies: { decideWithCodex?: typeof decideWithCodex; generateScenarios?: typeof generateScenarios; journal?: typeof journal; paypal?: Partial<{ configured: typeof paypalConfigured; createPreparedFixture: typeof createPreparedFixture; captureFixture: typeof captureFixture; resumeFixture: typeof resumeFixture; fixtureGateway: typeof fixtureGateway }> } = {}) {
  const app = express();
  const sandbox = { configured: paypalConfigured, createPreparedFixture, captureFixture, resumeFixture, fixtureGateway, ...dependencies.paypal };
  const recordJournal = dependencies.journal || journal;
  const checkpointFixture = async (fixture: Fixture) => { await store.update(state => { const index = state.fixtures.findIndex(f => f.id === fixture.id); assert(index >= 0, 'Saved fixture was not found.', 404); state.fixtures[index] = structuredClone(fixture); }); };
  app.disable('x-powered-by');
  // Only a same-origin local browser or local CLI may operate the account-bound runner.
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  app.use((req, res, next) => {
    if (!allowedHosts.has(req.headers.host || '')) return res.status(403).json({ error: 'PayProof accepts local connections only.' });
    const origin = req.headers.origin;
    if (origin && ![...allowedHosts].some(host => origin === `http://${host}`)) return res.status(403).json({ error: 'Cross-origin requests are disabled.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (['POST','PATCH','PUT','DELETE'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  const operationStatus: OperationStatus = { active: null, lastFinished: null };
  function savedProof(state: AppState, ids: { baseline: unknown; refusal: unknown; candidate: unknown }) {
    const findRun = (key: keyof typeof ids) => {
      const id = ids[key];
      assert(typeof id === 'string' && id.length > 0, 'The saved comparison link is incomplete. Run a fresh comparison.');
      const run = state.runs.find(run => run.id === id);
      assert(run, 'A comparison run was not found. Run a fresh comparison or inspect Run history.', 404);
      assert(run.provider === 'simulator' && !run.origin && !run.replay, 'The proof comparison requires original local simulator evidence.');
      return run;
    };
    const proof = { baseline: findRun('baseline'), refusal: findRun('refusal'), candidate: findRun('candidate') };
    assert(proof.baseline.agent === 'seeded' && proof.refusal.importedAgent?.version === 'refusal-control-v1'
      && (proof.candidate.agent === 'corrected' || (proof.candidate.agent === 'codex' && proof.candidate.ai)), 'The selected runs are not a supported proof comparison.');
    assert(summarizeProof(proof).comparable, 'These runs do not share the same evaluation inputs. Inspect them in Run history.');
    return proof;
  }
  async function exclusive<T>(kind: string, operation: () => Promise<T>): Promise<T> {
    assert(!operationStatus.active, 'Another operation is still running. Wait for it to finish.', 409);
    const active = { id: randomUUID(), kind, startedAt: new Date().toISOString() };
    operationStatus.active = active;
    let outcome: 'completed' | 'failed' = 'failed';
    try { const result = await operation(); outcome = 'completed'; return result; }
    finally { operationStatus.active = null; operationStatus.lastFinished = { ...active, finishedAt: new Date().toISOString(), outcome }; }
  }
  app.get('/api/operation', (_req, res) => res.json(operationStatus));

  app.get('/api/state', async (_req, res) => res.json(await store.read()));
  app.get('/api/source', (_req, res, next) => {
    const file = fileURLToPath(new URL('../artifacts/payproof-source.zip', import.meta.url));
    res.download(file, 'payproof-source.zip', error => {
      if (error && !res.headersSent) next(new HttpError(404, 'The source bundle is not available yet.'));
    });
  });
  for (const [route, filename] of [['docs', 'README.md'], ['license', 'LICENSE']] as const) {
    app.get(`/api/${route}`, (_req, res, next) => {
      const file = fileURLToPath(new URL(`../${filename}`, import.meta.url));
      res.sendFile(file, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }, error => {
        if (error && !res.headersSent) next(new HttpError(404, 'The requested document is not available.'));
      });
    });
  }
  app.get('/api/status', async (_req, res) => res.json({
    codex: await codexStatus(),
    paypal: { configured: sandbox.configured(), environment: 'sandbox', detail: sandbox.configured() ? 'Sandbox credentials configured. Create and approve a test order to verify the connection.' : 'Add your sandbox client ID and secret to .env, then restart PayProof.' },
  }));
  app.patch('/api/policy', async (req, res) => res.json(await exclusive('Updating policy', async () => {
    const { limitCents, name } = req.body;
    assert(Number.isSafeInteger(limitCents) && limitCents >= 0 && limitCents <= 100000, 'Limit must be 0–100000 integer cents.');
    assert(typeof name === 'string' && name.trim().length > 0 && name.length <= 100, 'Use a policy name under 100 characters.');
    return store.update(state => {
      state.policy = { ...state.policy, limitCents, name: name.trim(), version: state.policy.version + 1 };
      state.scenarios = state.scenarios.map(s => {
        const next = { ...s, expectedAction: expectedActionFor(s, state.policy), approved: s.source === 'curated' && s.approved };
        if (next.generation?.pair) { next.generation = { ...next.generation }; delete next.generation.pair; }
        return next;
      });
      return state.policy;
    });
  })));
  app.post('/api/scenarios', async (req, res) => res.json(await exclusive('Creating scenario', async () => store.update(state => {
    assert(activeScenarios(state).length < MAX_ACTIVE_SCENARIOS, 'The workspace has 60 active scenarios. Archive a scenario to make room.');
    const body = req.body;
    assert(body && typeof body === 'object' && !Array.isArray(body), 'Provide scenario fields.');
    const allowed = ['title','category','message','capturedCents','priorRefundCents','requestedCents','supervisorApproved','fault','approved','policyVersion'];
    assert(Object.keys(body).every(key => allowed.includes(key)), 'Scenario creation contains unsupported fields.');
    const scenario: Scenario = {
      id: `manual-${randomUUID()}`, source: 'manual', title: body.title, category: body.category,
      message: body.message, capturedCents: body.capturedCents, priorRefundCents: body.priorRefundCents,
      requestedCents: body.requestedCents, supervisorApproved: body.supervisorApproved, fault: body.fault,
      approved: body.approved, expectedAction: 'escalate',
    };
    validateAuthoredScenario(scenario);
    if (scenario.approved) assert(body.policyVersion === state.policy.version, 'The policy changed or its version is missing. Review the current policy before approving.');
    scenario.expectedAction = expectedActionFor(scenario, state.policy);
    state.scenarios.push(scenario);
    return scenario;
  }))));
  app.post('/api/scenarios/:id/archive', async (req, res) => res.json(await exclusive('Archiving scenario', async () => store.update(state => {
    const scenario = scenarioById(state.scenarios, req.params.id);
    state.archivedScenarioIds = [...new Set([...(state.archivedScenarioIds || []), scenario.id])];
    return { scenario, archivedScenarioIds: state.archivedScenarioIds };
  }))));
  app.post('/api/scenarios/:id/restore', async (req, res) => res.json(await exclusive('Restoring scenario', async () => store.update(state => {
    const scenario = scenarioById(state.scenarios, req.params.id);
    if (isScenarioArchived(state, scenario.id)) {
      assert(activeScenarios(state).length < MAX_ACTIVE_SCENARIOS, 'The workspace has 60 active scenarios. Archive another scenario before restoring this one.', 409);
      state.archivedScenarioIds = (state.archivedScenarioIds || []).filter(id => id !== scenario.id);
      scenario.approved = false;
      scenario.expectedAction = expectedActionFor(scenario, state.policy);
    }
    return { scenario, archivedScenarioIds: state.archivedScenarioIds || [] };
  }))));
  app.patch('/api/scenarios/:id', async (req, res) => res.json(await exclusive('Saving scenario', async () => store.update(state => {
    const existing = scenarioById(state.scenarios, req.params.id);
    assertActiveScenario(state, existing.id);
    const patch: Partial<Scenario> = {};
    for (const key of ['message','title','category','requestedCents','priorRefundCents','capturedCents','supervisorApproved','fault','approved'] as const) {
      if (key in req.body) (patch as Record<string, unknown>)[key] = req.body[key];
    }
    const next = { ...existing, ...patch };
    validateAuthoredScenario(next);
    next.expectedAction = expectedActionFor(next, state.policy);
    if ('expectedAction' in req.body) assert(req.body.expectedAction === next.expectedAction, 'Expected action conflicts with the current policy. Review the case before approving.');
    if (req.body.approved === true) assert(req.body.policyVersion === state.policy.version, 'The policy changed or its version is missing. Review the current policy before approving.');
    if ('policyVersion' in req.body) assert(req.body.policyVersion === state.policy.version, 'The policy changed. Review the current policy before saving.');
    const contentChanged = Object.entries(patch).some(([key, value]) => key !== 'approved' && value !== existing[key as keyof Scenario]);
    if (contentChanged) {
      next.approved = req.body.approved === true;
      if (existing.source === 'curated') next.source = 'manual';
      if (existing.generation?.pair) {
        const partner = state.scenarios.find(s => s.id === existing.generation!.pair!.partnerId);
        if (partner?.generation?.pair?.id === existing.generation.pair.id) delete partner.generation.pair;
        next.generation = { ...existing.generation }; delete next.generation.pair;
      }
    }
    state.scenarios[state.scenarios.indexOf(existing)] = next;
    return next;
  }))));
  app.post('/api/scenarios/generate', async (_req, res) => res.json(await exclusive('Drafting cases with Codex', async () => {
    const state = await store.read();
    const active = activeScenarios(state);
    assert(active.length <= MAX_ACTIVE_SCENARIOS - 4, 'Drafting needs 4 available slots. Archive active scenarios to make room (60 active-case limit).');
    const result = await (dependencies.generateScenarios || generateScenarios)(state.policy, active);
    await store.update(next => { next.scenarios.push(...result.scenarios); });
    return result;
  })));

  app.post('/api/proof-demo', async (req, res) => res.json(await exclusive('Running proof comparison', async () => {
    assert(req.body && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 0,
      'The proof comparison accepts an empty object and uses its isolated teaching cases.');
    const proof = await createProofDemo();
    await store.update(state => { state.runs.unshift(proof.candidate, proof.refusal, proof.baseline); });
    return proof;
  })));
  app.get('/api/proof-demo', async (req, res) => {
    const state = await store.read();
    res.json(savedProof(state, { baseline: req.query.baseline, refusal: req.query.refusal, candidate: req.query.candidate }));
  });
  app.get('/api/proof-demo/ai/:id', async (req, res) => {
    const state = await store.read();
    const request = state.proofAIRequests?.find(request => request.id === req.params.id);
    assert(request, 'No saved AI request was found. Check Run history before starting another.', 404);
    res.json({ request, active: operationStatus.active?.id === request.operationId,
      ...(request.status === 'completed' ? { proof: savedProof(state, { baseline: request.baselineId, refusal: request.refusalId, candidate: request.runId }) } : {}),
    });
  });
  app.post('/api/proof-demo/ai', async (req, res) => res.json(await exclusive('Evaluating proof with Codex', async () => {
    const body = req.body;
    assert(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 4
      && ['requestId', 'baselineId', 'refusalId', 'candidateId'].every(key => typeof body[key] === 'string'), 'Provide the three saved run IDs and a requestId.');
    assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId), 'Use a stable UUID for the AI request.');
    const state = await store.read();
    const existing = state.proofAIRequests?.find(request => request.id === body.requestId);
    if (existing) {
      assert(existing.baselineId === body.baselineId && existing.refusalId === body.refusalId && existing.candidateId === body.candidateId, 'This request ID belongs to a different comparison.', 409);
      assert(existing.status === 'completed', 'This AI request was already attempted. Inspect its saved status; it will not be called again automatically.', 409);
      return savedProof(state, { baseline: existing.baselineId, refusal: existing.refusalId, candidate: existing.runId });
    }
    const proof = savedProof(state, { baseline: body.baselineId, refusal: body.refusalId, candidate: body.candidateId });
    const defaults = proofInputs();
    assert(createAgentInput(proof.baseline.policy, proof.baseline.results.map(result => result.scenario)).inputDigest === createAgentInput(defaults.policy, defaults.scenarios).inputDigest,
      'The short AI demonstration only sends its fixed synthetic teaching cases. Use the test lab for other inputs.');
    const request: ProofAIRequest = { id: body.requestId, operationId: operationStatus.active!.id, baselineId: body.baselineId,
      refusalId: body.refusalId, candidateId: body.candidateId, status: 'running', startedAt: new Date().toISOString() };
    await store.update(next => { (next.proofAIRequests ||= []).unshift(request); });
    try {
      const candidate = await evaluateProofAI(proof.baseline, dependencies.decideWithCodex || decideWithCodex);
      await store.update(next => {
        next.runs.unshift(candidate);
        Object.assign(next.proofAIRequests!.find(item => item.id === request.id)!, { status: 'completed', runId: candidate.id, finishedAt: new Date().toISOString() });
      });
      return { ...proof, candidate };
    } catch (error) {
      await store.update(next => { Object.assign(next.proofAIRequests!.find(item => item.id === request.id)!, { status: 'failed', error: error instanceof Error ? error.message : 'AI evaluation failed.', finishedAt: new Date().toISOString() }); });
      throw error;
    }
  })));

  app.post('/api/demo', async (req, res) => res.json(await exclusive('Running demo', async () => {
    const agent = req.body?.agent;
    assert(agent === 'seeded' || agent === 'corrected', 'The demo supports seeded or corrected agents.');
    const policy = structuredClone(defaultPolicy);
    const scenarios = curatedScenarios.filter(scenario => ['cumulative-over', 'cumulative-exact'].includes(scenario.id)).map(scenario => structuredClone(scenario));
    const results: CaseResult[] = [];
    for (const scenario of scenarios) results.push(await executeScenario({ scenario, policy, agent }));
    const run = makeRun(policy, agent, 'simulator', results);
    // Demo fixtures and their policy are isolated; only the observed run is added to history.
    await store.update(state => { state.runs.unshift(run); });
    return run;
  })));

  app.post(['/api/agent-input', '/api/agent-request'], async (req, res) => {
    const state = await store.read();
    const ids = req.body?.scenarioIds;
    assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 20 && new Set(ids).size === ids.length, 'Choose 1–20 unique scenarios.');
    const scenarios = ids.map((id: unknown) => scenarioById(state.scenarios, id));
    for (const scenario of scenarios) {
      assertActiveScenario(state, scenario.id);
      validateScenario(scenario, state.policy);
      assert(scenario.approved, 'Review and approve scenarios before exporting them.');
    }
    const input = createAgentInput(state.policy, scenarios);
    const agentFacing = req.path === '/api/agent-request';
    res.setHeader('Content-Disposition', `attachment; filename="${agentFacing ? 'payproof-agent-request' : 'payproof-agent-input'}.json"`);
    res.json(agentFacing ? createAgentRequest(input) : input);
  });

  app.post('/api/runs', async (req, res) => res.json(await exclusive('Evaluating agent decisions', async () => {
    const state = await store.read();
    const agent = req.body.agent as AgentKind;
    const provider = req.body.provider as ProviderKind;
    assert(['seeded','corrected','codex','imported'].includes(agent), 'Select a supported agent.');
    assert(['simulator','paypal'].includes(provider), 'Select simulator or PayPal Sandbox.');
    const ids = req.body.scenarioIds;
    assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 20 && new Set(ids).size === ids.length, 'Choose 1–20 unique scenarios.');
    const scenarios = ids.map((id: unknown) => scenarioById(state.scenarios, id));
    for (const scenario of scenarios) {
      assertActiveScenario(state, scenario.id);
      validateScenario(scenario, state.policy);
      assert(scenario.approved, 'Review and approve scenarios before running them.');
    }
    const input = createAgentInput(state.policy, scenarios);
    const imported = agent === 'imported' ? validateDecisionBundle(req.body.decisionBundle, input) : undefined;
    const finishRun = (results: CaseResult[]) => {
      const run = makeRun(state.policy, agent, provider, results);
      run.provenance!.inputDigest = input.inputDigest;
      if (imported) { run.importedAgent = imported.agent; run.provenance!.agentVersion = imported.agent.version; }
      return run;
    };
    let fixtures: Fixture[] = [];
    if (provider === 'paypal') {
      assert(sandbox.configured(), 'Configure PayPal Sandbox credentials first.');
      const fixtureIds = req.body.fixtureIds;
      assert(Array.isArray(fixtureIds) && fixtureIds.length === scenarios.length && new Set(fixtureIds).size === fixtureIds.length, 'Use one fresh captured fixture per case.');
      fixtures = fixtureIds.map((id: string) => {
        const fixture = state.fixtures.find(f => f.id === id);
        assert(fixture?.status === 'CAPTURED', 'Each fixture must be captured and unused.');
        assert(!fixture.setAsideAt, 'This fixture is set aside. Restore it before using its saved payment state.', 409);
        return fixture;
      });
      for (const scenario of scenarios) {
        assert(!['pending','readback-failure'].includes(scenario.fault), 'This injected fault is available in the simulator only.');
        const fixture = fixtures.find(f => f.scenarioId === scenario.id);
        assert(fixture && fixtureMatchesScenario(fixture, scenario), 'Fixture does not match the current case facts. Review its saved payment state before preparing a fresh order.');
      }
    }
    const aiResult = agent === 'codex' ? await (dependencies.decideWithCodex || decideWithCodex)(state.policy, scenarios) : undefined;
    const decisions = new Map(scenarios.map(s => [s.id, imported ? imported.decisions.get(s.id) : agent === 'codex' ? aiResult?.decisions.get(s.id) : agent === 'seeded' ? seededDecision(s, state.policy) : correctedDecision(s, state.policy)]));
    const rejected = decisionPreflight(scenarios, state.policy, decisions);
    if (rejected) {
      const run = finishRun(rejected);
      if (aiResult) run.ai = aiResult.ai;
      await store.update(next => { next.runs.unshift(run); });
      return run;
    }
    let execution: SandboxExecution | undefined;
    if (provider === 'paypal') {
      const reserved = finishRun(scenarios.map(scenario => unfinishedSandboxCase(scenario, decisions.get(scenario.id)!, state.policy)));
      if (aiResult) reserved.ai = aiResult.ai;
      execution = await SandboxExecution.begin(store, reserved);
    }
    const results: CaseResult[] = [];
    let interrupted = false;
    for (const scenario of scenarios) {
      let result: CaseResult | undefined;
      try {
        if (interrupted) throw new Error('Earlier case interrupted.');
        const fixture = fixtures.find(f => f.scenarioId === scenario.id);
        let gateway = fixture ? journaledGateway(sandbox.fixtureGateway(fixture), fixture.id, recordJournal) : undefined;
        if (fixture && execution && gateway) {
          await execution.reserveFixture(fixture.id, scenario.id);
          gateway = execution.gateway(scenario.id, gateway);
        }
        result = await executeScenario({ scenario, policy: state.policy, agent, gateway, decision: agent === 'codex' || agent === 'imported' ? decisions.get(scenario.id) : undefined });
        if (fixture) await recordJournal({ kind: 'case-completed', fixtureId: fixture.id, policy: state.policy, agent, result });
      } catch {
        const detail = interrupted ? 'This case was not executed because an earlier case was interrupted.' : 'Runner stopped unexpectedly. Inspect the local sandbox journal before any retry; no operation is automatically repeated.';
        result ??= { id: randomUUID(), scenario, decision: decisions.get(scenario.id)!, expectedAction: expectedActionFor(scenario, state.policy), verdict: 'inconclusive',
          checks: [{ name: 'Runner completion', status: 'unknown', detail }], events: [],
          refunds: [], attemptedCents: 0, observedRefundCents: 0, totalRefundCents: 0, excessCents: 0, evidenceComplete: false, durationMs: 0 };
        result.events.push({ at: new Date().toISOString(), kind: 'runner-error', title: 'Execution interrupted', detail });
        interrupted = true;
      }
      if (execution) await execution.completeCase(scenario.id, result!);
      results.push(result!);
    }
    if (execution) return execution.snapshot();
    const run = finishRun(results);
    if (aiResult) run.ai = aiResult.ai;
    await store.update(next => { next.runs.unshift(run); });
    return run;
  })));

  app.post('/api/runs/import', async (req, res) => res.json(await exclusive('Importing evidence', async () => {
    const run = importEvidence(req.body);
    await store.update(state => { state.runs.unshift(run); });
    return run;
  })));

  app.post('/api/runs/:id/replay', async (req, res) => res.json(await exclusive('Replaying saved inputs', async () => {
    assert(req.body && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 0,
      'Replay accepts an empty object and reuses the saved decisions. New decisions require a separate evaluation.');
    const original = (await store.read()).runs.find(run => run.id === req.params.id);
    assert(original, 'Run not found.', 404);
    const run = await replayEvidence({ schemaVersion: 1, run: original });
    await store.update(state => { state.runs.unshift(run); });
    return run;
  })));

  app.get('/api/runs/:id/export', async (req, res) => {
    const run = (await store.read()).runs.find(r => r.id === req.params.id);
    assert(run, 'Run not found.', 404);
    res.setHeader('Content-Disposition', `attachment; filename="payproof-${run.id}.json"`);
    res.json(createEvaluationExport(run));
  });

  app.post('/api/sandbox/fixtures', async (req, res) => res.json(await exclusive('Preparing Sandbox order', async () => {
    const state = await store.read();
    const scenario = scenarioById(state.scenarios, req.body.scenarioId);
    assertActiveScenario(state, scenario.id);
    assert(scenario.approved, 'Approve this case first.');
    assert(!['pending','readback-failure'].includes(scenario.fault), 'Choose a case without a simulator-only fault.');
    assert(sandbox.configured(), 'Add PayPal Sandbox credentials to .env and restart.');
    const operationId = req.body.operationId;
    assert(typeof operationId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(operationId), 'Use a stable UUID operationId when creating a sandbox fixture.');
    const existing = state.fixtures.find(f => f.id === operationId);
    if (existing) {
      assert(!existing.setAsideAt, 'This operation ID belongs to a set-aside fixture. Use a fresh operation ID for a new order.', 409);
      assert(fixtureMatchesScenario(existing, scenario), 'This operation ID belongs to different scenario inputs.');
      return existing.status === 'UNKNOWN' ? sandbox.resumeFixture(existing, checkpointFixture) : existing;
    }
    assert(!state.fixtures.some(f => !f.setAsideAt && f.scenarioId === scenario.id && ['UNKNOWN', 'CREATED'].includes(f.status)), 'Resume, approve, or explicitly set aside the unfinished fixture for this scenario before creating another.');
    const base = `http://127.0.0.1:${port}`;
    const draft = prepareFixture(scenario, `${base}/app?view=connections&paypal=approved`, `${base}/app?view=connections&paypal=cancelled`, operationId);
    await store.update(next => { next.fixtures.unshift(draft); });
    return sandbox.createPreparedFixture(draft, checkpointFixture);
  })));
  app.post('/api/sandbox/fixtures/:id/set-aside', async (req, res) => res.json(await exclusive('Setting aside saved fixture', async () => store.update(state => {
    const fixture = state.fixtures.find(f => f.id === req.params.id);
    assert(fixture, 'Fixture not found.', 404);
    assert(fixture.status !== 'USED', 'Used fixtures are retained as execution evidence and cannot be set aside.', 409);
    fixture.setAsideAt ||= new Date().toISOString();
    return fixture;
  }))));
  app.post('/api/sandbox/fixtures/:id/restore', async (req, res) => res.json(await exclusive('Restoring saved fixture', async () => store.update(state => {
    const fixture = state.fixtures.find(f => f.id === req.params.id);
    assert(fixture, 'Fixture not found.', 404);
    assert(fixture.status !== 'USED', 'Used fixtures cannot be restored for another execution.', 409);
    if (fixture.setAsideAt) {
      assert(!state.fixtures.some(other => other.id !== fixture.id && !other.setAsideAt && other.scenarioId === fixture.scenarioId && ['CREATED', 'UNKNOWN'].includes(other.status)), 'Another unfinished fixture is active for this scenario. Review and set it aside before restoring this one.', 409);
      delete fixture.setAsideAt;
    }
    return fixture;
  }))));
  app.post('/api/sandbox/fixtures/:id/capture', async (req, res) => res.json(await exclusive('Capturing Sandbox order', async () => {
    const state = await store.read();
    const fixture = state.fixtures.find(f => f.id === req.params.id);
    assert(fixture, 'Fixture not found.', 404);
    assertFixtureScenarioReady(state, fixture);
    assert(fixture.status !== 'USED', 'This fixture has already been used. Create a fresh order.');
    if (fixture.status === 'CAPTURED') return fixture;
    await recordJournal({ kind: 'fixture-capture-start', fixtureId: fixture.id, orderId: fixture.orderId, captureRequestId: fixture.captureRequestId, seedRequestId: fixture.seedRequestId });
    const captured = await sandbox.captureFixture(fixture, checkpointFixture);
    return captured;
  })));
  app.post('/api/sandbox/fixtures/:id/resume', async (req, res) => res.json(await exclusive('Checking Sandbox preparation', async () => {
    const state = await store.read();
    const fixture = state.fixtures.find(f => f.id === req.params.id);
    assert(fixture, 'Fixture not found.', 404);
    assertFixtureScenarioReady(state, fixture);
    assert(sandbox.configured(), 'Configure PayPal Sandbox credentials first.');
    assert(fixture.status !== 'USED', 'Used fixtures cannot be resumed.');
    return sandbox.resumeFixture(fixture, checkpointFixture);
  })));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if ((error as Error & { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: `Request body is too large. Keep the decision bundle at or below ${MAX_DECISION_BUNDLE_BYTES.toLocaleString('en-US')} UTF-8 JSON bytes and the full request below 1 MiB.` });
      return;
    }
    const status = error instanceof HttpError ? error.status : 400;
    res.status(status).json({ error: error.message || 'The operation could not be completed.' });
  });
  return app;
}
