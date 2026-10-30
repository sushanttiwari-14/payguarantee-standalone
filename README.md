# payguarantee-standalone

A local test workbench for refund-agent decisions. This project includes third-party implementation and assets; repository maintenance does not imply original authorship. Copyright and attribution remain in the accompanying license notices.

The React interface and Express API let you author refund scenarios, set a cumulative refund policy, compare decisions, import/export evidence, and replay saved inputs. The evaluation engine checks both excessive refunds and legitimate refunds that an agent should complete. Payment simulation, saved evidence replay, fresh AI inference, and PayPal Sandbox execution are distinct modes; a passing simulator run does not establish live payment correctness or production readiness.

## Run locally

Requires Node.js 22 or newer and npm (validated here with Node 24).

```sh
npm ci
cp .env.example .env
# Set PORT=4319 in .env for this installation.
npm run check
npm run source
npm start
```

Open http://127.0.0.1:4319. `npm start` serves the production build created by `npm run check`; `npm run dev` instead starts Vite development middleware. The server binds only to loopback. Set `PORT` in `.env` if 4319 is occupied (1024–65535).

Local state lives in an ignored application state directory; generated evidence and the downloadable source archive live in ignored `artifacts/`. Keep credentials in ignored `.env`. Neither runtime data nor installed dependencies belong in Git.

## Connections

- **Codex:** `npm run codex:login` signs in through the bundled CLI. Fresh model requests use your ChatGPT/Codex allowance. `CODEX_MODEL` optionally selects an accessible model. The application restricts the child runner to a data-only, read-only workflow.
- **PayPal:** set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` to your own Sandbox application credentials, then restart. Preparing an order, approving it as a Sandbox buyer, capturing it, and reading back refunds require an actual Sandbox account. No live PayPal production mode is provided.
- **Local AI:** install and start Ollama on loopback, run `ollama pull qwen3:0.6b`, then `npm run judge:local`. It requires local GGUF weights and records the raw response before evaluation; it does not substitute saved output on failure.

## Verification commands

```sh
npm test               # automated engine, API, import, security and connector tests
npm run build          # TypeScript checking and production frontend build
npm run judge:verify   # controlled simulator evaluation and historical decision replay
npm run challenge      # 20 saved decisions and controls; no fresh inference
npm run challenge -- --live  # fresh Codex batch, simulator payments
npm run source         # build the downloadable source archive
```

`challenge` exiting successfully means it wrote a report, not that every evaluated decision passed. Many automated provider tests use isolated test doubles. Historical files under `examples/` and presentation assets are saved observations, not new observations made by this repository's maintainer.

See [development instructions](docs/development.md) and [local validation results](docs/validation.md).

## License and attribution

The implementation retains its existing [MIT license](LICENSE). Font license files remain in `docs/font-licenses/` and `presentation/public/fonts/`. The [presentation notice](presentation/NOTICE.md) preserves asset attribution and applicable third-party terms. No new ownership claim is made over third-party implementation or assets.
