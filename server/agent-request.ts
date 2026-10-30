import { createHash } from 'node:crypto';
import type { AgentInput, AgentRequest } from '../shared/types.ts';

/** Accept a validated schema-1 fixture; do not expose this mapping to the agent. */
export function agentRequestIdentityMap(input: AgentInput): Map<string, string> {
  return new Map(input.scenarios.map(scenario => {
    const alias = `case_${createHash('sha256').update(JSON.stringify(['payproof-agent-request/2', input.inputDigest, scenario.id])).digest('hex')}`;
    return [alias, scenario.id];
  }));
}

/** Keep labels and future harness faults out of the decision component's view. */
export function createAgentRequest(input: AgentInput): AgentRequest {
  const aliases = new Map([...agentRequestIdentityMap(input)].map(([alias, id]) => [id, alias]));
  return {
    schemaVersion: 2,
    inputDigest: input.inputDigest,
    policy: structuredClone(input.policy),
    scenarios: input.scenarios.map(({ id, message, capturedCents, priorRefundCents, requestedCents, supervisorApproved }) => ({
      id: aliases.get(id)!, message, capturedCents, priorRefundCents, requestedCents, supervisorApproved,
    })),
  };
}
