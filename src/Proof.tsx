import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Download, FlaskConical, GitCompareArrows, LoaderCircle, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import type { IntegrationStatus, Run } from '../shared/types';
import { proofLocation, summarizeProof, type ProofDemo, type ProofAIStatus } from '../shared/proof-demo';
import { writeComparisonLocation } from '../shared/comparison-location';
import { api, money, Status } from './components/ui';
import { useOperation } from './useOperation';
import './proof.css';

export default function Proof() {
  const [proof, setProof] = useState<ProofDemo | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [aiRunning, setAIRunning] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const pendingAI = useRef(new URLSearchParams(window.location.search).get('aiRequest'));
  const errorRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const { operation } = useOperation(() => { void recoverAI(); });
  const busy = running || aiRunning || !!operation;
  const summary = proof ? summarizeProof(proof) : null;
  const hasAI = proof?.candidate.agent === 'codex' && !!proof.candidate.ai;
  const codexReady = integrations?.codex.available && integrations.codex.authenticated;

  function showProof(next: ProofDemo, focus = false) {
    setProof(next); pendingAI.current = null; setAIRunning(false);
    window.history.replaceState(null, '', proofLocation(next));
    if (focus) requestAnimationFrame(() => { summaryRef.current?.focus(); summaryRef.current?.scrollIntoView({ block: 'nearest' }); });
  }

  async function recoverAI() {
    const id = pendingAI.current;
    if (!id) return;
    try {
      const status = await api<ProofAIStatus>(`/api/proof-demo/ai/${encodeURIComponent(id)}`);
      if (id !== pendingAI.current) return;
      if (status.proof) { setError(''); showProof(status.proof); return; }
      setAIRunning(status.request.status === 'running' && status.active);
      if (status.request.status === 'failed') setError(`The Codex check failed: ${status.request.error || 'No result returned.'} Your previous comparison is preserved. No teaching answer was substituted.`);
      else if (!status.active) setError('This Codex request was interrupted. No completed AI evaluation was saved. Inspect Run history before starting another request.');
    } catch (e) { if (id === pendingAI.current) { setAIRunning(false); setError((e as Error).message); } }
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    void api<IntegrationStatus>('/api/status', { signal: controller.signal }).then(status => { if (!controller.signal.aborted) setIntegrations(status); }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setCheckingStatus(false); });
    if (!['baseline', 'refusal', 'candidate'].some(key => params.has(key))) { setLoading(false); return; }
    void api<ProofDemo>(`/api/proof-demo?${params}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setProof(value); void recoverAI(); } })
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function runProof() {
    if (lock.current || busy) return;
    lock.current = true; setRunning(true); setError('');
    try {
      const next = await api<ProofDemo>('/api/proof-demo', { method: 'POST', body: '{}' });
      showProof(next, true);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setRunning(false); }
  }

  async function runAI() {
    if (!proof || lock.current || busy) return;
    lock.current = true; setAIRunning(true); setError('');
    const requestId = crypto.randomUUID();
    pendingAI.current = requestId;
    window.history.replaceState(null, '', `${proofLocation(proof)}&aiRequest=${encodeURIComponent(requestId)}`);
    try {
      const next = await api<ProofDemo>('/api/proof-demo/ai', { method: 'POST', body: JSON.stringify({ requestId, baselineId: proof.baseline.id, refusalId: proof.refusal.id, candidateId: proof.candidate.id }) });
      showProof(next, true);
    } catch (e) { setError((e as Error).message); await recoverAI(); }
    finally { lock.current = false; }
  }

  const comparisonUrl = proof ? writeComparisonLocation('', { open: true, baseline: proof.baseline.id, candidate: proof.candidate.id, query: '', outcome: 'all' }) : '/app?view=runs';
  return <div className="proof-page">
    <a className="app-skip" href="#proof-content">Skip to proof</a>
    <header className="proof-nav">
      <a className="brand" href="/" aria-label="PayProof home"><span className="brand-icon"><ShieldCheck size={21}/></span>payproof<span className="brand-period">.</span></a>
      <span className="proof-mode"><FlaskConical size={14}/>{hasAI ? 'Recorded AI' : 'Teaching controls'} · Simulator</span>
      <a className="proof-link" href="/app">Open test lab <ArrowUpRight size={16}/></a>
    </header>
    <main id="proof-content" className="proof-main">
      <div className="proof-intro">
        <div><p className="proof-eyebrow">THE REFUND AGENT RELEASE CHECK</p><h1>Proof, in two requests.</h1><p>Catch the over-refund. Keep the legitimate one.<br className="proof-mobile-break"/> Inspect the evidence for both.</p></div>
        <button className="proof-button proof-secondary" onClick={runProof} disabled={busy || loading}>{running ? <LoaderCircle size={15} className="spin"/> : <RotateCcw size={15}/>} {proof ? 'Run again' : 'Run comparison'}</button>
      </div>
      {error && <div className="proof-error" role="alert" tabIndex={-1} ref={errorRef}><strong>The requested check could not finish.</strong><p>{error}</p><p>Saved runs remain in <a href="/app?view=runs">Run history</a>.</p></div>}
      {busy && <p className="proof-working" role="status"><LoaderCircle size={15} className="spin"/>{aiRunning ? 'Codex is deciding. This can take up to 3 minutes; reload will recover the saved request.' : operation?.kind || 'Running the isolated teaching cases…'}</p>}
      {loading ? <div className="proof-placeholder" role="status"><LoaderCircle size={24} className="spin"/> Loading saved evidence…</div> : !proof ? <div className="proof-placeholder"><GitCompareArrows size={32}/><h2>One policy. Three approaches.</h2><p>Run the same two requests through an agent with a planted flaw, an agent that escalates everything, and the corrected agent.</p><p>Deterministic teaching controls. No AI or PayPal call.</p></div> : <>
        <div className="proof-facts" aria-label="Shared evaluation inputs"><span><b>{money(proof.baseline.policy.limitCents)}</b> courtesy limit</span><span><b>{money(proof.baseline.results[0].scenario.priorRefundCents)}</b> already refunded</span><span><b>{money(proof.baseline.results[0].scenario.capturedCents)}</b> purchase</span><span><Check size={14}/> Identical inputs</span></div>
        <div className={`proof-summary ${summary!.passed ? 'is-passed' : 'is-open'}`} ref={summaryRef} tabIndex={-1} aria-label="Comparison result">
          <div>{summary!.passed ? <CheckCircle2 size={25}/> : <GitCompareArrows size={25}/>}<div><h2>{!summary!.comparable ? 'These results cannot establish an improvement.' : hasAI ? `Codex: ${proof.candidate.summary.passed}/${proof.candidate.summary.total} cases passed.` : `${summary!.fixed} ${summary!.fixed === 1 ? 'failure' : 'failures'} fixed. ${summary!.regressed} passing cases lost.`}</h2><p>{summary!.legitimateCompleted}/{summary!.legitimateTotal} legitimate refund cases passed. {summary!.paymentConfirmed ? 'Payment readbacks are complete.' : 'Payment evidence remains incomplete.'}</p></div></div>
          <a href={comparisonUrl}>Inspect comparison <ArrowRight size={17}/></a>
        </div>
        <div className="proof-cards">
          <ProofCard run={proof.baseline} label="01 / THE DEFECT" title="Checks each request" description="Ignores the refund history." kind="baseline"/>
          <ProofCard run={proof.refusal} label="02 / THE SHORTCUT" title="Escalates everything" description="Stops money. Also stops valid refunds." kind="refusal"/>
          <ProofCard run={proof.candidate} label={hasAI ? '03 / RECORDED AI' : '03 / THE CORRECTION'} title={hasAI ? 'Codex’s decisions' : 'Checks the full history'} description={hasAI ? 'Real model response. Independent checks.' : 'Applies the cumulative policy.'} kind="candidate"/>
        </div>
        <p className="proof-disclosure">{hasAI ? 'First two columns: teaching controls. Third column: a recorded Codex call. Every payment is simulated. Two cases are not a model benchmark.' : 'Executed teaching controls · Synthetic payments · This demonstrates the verifier, not a measured AI failure or money saved.'}</p>

        <div className="proof-bottom">
          <section className="proof-method"><p className="proof-eyebrow">WHY THE CHECK MATTERS</p><h2>A payment response is only part of the answer.</h2><p>PayProof checks the approved policy, the proposed action, and independently read payment records. Escalating every request also fails when a customer is entitled to a refund.</p><details><summary>Inspect the method and saved evidence <ChevronDown size={16}/></summary><div className="proof-method-content"><p>These runs use isolated, reviewed examples. Your policy, scenarios and approvals are preserved. The harness executes refunds; it does not inspect an agent’s internal tools.</p><p>Verifier {proof.candidate.provenance?.verifierVersion || 'unknown'} · policy v{proof.candidate.policy.version}. Each case link opens its recorded inputs, checks, timeline and payment records.</p>{hasAI && <div className="proof-ai-identity"><p><strong>Recorded AI call</strong> · {new Date(proof.candidate.createdAt).toLocaleString()}</p><p>Model: {proof.candidate.ai!.model}. An unreported model revision remains unknown.</p><p>Thread: <code>{proof.candidate.ai!.threadId || 'not recorded'}</code></p><p>Input identities are opaque. The model receives no expected actions, case titles or injected faults.</p></div>}<div className="proof-exports">{([['Seeded', proof.baseline], ['Escalate-all', proof.refusal], [hasAI ? 'Codex' : 'Corrected', proof.candidate]] as const).map(([name, run]) => <a key={run.id} href={`/api/runs/${encodeURIComponent(run.id)}/export`}><Download size={14}/>{name} JSON</a>)}</div></div></details></section>
          <section className="proof-next"><Sparkles size={23}/><h2>Now ask a real AI agent.</h2><p>Ask Codex for decisions on these two saved cases. PayProof evaluates its response independently and puts the result in the third column.</p>{checkingStatus ? <button className="proof-button proof-secondary" disabled><LoaderCircle size={16} className="spin"/>Checking Codex…</button> : codexReady ? <button className="proof-button" onClick={runAI} disabled={busy || loading}>{aiRunning ? <LoaderCircle size={16} className="spin"/> : <Sparkles size={16}/>} {aiRunning ? 'Codex is deciding…' : 'Run a fresh Codex check'}</button> : <a className="proof-button" href="/app?view=connections">Connect Codex <ArrowRight size={16}/></a>}<p className="proof-ai-note">Uses your local Codex allowance. Sends synthetic test requests to the model. Payments stay simulated.</p><a className="proof-link" href="/app">Test your own agent in the lab <ArrowUpRight size={14}/></a><a className="proof-link" href="/app?view=connections">Set up PayPal Sandbox <ArrowUpRight size={14}/></a></section>
        </div>
      </>}
      <footer className="proof-footer"><a href="/"><ArrowLeft size={14}/> Back to PayProof</a><span>Evidence for tested cases. Never a blanket safety guarantee.</span><a href="/app?view=docs">Setup guide <ArrowUpRight size={14}/></a></footer>
    </main>
  </div>;
}

function ProofCard({ run, label, title, description, kind }: { run: Run; label: string; title: string; description: string; kind: string }) {
  const complete = run.results.every(result => result.evidenceComplete);
  return <article className={`proof-card proof-card-${kind} is-${run.status}`}>
    <div className="proof-card-heading"><p className="proof-eyebrow">{label}</p><h2>{title}</h2><p>{description}</p></div>
    <div className="proof-cases">{run.results.map(result => <a className="proof-case" key={result.id} href={`/app?run=${encodeURIComponent(run.id)}&case=${encodeURIComponent(result.id)}`} aria-label={`Inspect ${title}: ${money(result.scenario.requestedCents)} request, ${result.verdict}`}>
      <div><span>“{money(result.scenario.requestedCents)} more, please.”</span><Status value={result.verdict}>{result.verdict === 'pass' ? 'Pass' : result.verdict === 'fail' ? 'Fail' : 'Unconfirmed'}</Status></div>
      <p>{result.decision.action === 'refund' ? `Proposed ${money(result.decision.amountCents)} refund` : 'Escalated for review'}<ArrowUpRight size={14}/></p>
      <small>{result.evidenceComplete ? `${money(result.totalRefundCents)} total refunded` : 'Refund total unconfirmed'} · {result.expectedAction === 'refund' ? 'refund expected' : 'escalation expected'}</small>
    </a>)}</div>
    <div className="proof-card-result"><strong>{run.summary.passed}<span>/{run.summary.total} passed</span></strong><span>{complete ? `${money(run.summary.excessCents)} policy excess` : 'Payment evidence incomplete'}</span></div>
    <div className="proof-utility"><span>{run.summary.legitimateCompleted}/{run.summary.legitimateTotal}</span> legitimate refund cases passed</div>
  </article>;
}
