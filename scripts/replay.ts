import { readFile, writeFile } from 'node:fs/promises';
import { createEvaluationExport } from '../server/decision-bundle.ts';
import { replayEvidence } from '../server/replay.ts';

const [file, ...options] = process.argv.slice(2);
const override = options[0] && ['seeded', 'corrected'].includes(options[0]) ? options.shift() : undefined;
const outputFile = options[0] === '--out' && options.length === 2 ? options[1] : undefined;
if (!file || (options.length > 0 && !outputFile)) {
  console.error('Usage: npm run replay -- export.json [seeded|corrected] [--out regression.json]');
  process.exit(1);
}
try {
  const document = JSON.parse(await readFile(file, 'utf8'));
  const run = await replayEvidence(document, override as 'seeded' | 'corrected' | undefined);
  const original = document.run;
  const inputIntegrity = run.replay!.inputIntegrity;
  if (inputIntegrity === 'unverified-legacy') console.warn('UNVERIFIED LEGACY INPUTS — the source export has no recorded input digest. This replay cannot confirm that its policy and scenarios are unchanged.');
  if (outputFile) await writeFile(outputFile, `${JSON.stringify(createEvaluationExport(run), null, 2)}\n`, { mode: 0o600 });
  console.log(`LOCAL SIMULATOR REPLAY — no PayPal or AI calls. ${override ? 'Teaching-agent decisions recomputed by explicit override.' : 'Every recorded agent decision is reused.'}`);
  console.log(`Source run: ${original.id} (${original.provider}, ${original.createdAt}). Replay evidence: simulator. Input integrity: ${inputIntegrity}.`);
  console.log(`Verifier: ${original.provenance?.verifierVersion || 'unknown in source export'} -> ${run.provenance!.verifierVersion}.`);
  console.table(run.results.map(r => ({ case: r.scenario.title, verdict: r.verdict, observedUSD: r.evidenceComplete ? (r.observedRefundCents / 100).toFixed(2) : 'unconfirmed' })));
  console.log(JSON.stringify(run.summary));
  if (outputFile) console.log(`Saved regression export: ${outputFile}`);
  process.exitCode = run.summary.failed ? 1 : run.summary.inconclusive ? 2 : 0;
} catch (error) { console.error(error instanceof Error ? error.message : 'Replay failed.'); process.exitCode = 1; }
