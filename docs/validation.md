# Local validation — 30 October 2026

Validated with Node.js 24.21.0 and npm 11.19.0 on macOS.

## Passed

- Both application and presentation dependencies installed with `npm ci`. The system CA bundle was supplied using `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem`; TLS certificate validation remained enabled.
- All 188 automated tests passed. Provider tests include isolated test doubles; they are not evidence of live payments.
- TypeScript checking and the Vite production build passed.
- Controlled evaluator verification passed: corrected and recorded replay controls passed 2/2 cases each.
- The recorded 20-case challenge produced 18 passing, zero failing and two inconclusive candidate results. This command does not make a fresh AI request.
- Presentation typechecking, caption checks and bundle build passed. A full MP4 was not rendered.
- Eight live HTTP read, download and security checks passed, including rejected foreign origins, invalid hosts and incorrect content types.
- Nine live HTTP functional checks passed: scenario creation and approval, agent request export, evaluation, evidence export and replay, archival, and persisted state.
- Fresh Codex inference through the running API passed both fixed synthetic refund cases. Actual model output was recorded locally; payments were simulated and no PayPal transaction occurred.
- The source archive was generated and served successfully.

The documentation endpoint test now asserts the new README heading. Application behavior and security assertions were not changed.

## Blockers and limits

Browser interface testing could not be completed because local browser access is disabled in Work settings. API validation does not substitute for checking rendered UI behavior.

PayPal Sandbox credentials were absent, so approval, capture, refunds and provider readback were not tested against PayPal. Ollama integration and a full video render were not exercised. These remain unverified.

Dependency audit reports two findings in the application (one high, one moderate) and eleven in the presentation dependency tree (ten high, one moderate). No forced upgrades or audit suppression were applied. Review and remediate these findings before broader deployment.

The application runs only on loopback, at http://127.0.0.1:4319. Credentials, runtime state, generated evidence, dependencies and logs remain ignored and are not published. Saved examples are historical evidence, not new transactions or model runs.
