import { useEffect, useId, useRef, useState } from 'react';
import { CircleAlert, FileJson2, Upload } from 'lucide-react';
import type { Run } from '../../shared/types';
import { MAX_EVIDENCE_IMPORT_BYTES } from '../../shared/limits';
import { api, BusyIcon } from './ui';
import './evidence-import.css';

export default function EvidenceImport({ onImported, operationBusy = false }: { operationBusy?: boolean; onImported: (run: Run) => Promise<void> }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const pending = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const bytes = new TextEncoder().encode(text).byteLength;

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [error]);

  async function importText(read: () => Promise<string>, selectedName = '') {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    if (selectedName) setFileName(selectedName);
    try {
      const source = await read();
      if (new TextEncoder().encode(source).byteLength > MAX_EVIDENCE_IMPORT_BYTES) throw new Error('The export exceeds the 1,000,000-byte limit. Choose a smaller run export.');
      let document: unknown;
      try { document = JSON.parse(source); } catch { throw new Error('This is not valid JSON. Choose a PayProof run export or correct the pasted JSON.'); }
      const envelope = document as { schemaVersion?: unknown; run?: { results?: unknown } } | null;
      if (!envelope || typeof envelope !== 'object' || envelope.schemaVersion !== 1 || !Array.isArray(envelope.run?.results) || envelope.run.results.length < 1 || envelope.run.results.length > 20) {
        throw new Error('Choose a PayProof schemaVersion 1 run export with 1–20 case results. A decision bundle or agent-input file is not an evidence export.');
      }
      const run = await api<Run>('/api/runs/import', { method: 'POST', body: JSON.stringify(document) });
      await onImported(run);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The export could not be imported. Your existing history is unchanged.');
    } finally { pending.current = false; setBusy(false); }
  }

  function chooseFile(file?: File) {
    if (!file || pending.current) return;
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith('.json') && !/^(application|text)\/json(?:;|$)/i.test(file.type)) {
      setError('Choose a .json PayProof run export. Other file types are not supported.'); return;
    }
    if (file.size > MAX_EVIDENCE_IMPORT_BYTES) {
      setError('The selected file exceeds the 1,000,000-byte limit. Choose a smaller run export.'); return;
    }
    void importText(() => file.text(), file.name);
  }

  return <section className="panel evidence-import" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <div className="evidence-import-heading"><div><div className="eyebrow">FROM YOUR CLI OR ANOTHER WORKSPACE</div><h2 id={`${id}-title`}><FileJson2 size={19} />Import evidence</h2><p>Imported results are saved as <strong>unverified external evidence</strong>. Importing never makes AI or payment calls.</p></div>
      <button className="button secondary" disabled={busy || operationBusy} onClick={() => { if (fileInput.current) { fileInput.current.value = ''; fileInput.current.click(); } }}><BusyIcon busy={busy}><Upload size={16} /></BusyIcon>{busy ? 'Importing evidence…' : 'Choose JSON file'}</button>
    </div>
    <input ref={fileInput} className="evidence-import-file" type="file" accept=".json,application/json" disabled={busy || operationBusy} aria-label="Choose PayProof evidence JSON file" onChange={event => chooseFile(event.target.files?.[0])} />
    <p className="evidence-import-help">Use the full run export, including its policy, cases, decisions, and results. Up to 20 cases and 1,000,000 UTF-8 bytes.{fileName && <span>Selected file: {fileName}</span>}</p>
    {error && <div ref={errorRef} className="evidence-import-error" role="alert" tabIndex={-1}><CircleAlert size={18} /><div><strong>Evidence was not imported</strong><p>{error}</p></div></div>}
    <details className="evidence-import-paste"><summary>Paste JSON instead</summary><label className="form-field">Run export JSON<textarea rows={6} spellCheck={false} value={text} disabled={busy || operationBusy} onChange={event => setText(event.target.value)} aria-describedby={`${id}-bytes`} placeholder={'{"schemaVersion":1,"run":{"id":"…","policy":{…},"results":[…]}}'} /></label><div className="evidence-import-paste-actions"><span id={`${id}-bytes`} className={bytes > MAX_EVIDENCE_IMPORT_BYTES ? 'is-too-large' : ''}>{bytes.toLocaleString()} / {MAX_EVIDENCE_IMPORT_BYTES.toLocaleString()} bytes{bytes > MAX_EVIDENCE_IMPORT_BYTES ? ' · exceeds the import limit' : ''}</span><button className="button secondary" disabled={busy || operationBusy || !text.trim() || bytes > MAX_EVIDENCE_IMPORT_BYTES} onClick={() => void importText(async () => text)}><BusyIcon busy={busy}><Upload size={15} /></BusyIcon>Import pasted JSON</button></div></details>
  </section>;
}
