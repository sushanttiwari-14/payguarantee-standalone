import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentInput, createEvaluationExport, validateAgentInput, validateDecisionBundle } from '../server/decision-bundle.ts';
import { createAgentRequest } from '../server/agent-request.ts';
import { proofInputs } from '../server/proof-demo.ts';
import { evaluateLocalDecisions, LOCAL_MODEL, requestLocalDecisions } from '../server/local-model.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
let output: string | undefined;
const record = async (name: string, value: unknown) => {
  await writeFile(resolve(output!, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
};
try {
  let fixture: string | undefined, out: string | undefined;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const option = args[i], value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('Usage: npm run judge:local -- [--fixture evaluation-fixture.json] [--out new-directory]');
    if (option === '--fixture' && !fixture) fixture = value;
    else if (option === '--out' && !out) out = value;
    else throw new Error('Unknown or duplicate option.');
  }
  const fixed = proofInputs();
  if (fixture && (await stat(fixture)).size > 1_048_576) throw new Error('Evaluation fixture exceeds 1 MiB.');
  const input = fixture ? validateAgentInput(JSON.parse(await readFile(fixture, 'utf8'))) : createAgentInput(fixed.policy, fixed.scenarios);
  const destination = resolve(out || resolve(root, 'artifacts/local-ai', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`));
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination); // Do not overwrite previous observations.
  output = destination;
  await record('evaluation-fixture.json', input);
  await record('agent-request.json', createAgentRequest(input));
  console.log(`FRESH LOCAL AI: ${LOCAL_MODEL} through Ollama on 127.0.0.1. Simulator payments only.`);
  console.log(`Evidence directory: ${output}`);
  const { value, observation } = await requestLocalDecisions(input, record);
  const run = await evaluateLocalDecisions(input, value, observation.model.digest);
  await record('evidence.json', createEvaluationExport(run));
  const bundle = { schemaVersion: 2, inputDigest: input.inputDigest, agent: run.importedAgent, decisions: (value as any)?.decisions };
  let reusableDecisionBundle = false;
  try {
    validateDecisionBundle(bundle, input);
    reusableDecisionBundle = true;
  } catch { /* Invalid output stays in response.json and the failed evidence; never fabricate decisions. */ }
  if (reusableDecisionBundle) await record('decisions.json', bundle);
  await record('report.json', { ...observation, runId: run.id, summary: run.summary, reusableDecisionBundle,
    legitimatePassed: run.results.filter(r => r.expectedAction === 'refund' && r.verdict === 'pass').length,
    legitimateTotal: run.results.filter(r => r.expectedAction === 'refund').length,
    scope: 'One synthetic batch. No benchmark, adoption, production-safety, or actual PayPal claim.',
  });
  console.table(run.results.map(r => ({ case: r.scenario.id, verdict: r.verdict, observedCents: r.evidenceComplete ? r.observedRefundCents : 'unconfirmed' })));
  console.log('Import evidence.json through Run history to inspect the same results. Exit 0=pass, 1=failure/error, 2=inconclusive.');
  process.exitCode = run.summary.failed ? 1 : run.summary.inconclusive ? 2 : 0;
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  if (output) await record('error.json', { failedAt: new Date().toISOString(), detail }).catch(() => undefined);
  console.error(`LOCAL AI STOPPED: ${detail}`);
  console.error('Start Ollama on loopback, then run: ollama pull qwen3:0.6b. No saved decision or teaching agent is substituted.');
  process.exitCode = 1;
}
