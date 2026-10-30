# Assets and attribution

The PayProof scene code is covered by the repository's MIT license. Third-party code and assets retain their own terms.

- `src/basic-captions.tsx` is copied unchanged from the [Remotion Basic Captions element](https://www.remotion.dev/elements/captions/basic-captions), retrieved 13 October 2026. Remotion packages and this element are governed by [Remotion's license](https://www.remotion.dev/license).
- DM Sans, DM Mono and Instrument Serif are bundled locally. Their license notices are included beside the font files in `public/fonts/`.
- Narration is AI-generated using the stock Leslie voice through Runway's Eleven Multilingual v2 speech tool. It does not represent the developer's own recorded voice. `narration.json` contains the exact supplied script and measured source durations.
- App images are screenshots of the functioning local PayProof application. The recovery image comes from an isolated, explicitly mocked provider test. It is labeled as mocked wherever used in the film.
- The 20-case numbers come from `public/challenge-report.json`, the observed synthetic Codex challenge. The original export is `../examples/recorded-codex-challenge.json`. This presentation is a recorded demonstration, not a recording of a fresh AI inference or actual PayPal transaction.
