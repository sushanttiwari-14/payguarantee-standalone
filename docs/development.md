# Development

## Structure

- `src/`: React entry point, landing page, proof comparison, scenario editor, connections, run history, and evidence views.
- `server/app.ts`: Express API, request validation, same-origin/host protection, operation serialization, and application orchestration.
- `server/engine.ts`: refund-policy evaluation and simulator execution.
- `server/paypal.ts` and `server/sandbox-execution.ts`: Sandbox order/capture/refund handling, reconciliation, and recovery.
- `server/ai.ts`: restricted Codex runner, structured decision output, and generated scenarios.
- `server/local-model.ts`: loopback Ollama connector and local decision evaluation.
- `server/store.ts`: queued JSON state updates written through a temporary file and rename.
- `shared/`: types, fixtures, input limits, and comparison helpers.
- `adapters/`: seeded and corrected example decision functions.
- `scripts/`: replay, evaluation, source packaging, and evidence commands.
- `tests/`: Node test runner suites launched through tsx.
- `presentation/`: separate Remotion package with retained narration, captions, fonts, and screenshots.

## Local workflow

Run `npm ci`, copy `.env.example` to `.env`, then `npm run dev`. Before publishing changes use `npm run check`, `npm run judge:verify`, `npm run challenge`, and `npm run source`. The source archive requires both root and presentation README files. Build before running `npm start`.

The postinstall script restores executable permission on the Codex launcher. Do not bypass TLS checks, origin checks, scenario approval, input digests, Sandbox readback, or the runner sandbox to get a test passing. Model access and provider credentials are external requirements; report unavailable integrations instead of substituting fixtures and describing them as live results.

## API behavior

Read `/api/state`, `/api/status`, and `/api/operation` to inspect persisted data, connection availability, and operation state. `/api/docs`, `/api/license`, and `/api/source` serve the README, license, and generated archive.

Mutating requests require `Content-Type: application/json`. The server accepts only localhost/127.0.0.1 hosts on the configured port and rejects foreign browser origins. Use the UI to create and approve scenarios before execution. Scenario creation uses integer cent amounts and the current policy version for approval. `/api/agent-request` exports decision inputs without the evaluator's expected answers; `/api/runs` evaluates submitted or built-in decisions. Evidence export, import, and replay are separate operations and preserve provenance labels.

For Sandbox testing, configure credentials, prepare a fresh approved scenario fixture, approve the order in the Sandbox buyer flow, capture it, and run the evaluation. Do not reuse exhausted payment fixtures as if they were fresh. Interrupted provider operations must be reconciled using the saved fixture/journal; avoid blindly repeating refund calls.

## Persistence

The local JSON state file stores local workspace data; the local Sandbox journal records provider operations. Preserve these when investigating interrupted execution. Do not edit the state while the app is running. To start a clean workspace, stop the app and move the hidden application state directory to a backup location first. Artifacts can contain user-provided inputs and provider identifiers: review before sharing.

## Presentation

```sh
cd presentation
npm ci
npm run lint
npm run captions
npm run build
npm run dev
```

Studio runs locally on port 4324. `npm run render` produces a demo MP4 under `out/` and requires Remotion's rendering runtime. Playback uses saved screenshots, captions and narration and does not perform fresh AI or payment operations. Consult `NOTICE.md` for asset attribution and third-party licensing.
