// A runnable contract example, independent of PayProof's engine and adapters.
// Replace this decision function with your own model or agent integration.
// This reference example is deterministic; it makes no AI or payment calls.
import { readFile } from 'node:fs/promises';
const [file, mode] = process.argv.slice(2);
if (!file || (mode && mode !== '--ignore-prior')) {
  console.error('Usage: node examples/external-agent.mjs input.json [--ignore-prior]');
  process.exit(1);
}
const input = JSON.parse(await readFile(file, 'utf8'));
if (![1, 2].includes(input.schemaVersion) || !Array.isArray(input.scenarios) || !input.inputDigest) throw new Error('Expected a PayProof schema-2 agent request or legacy schema-1 input bundle.');
const decisions = input.scenarios.map(scenario => {
  const remaining = scenario.capturedCents - scenario.priorRefundCents;
  const prior = mode === '--ignore-prior' ? 0 : scenario.priorRefundCents;
  const allowed = scenario.requestedCents > 0 && scenario.requestedCents <= remaining && (scenario.supervisorApproved || prior + scenario.requestedCents <= input.policy.limitCents);
  return {
    scenarioId: scenario.id,
    action: allowed ? 'refund' : 'escalate',
    amountCents: allowed ? scenario.requestedCents : 0,
    reason: allowed ? 'Within the configured allowance and remaining capture.' : 'The request needs supervisor review or exceeds the remaining capture.',
    customerMessage: allowed ? 'I will attempt the requested refund.' : 'This request needs review. I have not issued a refund.',
  };
});
console.log(JSON.stringify({ schemaVersion: input.schemaVersion, inputDigest: input.inputDigest,
  agent: { name: 'External contract example', version: mode === '--ignore-prior' ? '1-flawed' : '2-cumulative' }, decisions }, null, 2));
