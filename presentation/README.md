# Demonstration presentation

This separate Remotion package renders saved screenshots, narration and captions. Playback performs no fresh model inference or payment transaction. Historical evidence is not a result of a new local test.

Use Node.js 22 or newer. Run `npm ci`, `npm run lint`, and `npm run captions` here. `npm run dev` starts Studio at http://127.0.0.1:4324; `npm run build` bundles the composition; `npm run render` produces a video under `out/`.

Scene components live in `src/`; the composition is registered in `src/Root.tsx`. Saved media and fonts are under `public/`; narration inputs are in `narration.json`. Read [NOTICE.md](NOTICE.md) for asset attribution, generated voice disclosure, and licensing terms.
