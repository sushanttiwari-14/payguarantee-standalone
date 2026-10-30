#!/usr/bin/env node
// Use the supported CLI through the SDK. Auth stays in Codex's own store.
// Ignore unrelated user tools/settings for this data-only local test runner.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cli = require.resolve('@openai/codex/bin/codex.js');
const args = process.argv.slice(2);
if (args[0] !== 'exec') { process.stderr.write('Only Codex exec is supported.\n'); process.exit(1); }
args.splice(1, 0, '--ignore-user-config', '--ephemeral');
const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => process.exit(1));
child.on('exit', (code) => process.exit(code ?? 1));
