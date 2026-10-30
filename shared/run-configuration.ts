import type { AgentKind, Policy, ProviderKind, Run, Scenario } from './types.ts';

/** Compare only evaluation facts, so editing a library label doesn't imply a changed test. */
export function configurationDifferences(run: Run, next: { agent: AgentKind; provider: ProviderKind; policy: Policy; scenarios: Scenario[] }): string[] {
  const differences: string[] = [];
  if (run.agent !== next.agent) differences.push('agent');
  if (run.provider !== next.provider) differences.push('evidence source');
  if (['id', 'name', 'currency', 'limitCents', 'version'].some(key => run.policy[key as keyof Policy] !== next.policy[key as keyof Policy])) differences.push('policy');
  const recorded = new Map(run.results.map(result => [result.scenario.id, result.scenario]));
  if (recorded.size !== next.scenarios.length || next.scenarios.some(scenario => !recorded.has(scenario.id))) differences.push('selected cases');
  const fields = ['message', 'capturedCents', 'priorRefundCents', 'requestedCents', 'supervisorApproved', 'fault'] as const;
  if (next.scenarios.some(scenario => {
    const saved = recorded.get(scenario.id);
    return saved && fields.some(field => saved[field] !== scenario[field]);
  })) differences.push('case inputs');
  return differences;
}
