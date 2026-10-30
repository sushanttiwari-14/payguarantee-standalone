import type { AgentInput, Run } from '../shared/types.ts';
import { createAgentInput } from './decision-bundle.ts';
import { validateScenario } from './engine.ts';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function identity(value: unknown, label: string, max = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must be 1–${max} characters.`);
}

/** Validate source inputs before any simulator call; this checks input binding, not a signed full-run attestation. */
export function validateReplaySource(value: unknown): { run: Run; input: AgentInput; inputIntegrity: 'verified' | 'unverified-legacy' } {
  const document = object(value, 'Replay export');
  if (document.schemaVersion !== 1) throw new Error('Not a supported PayProof regression export.');
  const source = object(document.run, 'Source run');
  identity(source.id, 'Source run ID');
  if (typeof source.createdAt !== 'string' || !Number.isFinite(Date.parse(source.createdAt))) throw new Error('The source run has an invalid creation time.');
  if (!['simulator', 'paypal'].includes(String(source.provider))) throw new Error('The source run has an invalid evidence provider.');
  if (!['seeded', 'corrected', 'codex', 'imported'].includes(String(source.agent))) throw new Error('The source run has an invalid agent kind.');
  if (!Array.isArray(source.results) || !source.results.length || source.results.length > 20) throw new Error('Replay needs 1–20 recorded cases.');
  const resultIds = new Set<string>();
  for (const value of source.results) {
    const result = object(value, 'Recorded case result');
    identity(result.id, 'Recorded case result ID');
    if (resultIds.has(result.id)) throw new Error('Replay has duplicate case result IDs.');
    resultIds.add(result.id);
    const scenario = object(result.scenario, 'Recorded scenario');
    identity(scenario.title, 'Scenario title'); identity(scenario.category, 'Scenario category', 80);
    // The policy and bounded input fields are checked together below by createAgentInput.
    validateScenario(scenario as unknown as Run['results'][number]['scenario'], source.policy as Run['policy']);
    if (scenario.approved !== true) throw new Error('Replay requires the approved scenario snapshots recorded at execution.');
    if (result.decisionValid !== undefined && result.decisionValid !== false) throw new Error('Recorded decision validity is malformed.');
    if (result.decisionValid === false && !Object.hasOwn(result, 'submittedDecision')) throw new Error('The rejected recorded decision is missing its submitted evidence.');
    if (result.decisionValid !== false && !Object.hasOwn(result, 'decision')) throw new Error('The recorded agent decision is missing.');
  }
  const run = source as unknown as Run;
  const input = createAgentInput(run.policy, run.results.map(result => result.scenario));
  let inputIntegrity: 'verified' | 'unverified-legacy' = 'unverified-legacy';
  if (source.provenance !== undefined) {
    const provenance = object(source.provenance, 'Source provenance');
    identity(provenance.verifierVersion, 'Recorded verifier version');
    identity(provenance.agentVersion, 'Recorded agent version');
    if (Object.hasOwn(provenance, 'inputDigest')) {
      if (typeof provenance.inputDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(provenance.inputDigest)) throw new Error('The recorded input digest is malformed.');
      if (provenance.inputDigest !== input.inputDigest) throw new Error('Recorded input digest does not match the source policy and scenarios. The source inputs changed; replay was stopped before evaluation.');
      inputIntegrity = 'verified';
    }
  }
  if (source.importedAgent !== undefined) {
    const agent = object(source.importedAgent, 'Recorded imported agent');
    identity(agent.name, 'Recorded agent name', 100); identity(agent.version, 'Recorded agent version', 100);
  }
  if (run.agent === 'imported' && !run.importedAgent) throw new Error('The imported source run is missing its agent identity.');
  return { run: structuredClone(run), input, inputIntegrity };
}
