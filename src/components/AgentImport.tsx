import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, FileJson2 } from 'lucide-react';
import { api } from './ui';
import { MAX_DECISION_BUNDLE_BYTES } from '../../shared/limits';

export default function AgentImport({ scenarioIds, value, onChange, disabled, onError, error }: {
  scenarioIds: string[]; value: string; onChange: (text: string) => void; disabled: boolean; onError: (message: string) => void; error: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [digest, setDigest] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const bytes = new TextEncoder().encode(value).byteLength;
  const tooLarge = bytes > MAX_DECISION_BUNDLE_BYTES;
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [error]);
  async function downloadInput(fixture = false) {
    setExporting(true);
    try {
      const bundle = await api<{inputDigest: string}>(fixture ? '/api/agent-input' : '/api/agent-request', { method: 'POST', body: JSON.stringify({ scenarioIds }) });
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = fixture ? 'payproof-evaluation-fixture.json' : 'payproof-agent-request.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (!fixture) setDigest(bundle.inputDigest);
    } catch (error) { onError((error as Error).message); } finally { setExporting(false); }
  }
  return <section className="agent-import" aria-labelledby="agent-import-title">
    <h3 id="agent-import-title"><FileJson2 size={17} />Test your agent’s decisions</h3>
    <p>Your agent supplies decisions. PayProof runs the payment calls and retries; your agent’s internal tools are outside this test.</p>
    <ol><li>Choose the cases above and download the agent request.</li><li>Give only that request to your agent. Return a version 2 decision bundle with its name and version.</li><li>Paste the bundle below, then run the test suite.</li></ol>
    <button className="button secondary" onClick={() => void downloadInput()} disabled={disabled || exporting || !scenarioIds.length}><ArrowDownToLine size={15} />{exporting ? 'Preparing request…' : 'Download agent request'}</button>
    {digest && <p className="agent-import-digest" role="status">Last request exported · <code>{digest.slice(0, 23)}…</code></p>}
    <label className="form-field">Agent decision bundle (JSON)<textarea rows={7} value={value} onChange={event => { onError(''); onChange(event.target.value); }} disabled={disabled} aria-invalid={tooLarge || !!error} aria-describedby={error || tooLarge ? "agent-import-size agent-import-error" : "agent-import-size"} spellCheck={false} placeholder={'{"schemaVersion":2,"inputDigest":"sha256:…","agent":{"name":"Support agent","version":"v1"},"decisions":[…]}'} /></label>
    <p id="agent-import-size" className="agent-import-size">{bytes.toLocaleString()} / {MAX_DECISION_BUNDLE_BYTES.toLocaleString()} bytes · Pasted text is kept in full.</p>
    {(error || tooLarge) && <div id="agent-import-error" ref={errorRef} className="agent-import-error" role="alert" tabIndex={-1}>{error || 'This bundle exceeds the 1 MB limit. Shorten the decision text or select fewer cases before running.'}</div>}
    <details><summary>Decision format and evaluation scope</summary><p>Return one entry per scenario: <code>scenarioId</code>, <code>action</code> (refund or escalate), integer <code>amountCents</code>, <code>reason</code>, and <code>customerMessage</code>. Keep the opaque scenario IDs and inputDigest unchanged. Use schemaVersion 2; escalation uses zero cents. Requests omit library labels, expected actions and injected payment faults.</p><p>The runner executes these proposed decisions and checks provider evidence. Your agent’s internal tools, retries, and production behavior are outside this test. Changed inputs require a new bundle.</p><p>A runnable contract example is included in <code>examples/external-agent.mjs</code>. Replace its decision function with your agent.</p><p>For offline evaluation, also download the local fixture below. It contains evaluator-only case identities and fault settings. Keep it out of the agent prompt.</p><button className="button secondary" onClick={() => void downloadInput(true)} disabled={disabled || exporting || !scenarioIds.length}><ArrowDownToLine size={15} />Download evaluation fixture</button><p><code>npm run evaluate -- payproof-evaluation-fixture.json decisions.json --out evidence.json</code></p><p>Legacy version 1 decision bundles remain readable for previously exported fixtures.</p></details>
  </section>;
}
