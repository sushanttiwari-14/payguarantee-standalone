import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, CheckCheck, CheckCircle2,
  ChevronRight, CircleAlert, Clock3, FileCheck2, History, RotateCcw, Search, ShieldCheck, XCircle,
} from "lucide-react";
import type { CaseResult, Run } from "../../shared/types";
import { money, agentName, providerName, date, Status, BusyIcon } from "./ui";
import "./evidence.css";

const evidenceTabs = ["checks", "timeline", "records"] as const;
type EvidenceTab = (typeof evidenceTabs)[number];
const tabLabels: Record<EvidenceTab, string> = {
  checks: "Checks", timeline: "Timeline", records: "Payment records",
};

function EvidenceStatus({ value, unverified = false }: { value: string; unverified?: boolean }) {
  const positive = ["pass", "passed", "COMPLETED"].includes(value);
  const negative = ["fail", "failed", "FAILED"].includes(value);
  const labels: Record<string, string> = {
    pass: "Passed", passed: "Passed", fail: "Failed", failed: "Failed",
    inconclusive: "Inconclusive", unknown: "Unknown", COMPLETED: "Completed",
    PENDING: "Pending", FAILED: "Failed", UNKNOWN: "Unknown",
  };
  const Icon = unverified ? CircleAlert : positive ? CheckCircle2 : negative ? XCircle : CircleAlert;
  return <Status value={unverified ? "unknown" : value}><Icon size={14} aria-hidden="true" />{unverified ? "File reports: " : ""}{labels[value] || value}</Status>;
}

