import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_CHALLENGE_VERSION, aiChallengeInputs } from '../shared/ai-challenge.ts';
import { MAX_EVIDENCE_IMPORT_BYTES } from '../shared/limits.ts';
import { challengeControls, summarizeChallenge } from '../server/ai-challenge.ts';
import { createAgentInput, createEvaluationExport } from '../server/decision-bundle.ts';
import { createAgentRequest } from '../server/agent-request.ts';
import { importEvidence } from '../server/evidence-import.ts';
import { evaluateProofAI } from '../server/proof-demo.ts';
import { replayEvidence } from '../server/replay.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
let output: string | undefined;
const writeJSON = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

try {
  const args = process.argv.slice(2);
  let live = false, recordedPath: string | undefined, outputPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--live' && !live) live = true;
    else if (['--recorded', '--out'].includes(flag) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const value = args[++i];
      if (flag === '--recorded' && !recordedPath) recordedPath = value;
      else if (flag === '--out' && !outputPath) outputPath = value;
      else throw new Error('Duplicate option.');
    } else throw new Error('Usage: npm run challenge -- [--live | --recorded evidence.json] [--out new-directory]');
  }
  if (live && recordedPath) throw new Error('Choose live inference or recorded replay, not both.');
  const { policy, scenarios } = aiChallengeInputs();
  const input = createAgentInput(policy, scenarios);
  let imported;
  if (!live) {
    const source = resolve(recordedPath || resolve(root, 'examples/recorded-codex-challenge.json'));
    if ((await stat(source)).size > MAX_EVIDENCE_IMPORT_BYTES) throw new Error('Recorded challenge exceeds the import limit.');
    imported = importEvidence(JSON.parse(await readFile(source, 'utf8')));
    assert.equal(imported.agent, 'codex', 'Provide a recorded Codex challenge run.');
    assert.equal(imported.provider, 'simulator', 'Challenge payments must be simulated.');
    assert.ok(imported.ai && !imported.replay, 'Provide an original recorded AI export.');
    assert.equal(imported.provenance?.inputDigest, input.inputDigest, 'Recorded evidence does not match the fixed challenge.');
  }
  const preparedAt = new Date().toISOString();
  const destination = resolve(outputPath || resolve(root, 'artifacts/ai-challenge', `${preparedAt.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`));
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination); // Never overwrite a previous report or its evidence.
  output = destination;
  const manifest = { version: AI_CHALLENGE_VERSION, preparedAt, mode: live ? 'live' : 'recorded-replay', inputDigest: input.inputDigest, caseCount: scenarios.length };
  await writeJSON(resolve(output, 'manifest.json'), { ...manifest, status: 'prepared' });
  await writeJSON(resolve(output, 'evaluation-fixture.json'), input);
  await writeJSON(resolve(output, 'agent-request.json'), createAgentRequest(input));
  const controls = await challengeControls();
  for (const [name, run] of Object.entries(controls)) await writeJSON(resolve(output, `${name}.json`), createEvaluationExport(run));
  console.log(live ? 'Running one fresh Codex batch on 20 fixed synthetic cases. Simulator payments only.' : 'Replaying 20 saved decisions locally. No new AI or PayPal calls. Historical model claims remain unauthenticated.');
  const startedAt = new Date().toISOString();
  const candidate = live ? await evaluateProofAI(controls.corrected) : await replayEvidence(createEvaluationExport(imported!));
  const finishedAt = new Date().toISOString();
  await writeJSON(resolve(output, live ? 'codex.json' : 'recorded-replay.json'), createEvaluationExport(candidate));
  const report = { schemaVersion: 1, preparedAt, startedAt, finishedAt, mode: manifest.mode,
    evaluationMs: live ? Date.parse(finishedAt) - Date.parse(startedAt) : null,
    ai: live ? candidate.ai : imported!.ai,
    provenance: live ? 'Observed local Codex request; exact default model revision may be unknown.' : 'Imported historical model/thread claims are unauthenticated. Local replay verifies inputs and current simulator outcomes.',
    ...summarizeChallenge({ ...controls, candidate }),
  };
  await writeJSON(resolve(output, 'report.json'), report);
  await writeJSON(resolve(output, 'manifest.json'), { ...manifest, status: 'recorded', finishedAt, candidateRunId: candidate.id });
  console.table(Object.entries(report.outcomes).map(([name, outcome]) => ({ agent: name, passed: outcome.passed, failed: outcome.failed, inconclusive: outcome.inconclusive, legitimate: `${outcome.legitimatePassed}/${outcome.legitimateTotal}` })));
  console.log('CHALLENGE REPORT WRITTEN. Exit 0 means the report was produced, not that every case passed.');
  console.log(`All cases, controls and evidence: ${output}`);
} catch (error) {
  const detail = error instanceof Error ? error.message : 'Challenge could not be evaluated.';
  if (output) await writeJSON(resolve(output, 'error.json'), { failedAt: new Date().toISOString(), detail }).catch(() => undefined);
  console.error(`CHALLENGE STOPPED: ${detail}`);
  process.exitCode = 1;
}
