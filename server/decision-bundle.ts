import { createHash } from 'node:crypto';
import type { AgentInput, AgentInputScenario, Decision, ImportedAgent, Policy, Run, Scenario } from '../shared/types.ts';
import { MAX_DECISION_BUNDLE_BYTES } from '../shared/limits.ts';
import { expectedActionFor, validateScenario } from './engine.ts';
import { agentRequestIdentityMap } from './agent-request.ts';

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw new Error(`${label} has missing or unexpected fields.`);
  return row;
}
function text(value: unknown, max: number, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must be 1–${max} characters.`);
}
function cents(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 100000) throw new Error(`${label} must be 0–100000 integer cents.`);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(policy: Policy, scenarios: AgentInputScenario[]) {
  return `sha256:${createHash('sha256').update(canonical({ schemaVersion: 1, policy, scenarios: [...scenarios].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) })).digest('hex')}`;
}

/** Schema-1 harness fixture retained for reproducible evaluation and historical replay. */
export function createAgentInput(policy: Policy, scenarios: Scenario[]): AgentInput {
  const inputs = scenarios.map(({ id, message, capturedCents, priorRefundCents, requestedCents, supervisorApproved, fault }) =>
    ({ id, message, capturedCents, priorRefundCents, requestedCents, supervisorApproved, fault }));
  return validateAgentInput({ schemaVersion: 1, inputDigest: digest(policy, inputs), policy: structuredClone(policy), scenarios: inputs });
}

export function validateAgentInput(value: unknown): AgentInput {
  const input = object(value, ['schemaVersion', 'inputDigest', 'policy', 'scenarios'], 'Agent input');
  if (input.schemaVersion !== 1) throw new Error('Unsupported agent input schemaVersion.');
  if (typeof input.inputDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(input.inputDigest)) throw new Error('Invalid agent input digest.');
  const policy = object(input.policy, ['id', 'name', 'currency', 'limitCents', 'version'], 'Policy');
  text(policy.id, 200, 'Policy ID'); text(policy.name, 100, 'Policy name'); cents(policy.limitCents, 'Policy limit');
  if (policy.currency !== 'USD' || !Number.isSafeInteger(policy.version) || (policy.version as number) < 1) throw new Error('Invalid policy currency or version.');
  if (!Array.isArray(input.scenarios) || !input.scenarios.length || input.scenarios.length > 20) throw new Error('Agent input needs 1–20 scenarios.');
  const ids = new Set<string>();
  for (const value of input.scenarios) {
    const scenario = object(value, ['id', 'message', 'capturedCents', 'priorRefundCents', 'requestedCents', 'supervisorApproved', 'fault'], 'Agent input scenario');
    text(scenario.id, 200, 'Scenario ID'); text(scenario.message, 4000, 'Customer message');
    if (ids.has(scenario.id)) throw new Error('Agent input has duplicate scenario IDs.');
    ids.add(scenario.id);
    for (const field of ['capturedCents', 'priorRefundCents', 'requestedCents']) cents(scenario[field], field);
    validateScenario({ ...scenario, title: scenario.id, category: 'Imported', expectedAction: 'escalate', source: 'curated', approved: true } as Scenario);
  }
  const result = input as unknown as AgentInput;
  if (digest(result.policy, result.scenarios) !== result.inputDigest) throw new Error('Agent input digest does not match its policy and scenarios. Export a fresh input.');
  return structuredClone(result);
}

export function scenariosFromAgentInput(input: AgentInput): Scenario[] {
  return input.scenarios.map(row => {
    const scenario: Scenario = { ...row, title: row.id, category: 'Imported', expectedAction: 'escalate', source: 'curated', approved: true };
    scenario.expectedAction = expectedActionFor(scenario, input.policy);
    return scenario;
  });
}

/** Envelope errors reject before execution; semantic action errors remain evaluation evidence. */
export function validateDecisionBundle(value: unknown, input: AgentInput): { agent: ImportedAgent; decisions: Map<string, Decision> } {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); }
  catch { throw new Error('Decision bundle must be serializable JSON.'); }
  if (serialized === undefined) throw new Error('Decision bundle must be serializable JSON.');
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DECISION_BUNDLE_BYTES) {
    throw new Error(`Decision bundle exceeds the ${MAX_DECISION_BUNDLE_BYTES.toLocaleString('en-US')}-byte UTF-8 JSON limit. Reduce its size before running it.`);
  }
  const bundle = object(value, ['schemaVersion', 'inputDigest', 'agent', 'decisions'], 'Decision bundle');
  if (bundle.schemaVersion !== 1 && bundle.schemaVersion !== 2) throw new Error('Unsupported decision bundle schemaVersion.');
  if (bundle.inputDigest !== input.inputDigest) throw new Error('Decision bundle input digest is stale or does not match the selected policy and scenarios. Export fresh input and decisions.');
  const agent = object(bundle.agent, ['name', 'version'], 'Imported agent');
  text(agent.name, 100, 'Agent name'); text(agent.version, 100, 'Agent version');
  if (!Array.isArray(bundle.decisions) || bundle.decisions.length !== input.scenarios.length) throw new Error('Provide exactly one decision for every selected scenario.');
  const identities = bundle.schemaVersion === 2 ? agentRequestIdentityMap(input) : new Map(input.scenarios.map(scenario => [scenario.id, scenario.id]));
  const decisions = new Map<string, Decision>();
  for (const value of bundle.decisions) {
    const row = object(value, ['scenarioId', 'action', 'amountCents', 'reason', 'customerMessage'], 'Imported decision');
    const sourceId = typeof row.scenarioId === 'string' ? identities.get(row.scenarioId) : undefined;
    if (!sourceId || decisions.has(sourceId)) throw new Error('Decision scenario IDs must match the selected schema exactly, without duplicates or mixed original/opaque IDs.');
    if (row.action !== 'refund' && row.action !== 'escalate') throw new Error('Decision action must be refund or escalate.');
    cents(row.amountCents, 'Decision amount'); text(row.reason, 4000, 'Decision reason'); text(row.customerMessage, 4000, 'Customer message');
    decisions.set(sourceId, { action: row.action, amountCents: row.amountCents as number, reason: row.reason, customerMessage: row.customerMessage });
  }
  return { agent: { name: agent.name, version: agent.version }, decisions };
}

export function createEvaluationExport(run: Run) {
  return { schemaVersion: 1, appVersion: '0.1.0', exportedAt: new Date().toISOString(), scope: 'Controlled fixture and known refund IDs only. Passing cases are not production certification.', replay: 'npm run replay -- path/to/export.json', run };
}
