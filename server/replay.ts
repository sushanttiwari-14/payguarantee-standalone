import type { AgentKind, Run } from '../shared/types.ts';
import { executeScenario, makeRun } from './engine.ts';
import { decisionPreflight } from './decision-evidence.ts';
import { validateReplaySource } from './replay-input.ts';

/** Replays immutable snapshots locally. This module has no AI or payment adapter dependency. */
export async function replayEvidence(document: unknown, replacementAgent?: 'seeded' | 'corrected'): Promise<Run> {
  if (replacementAgent !== undefined && !['seeded', 'corrected'].includes(replacementAgent)) throw new Error('Unsupported teaching-agent override.');
  const { run: original, input, inputIntegrity } = validateReplaySource(document);
  const agent: AgentKind = replacementAgent || original.agent;
  const rejected = !replacementAgent ? decisionPreflight(original.results.map(result => result.scenario), original.policy,
    new Map(original.results.map(result => [result.scenario.id, result.decisionValid === false ? result.submittedDecision : result.decision]))) : null;
  const results = rejected || [];
  for (const result of rejected ? [] : original.results) {
    results.push(await executeScenario({ scenario: result.scenario, policy: original.policy, agent,
      decision: !replacementAgent ? result.decision : undefined }));
  }
  const run = makeRun(original.policy, agent, 'simulator', results);
  const sourceAI = original.ai ?? original.replay?.sourceAI;
  run.replay = {
    sourceRunId: original.id, sourceProvider: original.provider, sourceCreatedAt: original.createdAt, sourceAgent: original.agent, inputIntegrity,
    ...(original.provenance ? { sourceProvenance: structuredClone(original.provenance) } : {}),
    ...(sourceAI ? { sourceAI: structuredClone(sourceAI) } : {}),
    ...(original.importedAgent ? { sourceImportedAgent: structuredClone(original.importedAgent) } : {}),
    ...(original.origin ? { sourceOrigin: structuredClone(original.origin) } : {}),
    ...(original.replay ? { sourceReplay: structuredClone(original.replay) } : {}),
    decisions: replacementAgent ? 'replaced' : 'reused',
    ...(replacementAgent ? { replacementAgent } : {}),
  };
  if (!replacementAgent) {
    if (original.importedAgent) run.importedAgent = structuredClone(original.importedAgent);
    run.provenance!.agentVersion = original.provenance?.agentVersion || original.importedAgent?.version || 'recorded-agent-version-unknown';
  }
  run.provenance!.inputDigest = input.inputDigest;
  return run;
}
