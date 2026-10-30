import { readFile, writeFile } from 'node:fs/promises';
import { createEvaluationExport, scenariosFromAgentInput, validateAgentInput, validateDecisionBundle } from '../server/decision-bundle.ts';
import { decisionPreflight } from '../server/decision-evidence.ts';
import { executeScenario, makeRun } from '../server/engine.ts';

const [inputFile, decisionsFile, option, outputFile, ...extra] = process.argv.slice(2);
if (!inputFile || !decisionsFile || (option && (option !== '--out' || !outputFile)) || extra.length) {
  console.error('Usage: npm run evaluate -- agent-input.json decisions.json [--out regression.json]');
  process.exit(1);
}
try {
  const input = validateAgentInput(JSON.parse(await readFile(inputFile, 'utf8')));
  const bundle = validateDecisionBundle(JSON.parse(await readFile(decisionsFile, 'utf8')), input);
  const scenarios = scenariosFromAgentInput(input);
  const rejected = decisionPreflight(scenarios, input.policy, bundle.decisions);
  const results = rejected || [];
  for (const scenario of rejected ? [] : scenarios) {
    results.push(await executeScenario({ scenario, policy: input.policy, agent: 'imported', decision: bundle.decisions.get(scenario.id) }));
  }
  const run = makeRun(input.policy, 'imported', 'simulator', results);
  run.importedAgent = bundle.agent;
  run.provenance = { ...run.provenance!, agentVersion: bundle.agent.version, inputDigest: input.inputDigest };
  if (outputFile) await writeFile(outputFile, `${JSON.stringify(createEvaluationExport(run), null, 2)}\n`, { mode: 0o600 });
  console.log('LOCAL SIMULATOR EVALUATION — imported decisions; no PayPal or AI calls.');
  console.table(results.map(result => ({ case: result.scenario.id, verdict: result.verdict, observedUSD: result.evidenceComplete ? (result.observedRefundCents / 100).toFixed(2) : 'unconfirmed' })));
  console.log(JSON.stringify(run.summary));
  if (outputFile) console.log(`Saved regression export: ${outputFile}`);
  process.exitCode = run.summary.failed ? 1 : run.summary.inconclusive ? 2 : 0;
} catch (error) { console.error(error instanceof Error ? error.message : 'Evaluation failed.'); process.exitCode = 1; }
