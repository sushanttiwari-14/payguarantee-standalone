import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvaluationExport } from '../server/decision-bundle.ts';
import { importEvidence } from '../server/evidence-import.ts';
import { createProofDemo } from '../server/proof-demo.ts';
import { replayEvidence } from '../server/replay.ts';
import { MAX_EVIDENCE_IMPORT_BYTES } from '../shared/limits.ts';
import { summarizeProof } from '../shared/proof-demo.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

try {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!['--recorded', '--out'].includes(flag) || !value || value.startsWith('--') || options.has(flag)) {
      throw new Error('Usage: npm run judge:verify -- [--recorded evidence.json] [--out directory]');
    }
    options.set(flag, value);
  }
  const source = resolve(options.get('--recorded') || resolve(root, 'examples/recorded-codex-proof.json'));
  if ((await stat(source)).size > MAX_EVIDENCE_IMPORT_BYTES) throw new Error('Recorded evidence exceeds the import size limit.');
  // Import first: a packaged file is external evidence, including its AI/provider claims.
  const imported = importEvidence(JSON.parse(await readFile(source, 'utf8')));
  assert.equal(imported.agent, 'codex', 'This judge check needs a recorded Codex decision run.');
  assert.equal(imported.provider, 'simulator', 'The bundled demonstration uses simulator payments.');
  assert.ok(imported.ai, 'The source must identify its claimed AI model and thread.');
  assert.ok(!imported.replay, 'Provide the original decision export, not a replay.');
  assert.ok(imported.provenance?.inputDigest, 'An input digest is required for this check.');

  const proof = await createProofDemo();
  assert.equal(imported.provenance.inputDigest, proof.baseline.provenance!.inputDigest, 'The recorded decisions must use the exact two demonstration inputs.');
  const replayed = await replayEvidence(createEvaluationExport(imported));
  assert.equal(replayed.replay!.inputIntegrity, 'verified', 'Saved inputs must match their recorded digest.');
  assert.equal(replayed.replay!.sourceOrigin!.sourceRunId, imported.origin!.sourceRunId);
  assert.deepEqual(replayed.results.map(result => result.decision), imported.results.map(result => result.decision), 'Replay must preserve every recorded decision.');

  const reference = summarizeProof(proof);
  const recorded = summarizeProof({ ...proof, candidate: replayed });
  assert.equal(proof.baseline.summary.failed, 1, 'The seeded cumulative-limit defect must be detected.');
  assert.equal(proof.baseline.summary.excessCents, 500, 'The seeded fixture must expose $5 policy excess.');
  assert.equal(proof.refusal.summary.failed, 1, 'Blanket refusal must fail the permitted-refund case.');
  assert.equal(proof.refusal.summary.legitimateCompleted, 0, 'Blanket refusal must not count as useful success.');
  for (const result of [reference, recorded]) {
    assert.equal(result.passed, true, 'Both reference and recorded decisions must pass independent checks.');
    assert.equal(result.fixed, 1); assert.equal(result.regressed, 0);
    assert.equal(result.legitimateCompleted, 1); assert.equal(result.legitimateTotal, 1);
  }

  const createdAt = new Date().toISOString();
  const output = resolve(options.get('--out') || resolve(root, 'artifacts/judge-check', `${createdAt.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`));
  const runs = { seeded: proof.baseline, refusal: proof.refusal, corrected: proof.candidate, 'recorded-replay': replayed };
  const report = {
    schemaVersion: 1, createdAt, judgeCheck: 'passed', paymentEvidence: 'simulator',
    scope: 'Two controlled scenarios only. No new AI or PayPal request; no production-safety or business-impact claim.',
    source: { runId: imported.origin!.sourceRunId, createdAt: imported.createdAt, claimedAI: imported.ai,
      authentication: 'The historical model, thread and provider claims are not authenticated by this check.',
      inputDigest: imported.provenance.inputDigest, inputIntegrity: replayed.replay!.inputIntegrity },
    outcomes: Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, { runId: run.id, status: run.status, ...run.summary }])),
    comparison: { reference, recorded },
  };
  await mkdir(output, { recursive: true });
  for (const [name, run] of Object.entries(runs)) {
    await writeFile(resolve(output, `${name}.json`), `${JSON.stringify(createEvaluationExport(run), null, 2)}\n`, { mode: 0o600 });
  }
  await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log('JUDGE CHECK PASSED — local simulator evaluation; no new AI or PayPal calls.');
  console.log('Historical model/thread claims remain unauthenticated. Replay checks saved inputs and decisions, not model authorship.');
  console.table(Object.entries(runs).map(([name, run]) => ({
    control: name, passed: `${run.summary.passed}/${run.summary.total}`,
    legitimate: `${run.summary.legitimateCompleted}/${run.summary.legitimateTotal}`,
    excessUSD: (run.summary.excessCents / 100).toFixed(2),
  })));
  console.log(`Saved report and four evidence exports: ${output}`);
} catch (error) {
  console.error(`JUDGE CHECK FAILED: ${error instanceof Error ? error.message : 'Unable to verify the evidence.'}`);
  process.exitCode = 1;
}