export default function RunEvidence({ run, result, onSelect, onHistory, onReplay, operationBusy = false }: {
  run: Run;
  operationBusy?: boolean;
  result: CaseResult | null;
  onSelect: (id: string) => void;
  onHistory: () => void;
  onReplay: () => Promise<void>;
}) {
  const [tab, setTab] = useState<EvidenceTab>("checks");
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState("");
  const replayPending = useRef(false);
  const replayErrorRef = useRef<HTMLDivElement>(null);
  const sectionId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectionFrameRef = useRef<number | null>(null);
  const tabRefs = useRef<Partial<Record<EvidenceTab, HTMLButtonElement | null>>>({});
  const attentionCount = run.summary.failed + run.summary.inconclusive;
  const external = run.origin?.kind === 'imported-evidence';
  const unfinishedSandbox = run.provider === 'paypal' && !run.replay && run.results.some(result => result.checks.some(check => check.name === 'Execution completion' && check.status === 'unknown'));
  const unfinishedResult = result?.checks.some(check => check.name === 'Execution completion' && check.status === 'unknown');
  let sourceOrigin = run.replay?.sourceOrigin;
  let sourceReplay = run.replay?.sourceReplay;
  while (!sourceOrigin && sourceReplay) { sourceOrigin = sourceReplay.sourceOrigin; sourceReplay = sourceReplay.sourceReplay; }
  const sourceLabel = external ? `Declared ${providerName[run.provider]} · unverified` : providerName[run.provider];
  useEffect(() => { setReplayError(""); }, [run.id]);
  useEffect(() => { if (replayError) replayErrorRef.current?.focus(); }, [replayError]);
  async function replay() {
    if (replayPending.current) return;
    replayPending.current = true; setReplaying(true); setReplayError("");
    try { await onReplay(); }
    catch (error) { setReplayError(error instanceof Error ? error.message : 'Replay could not be completed. Your saved source run is unchanged.'); }
    finally { replayPending.current = false; setReplaying(false); }
  }

  useEffect(() => () => {
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current);
  }, []);

  function selectCase(id: string) {
    onSelect(id);
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current);
    selectionFrameRef.current = requestAnimationFrame(() => {
      selectionFrameRef.current = null;
      const section = sectionRef.current;
      const detail = detailRef.current;
      const heading = detailHeadingRef.current;
      if (!section || !detail || !heading) return;

      const bounds = heading.getBoundingClientRect();
      const headingVisible = bounds.top >= 16 && bounds.bottom <= window.innerHeight - 16;
      if (section.clientWidth < 1100 || !headingVisible) {
        heading.focus({ preventScroll: true });
        detail.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
      }
    });
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, current: EvidenceTab) {
    const index = evidenceTabs.indexOf(current);
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % evidenceTabs.length;
    else if (event.key === "ArrowLeft") next = (index + evidenceTabs.length - 1) % evidenceTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = evidenceTabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = evidenceTabs[next];
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <section ref={sectionRef} className="evidence-section" aria-labelledby={`${sectionId}-heading`}>
      <header className="evidence-heading">
        <div className="evidence-heading-copy">
          <div className="eyebrow">Run evidence</div>
          <h2 id={`${sectionId}-heading`}>
            {external ? "Review the file’s reported results." : attentionCount > 0
              ? `${attentionCount} ${attentionCount === 1 ? "case needs" : "cases need"} attention.`
              : run.status === "passed" ? "The tested cases passed." : "Review the findings."}
          </h2>
          <div className="evidence-run-context">
            <EvidenceStatus value={run.status} unverified={external} />
            <span className="source-pill">{sourceLabel}</span>
            <span>{run.importedAgent ? `${run.importedAgent.name} · ${run.importedAgent.version}` : agentName[run.agent]}</span>
            <span className="evidence-date"><Clock3 size={14} aria-hidden="true" />{date(run.createdAt)}</span>
          </div>
        </div>
        <div className="evidence-actions">
          <button className="button secondary" onClick={onHistory}><History size={16} aria-hidden="true" />Run history</button>
          <a className="button secondary" href={`/api/runs/${encodeURIComponent(run.id)}/export`} download>
            <ArrowDownToLine size={16} aria-hidden="true" />Export JSON
          </a>
        </div>
      </header>

      {external && <div className="evidence-origin-warning" role="status"><CircleAlert size={21} /><div><strong>UNVERIFIED EXTERNAL EVIDENCE</strong><p>These results, payment records, provider, and AI metadata came from an imported file. PayProof did not observe those calls. Replay saved inputs to create a new local simulator evaluation.</p></div></div>}
      {!external && unfinishedSandbox && <div className="evidence-origin-warning" role="status"><CircleAlert size={21} /><div><strong>Sandbox execution has not been finalized</strong><p>This report was saved before payment execution. Completed cases and available operation traces are retained as they arrive. Execution may still be running or may have been interrupted. Refresh to check for updates, and inspect Timeline for known request/refund IDs before another payment action. Unfinished totals remain unconfirmed; reopening this report does not retry payments.</p></div></div>}
      {!external && sourceOrigin && <div className="evidence-origin-warning is-replay" role="status"><ShieldCheck size={20} /><div><strong>Local simulator evaluation of imported inputs</strong><p>This run checked the saved inputs and decisions locally. Provider and AI claims in its imported source remain unverified.</p></div></div>}
      <div className="evidence-replay-action"><div><strong>Replay the saved policy, cases, and decisions</strong><p id={`${sectionId}-replay-help`}>Creates a new simulator run. Recorded decisions are reused; no new AI request or PayPal call is made.</p></div><button className="button secondary" disabled={replaying || operationBusy} onClick={() => void replay()} aria-describedby={`${sectionId}-replay-help`}><BusyIcon busy={replaying}><RotateCcw size={16} /></BusyIcon>{replaying ? 'Replaying saved inputs…' : 'Replay saved inputs'}</button></div>
      {replayError && <div ref={replayErrorRef} className="evidence-replay-error" role="alert" tabIndex={-1}><CircleAlert size={18} /><span>{replayError}</span></div>}

      <details className="evidence-provenance"><summary>Run identity & integration evidence</summary>
        <dl>{run.origin && <><div><dt>Evidence origin</dt><dd>Imported file · unverified external evidence</dd></div><div><dt>File’s source run ID</dt><dd><code>{run.origin.sourceRunId}</code></dd></div><div><dt>Imported here</dt><dd>{date(run.origin.importedAt)}</dd></div></>}
        <div><dt>{external ? 'Declared evaluator' : 'Evaluator'}</dt><dd>{run.provenance?.verifierVersion || 'Legacy run · evaluator version was not recorded'}</dd></div>
        {run.replay && <><div><dt>{external ? 'File’s replay claim' : 'Replay of'}</dt><dd><code>{run.replay.sourceRunId}</code> · {external || run.replay.sourceOrigin ? 'Declared ' : ''}{providerName[run.replay.sourceProvider]}{external || run.replay.sourceOrigin ? ' · unverified source' : ''}</dd></div><div><dt>Replayed decisions</dt><dd>{run.replay.decisions === 'reused' ? 'Original recorded decisions reused' : `Replaced by ${run.replay.replacementAgent || 'a reference agent'}`}</dd></div>{run.replay.sourceAI && <div><dt>{external || sourceOrigin ? 'Source AI · unverified file claim' : 'Original AI evidence'}</dt><dd>{run.replay.sourceAI.model} · <code>{run.replay.sourceAI.threadId || 'Thread not supplied'}</code></dd></div>}</>}
        <div><dt>Agent / prompt version</dt><dd>{run.provenance?.agentVersion || 'Not recorded'}</dd></div>
        {run.provenance?.inputDigest && <div><dt>Input digest</dt><dd><code>{run.provenance.inputDigest}</code></dd></div>}
        {run.replay && <div><dt>Replay input binding</dt><dd>{external ? 'Replay history in this file is unverified. Replay saved inputs here to create a local evaluation.' : run.replay.inputIntegrity === 'verified' ? 'Recorded input digest matched before replay. This checks inputs, not the authenticity of the file or the agent’s answers.' : 'Legacy input binding was not verified. The source did not record a usable digest.'}</dd></div>}
        {run.ai && <><div><dt>{external ? 'Declared AI model · unverified' : 'AI model'}</dt><dd>{run.ai.model}</dd></div><div><dt>{external ? 'Declared Codex thread' : 'Codex thread'}</dt><dd><code>{run.ai.threadId || 'Not supplied'}</code></dd></div>{run.ai.usage && <div><dt>{external ? 'Declared usage' : 'Recorded usage'}</dt><dd>{Object.entries(run.ai.usage).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`).join(' · ')}</dd></div>}</>}
        </dl><p>{external ? 'Everything reported in this imported run is a file claim. Importing did not execute its agent, verify its AI session, or contact its declared payment provider.' : <>{run.replay ? 'This is a local re-evaluation. No new AI request or PayPal payment was made. ' : run.ai ? 'Decisions came from a live Codex request. ' : run.importedAgent ? 'Decisions were supplied by the named external agent; this app did not observe its inference. ' : 'Decisions came from a deterministic teaching agent. '}{run.provider === 'simulator' ? 'Payment records came from the local simulator.' : 'Payment evidence is from PayPal Sandbox; inspect each case’s completeness.'} Retry behavior is controlled by the runner.</>}</p>
      </details>
      <div className="evidence-run-summary">
        <div className="evidence-run-counts" aria-label="Run outcomes">
          <div><CheckCircle2 size={16} className="evidence-positive" aria-hidden="true" /><strong>{run.summary.passed}</strong><span>{external ? "reported passed" : "passed"}</span></div>
          <div><XCircle size={16} className="evidence-negative" aria-hidden="true" /><strong>{run.summary.failed}</strong><span>{external ? "reported failed" : "failed"}</span></div>
          <div><CircleAlert size={16} aria-hidden="true" /><strong>{run.summary.inconclusive}</strong><span>{external ? "reported inconclusive" : "inconclusive"}</span></div>
        </div>
        <p><strong>{run.summary.legitimateCompleted}/{run.summary.legitimateTotal}</strong> {external ? "legitimate refunds reported passed by the file" : "legitimate refund cases passed"}</p>
      </div>

      <div className="evidence-workspace">
        <section className="panel evidence-cases" aria-labelledby={`${sectionId}-cases`}>
          <div className="evidence-panel-heading">
            <div><h3 id={`${sectionId}-cases`}>Scenario results</h3><p>Select a case to inspect its evidence.</p></div>
            <span className="evidence-count">{run.results.length} cases</span>
          </div>
          <div className="evidence-table-scroll">
            <table className="evidence-table">
              <thead><tr><th scope="col">Scenario</th><th scope="col" className="evidence-request-column">Requested</th><th scope="col">Outcome</th></tr></thead>
              <tbody>
                {run.results.map((caseResult) => (
                  <tr key={caseResult.id} className={result?.id === caseResult.id ? "is-selected" : ""}>
                    <td>
                      <button className="evidence-case-button" aria-pressed={result?.id === caseResult.id}
                        aria-label={`Inspect ${caseResult.scenario.title}`} onClick={() => selectCase(caseResult.id)}>
                        <span><strong>{caseResult.scenario.title}</strong><small>{caseResult.scenario.category}</small></span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    </td>
                    <td className="evidence-request-column evidence-amount">{money(caseResult.scenario.requestedCents)}</td>
                    <td><EvidenceStatus value={caseResult.verdict} unverified={external} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="evidence-case-footer"><ShieldCheck size={15} aria-hidden="true" /><span>{external ? "The file reports " : ""}{run.summary.passed} of {run.summary.total} cases passed under policy v{run.policy.version}.</span></div>
        </section>

        {result ? (
          <section ref={detailRef} className="panel evidence-detail" aria-labelledby={`${sectionId}-case-title`}>
            <header className="evidence-detail-heading">
              <div><div className="eyebrow">Selected case</div><h3 ref={detailHeadingRef} tabIndex={-1} id={`${sectionId}-case-title`}>{result.scenario.title}</h3></div>
              <EvidenceStatus value={result.verdict} unverified={external} />
            </header>
            <div className="evidence-case-meta"><span>{result.scenario.category}</span><span>{unfinishedResult ? 'Execution not finalized' : `${result.durationMs.toLocaleString()} ms ${external ? "reported verification time" : "verification · excludes AI decision time"}`}</span><span>{sourceLabel}</span></div>

            <section className="evidence-inputs" aria-label="Tested inputs">
              <h4>{external ? "File’s reported inputs" : "Tested inputs"}</h4><p className="evidence-inputs-note">{external ? "Copied from the imported file. These payment facts have not been checked against a provider here." : "Saved with this run. Later library or policy edits do not change these facts."}</p>
              <span className="evidence-inputs-label">Customer request · untrusted text</span><blockquote>{result.scenario.message}</blockquote>
              <dl><div><dt>Captured payment</dt><dd>{money(result.scenario.capturedCents)}</dd></div><div><dt>Prior refunds</dt><dd>{money(result.scenario.priorRefundCents)}</dd></div><div><dt>Requested refund</dt><dd>{money(result.scenario.requestedCents)}</dd></div><div><dt>Supervisor approval</dt><dd>{result.scenario.supervisorApproved ? 'Present' : 'Absent'}</dd></div><div><dt>Payment condition</dt><dd>{{ none: 'Standard processing', 'lost-response': 'Lost refund response · injected by runner', pending: 'Pending refund · simulated', 'readback-failure': 'Unavailable readback · simulated' }[result.scenario.fault]}</dd></div><div><dt>Tested policy</dt><dd>{run.policy.name} · v{run.policy.version} · {money(run.policy.limitCents)} {run.policy.currency} cumulative limit</dd></div></dl>
            </section>

            <div className="evidence-metrics" aria-label="Amounts for the selected case">
              <div className="evidence-metric">
                <span><ShieldCheck size={14} aria-hidden="true" />Policy limit</span><strong>{money(run.policy.limitCents)}</strong><small>Cumulative per capture</small>
              </div>
              <div className="evidence-metric">
                <span><ArrowUpRight size={14} aria-hidden="true" />{external ? "Reported attempts" : "Agent attempted"}</span><strong className={unfinishedResult ? 'evidence-unconfirmed' : ''}>{unfinishedResult ? 'Unconfirmed' : money(result.attemptedCents)}</strong><small>{unfinishedResult ? 'See saved requests in Timeline' : 'New refund calls in this case'}</small>
              </div>
              <div className={`evidence-metric ${result.evidenceComplete && result.excessCents > 0 ? "evidence-metric-danger" : ""}`}>
                <span><Search size={14} aria-hidden="true" />{external ? "Reported total" : "Observed total"}</span>
                <strong className={result.evidenceComplete ? "" : "evidence-unconfirmed"}>{result.evidenceComplete ? money(result.totalRefundCents) : "Unconfirmed"}</strong>
                <small>{result.evidenceComplete ? "Including prior refunds" : "Readback is incomplete"}</small>
                {result.evidenceComplete && result.excessCents > 0 && <span className="evidence-excess">+{money(result.excessCents)} excess</span>}
              </div>
            </div>
            {!result.evidenceComplete && <div className="evidence-notice"><CircleAlert size={17} aria-hidden="true" /><p>{external ? 'The file reports incomplete payment evidence. Its outcome and payment records have not been verified here.' : result.events.some(event => event.kind === 'decision-contract') ? 'Stopped before payments. An invalid agent answer blocked this batch; no fixture was consumed.' : 'Incomplete payment evidence. New refunds and the total are unconfirmed.'}</p></div>}

            <div className="evidence-decision">
              <div className="evidence-decision-comparison">
                <div><span>{external ? "File’s expected action" : "Expected action"}</span><strong>{result.expectedAction === "refund" ? "Issue refund" : "Escalate for approval"}</strong></div>
                <ArrowRight size={17} aria-hidden="true" />
                <div><span>Agent decision</span><strong>{result.decisionValid === false ? "Invalid output" : result.decision.action === "refund" ? `Refund ${money(result.decision.amountCents)}` : "Escalate for approval"}</strong></div>
              </div>
              <p>{result.decision.reason}</p>
              <div className="evidence-customer-message"><span>Customer-facing message</span><blockquote>{result.decision.customerMessage}</blockquote></div>
              {result.decisionValid === false && <details className="evidence-event-data"><summary>Inspect the rejected agent output</summary><pre>{JSON.stringify(result.submittedDecision, null, 2)}</pre></details>}
            </div>
            <dl className="evidence-balance">
              <div><dt>Prior refunds</dt><dd>{money(result.scenario.priorRefundCents)}</dd></div>
              <div><dt>{external ? "Reported new refunds" : "Observed new refunds"}</dt><dd>{result.evidenceComplete ? money(result.observedRefundCents) : <span className="evidence-unconfirmed">Unconfirmed</span>}</dd></div>
              <div className="evidence-balance-total"><dt>{external ? "Reported total refunds" : "Total refunds"}</dt><dd className={result.evidenceComplete && result.excessCents > 0 ? "evidence-negative" : ""}>{result.evidenceComplete ? money(result.totalRefundCents) : <span className="evidence-unconfirmed">Unconfirmed</span>}</dd></div>
            </dl>

            <div className="evidence-tabs" role="tablist" aria-label="Case evidence">
              {evidenceTabs.map((name) => (
                <button key={name} ref={(node) => { tabRefs.current[name] = node; }} role="tab"
                  id={`${sectionId}-tab-${name}`} aria-controls={`${sectionId}-panel`} aria-selected={tab === name}
                  tabIndex={tab === name ? 0 : -1} onKeyDown={(event) => moveTab(event, name)} onClick={() => setTab(name)} className={tab === name ? "is-active" : ""}>
                  {tabLabels[name]}<span>{name === "checks" ? result.checks.length : name === "timeline" ? result.events.length : result.refunds.length}</span>
                </button>
              ))}
            </div>
            <div className="evidence-tab-content" role="tabpanel" id={`${sectionId}-panel`} aria-labelledby={`${sectionId}-tab-${tab}`} tabIndex={0}>
              {external && <p className="evidence-file-claims">These checks, events, and records are unverified claims from the imported file.</p>}
              {tab === "checks" && (
                <div className="evidence-checks">
                  {result.checks.map((check, index) => (
                    <article className={`evidence-check evidence-check-${check.status}`} key={`${check.name}-${index}`}>
                      <div className="evidence-check-heading"><strong>{check.name}</strong><EvidenceStatus value={check.status} unverified={external} /></div><p>{check.detail}</p>
                    </article>
                  ))}
                  {!result.checks.length && <p className="evidence-empty-copy">No checks were returned for this case.</p>}
                </div>
              )}
              {tab === "timeline" && (
                <ol className="evidence-timeline">
                  {result.events.map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      <span className="evidence-event-number" aria-hidden="true">{index + 1}</span>
                      <div className="evidence-event-content">
                        <div className="evidence-event-meta"><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time><span>{event.kind}</span></div>
                        <h4>{event.title}</h4><p>{event.detail}</p>
                        {event.data && <details className="evidence-event-data"><summary>Inspect event data</summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details>}
                      </div>
                    </li>
                  ))}
                  {!result.events.length && <li className="evidence-empty-copy">No timeline events were returned for this case.</li>}
                </ol>
              )}
              {tab === "records" && (
                <div className="evidence-records">
                  {!result.refunds.length ? (
                    <div className="evidence-records-empty"><FileCheck2 size={24} aria-hidden="true" /><p>{external ? 'No new refund records are included in this file for the selected case.' : 'No new refund records returned for this case.'}</p></div>
                  ) : result.refunds.map((refund, index) => (
                    <article className="evidence-record" key={`${refund.id}-${index}`}>
                      <div className="evidence-record-heading"><div><span>Recorded amount</span><strong>{money(refund.amountCents)}</strong></div><EvidenceStatus value={refund.status} unverified={external} /></div>
                      <dl>
                        <div><dt>Refund ID</dt><dd>{refund.id}</dd></div>
                        <div><dt>Capture ID</dt><dd>{refund.captureId}</dd></div>
                        <div><dt>Request ID</dt><dd>{refund.requestId}</dd></div>
                        <div><dt>Source</dt><dd className="evidence-record-source">{external ? "Declared " : ""}{providerName[refund.source]}{external ? " · unverified" : ""}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <footer className="evidence-detail-footer">
              <span className={!external && result.evidenceComplete ? "evidence-positive" : ""}>
                {!external && result.evidenceComplete ? <CheckCheck size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
                {external ? "Unverified file evidence · no local readback" : result.evidenceComplete ? "Evidence readback complete" : "Evidence readback incomplete"}
              </span>
              <span className="evidence-case-id">Case ID <code>{result.id}</code></span>
            </footer>
          </section>
        ) : <div className="panel evidence-no-selection"><Search size={28} aria-hidden="true" /><h3>Look inside a case.</h3><p>Select a scenario to see its decisions, checks, and payment records.</p></div>}
      </div>
      <div className="evidence-run-id">Run ID <code>{run.id}</code></div>
    </section>
  );
}
