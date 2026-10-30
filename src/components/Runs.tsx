import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowRight, ChevronRight, CircleAlert, GitCompareArrows, History, Play, Search, X } from "lucide-react";
import type { AppState, Run } from "../../shared/types";
import { summarizeRunPayments, type RunPaymentSummary } from "../../shared/run-summary";
import { compareRuns, type CaseChange } from "../../shared/run-comparison";
import { readComparisonLocation, writeComparisonLocation, type ComparisonLocation } from "../../shared/comparison-location";
import EvidenceImport from "./EvidenceImport";
import { money, agentName, providerName, date, Status } from "./ui";
import "./runs.css";

export default function Runs({ state, operationBusy = false, onOpen, onStart, onImported }: {
  state: AppState;
  operationBusy?: boolean;
  onOpen: (run: Run, caseId?: string) => void;
  onStart: () => void;
  onImported: (run: Run) => Promise<void>;
}) {
  const initialBase = state.runs.find((run) => run.agent === "seeded") || state.runs[1];
  const initialCandidate = state.runs.find((run) => run.agent === "corrected" && run.id !== initialBase?.id)
    || state.runs.find((run) => run.id !== initialBase?.id);
  const initialLocation = () => readComparisonLocation(window.location.search, { baseline: initialBase?.id || '', candidate: initialCandidate?.id || '' });
  const [compare, setCompare] = useState(() => initialLocation().open);
  const [baseId, setBaseId] = useState(() => initialLocation().baseline);
  const [candidateId, setCandidateId] = useState(() => initialLocation().candidate);
  const [query, setQuery] = useState(() => initialLocation().query);
  const [outcome, setOutcome] = useState<ComparisonLocation['outcome']>(() => initialLocation().outcome);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') !== 'runs') return;
    const url = writeComparisonLocation(window.location.search, { open: compare, baseline: baseId, candidate: candidateId, query, outcome });
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, '', url);
  }, [compare, baseId, candidateId, query, outcome]);
  useEffect(() => {
    const restore = () => {
      if (new URLSearchParams(window.location.search).get('view') !== 'runs') return;
      const location = initialLocation();
      setCompare(location.open); setBaseId(location.baseline); setCandidateId(location.candidate); setQuery(location.query); setOutcome(location.outcome);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [initialBase?.id, initialCandidate?.id]);
  const base = state.runs.find((run) => run.id === baseId);
  const candidate = state.runs.find((run) => run.id === candidateId);
  const visibleRuns = state.runs.filter((run) => {
    const searchable = `${run.id} ${agentName[run.agent]} ${providerName[run.provider]} ${run.status} ${run.importedAgent?.name || ""} ${run.importedAgent?.version || ""} ${run.origin ? 'imported unverified external evidence' : ''}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase()) && (outcome === "all" || run.status === outcome);
  });
  const comparison = base && candidate ? compareRuns(base, candidate) : null;
  const changeLabels: Record<CaseChange, string> = { regressed: "Previously passed · now needs attention", fixed: "Failure fixed", resolved: "Previously unconfirmed · now passed", unresolved: "Still needs attention", unchanged: "Outcome unchanged", added: "Only in candidate", removed: "Missing from candidate", "not-comparable": "Different test conditions" };

  function excessLabel(summary: RunPaymentSummary) {
    return summary.excessKind === "unconfirmed" ? "Unconfirmed"
      : `${summary.excessKind === "minimum" ? "At least " : ""}${money(summary.confirmedExcessCents)}`;
  }
  function paymentExplanation(summary: RunPaymentSummary) {
    return summary.unconfirmedCases > 0
      ? `${summary.unconfirmedCases} ${summary.unconfirmedCases === 1 ? "case has" : "cases have"} unconfirmed payment evidence.${summary.confirmedExcessCents > 0 ? " The amount shown includes only cases with complete payment evidence." : " A zero excess total cannot be confirmed."}`
      : "No payment evidence was recorded.";
  }

  function comparisonSide(run: Run | undefined, role: "Baseline" | "Candidate", id: string, change: (value: string) => void) {
    const payments = run ? summarizeRunPayments(run) : undefined;
    return <div className="rh-compare-side">
      <label className="form-field">
        <span className="rh-role">{role}</span>
        <select value={id} onChange={(event) => change(event.target.value)}>
          <option value="">Choose a {role.toLowerCase()} run</option>
          {state.runs.map((item) => <option key={item.id} value={item.id}>
            {item.origin ? 'Unverified file · ' : ''}{item.importedAgent ? `${item.importedAgent.name} ${item.importedAgent.version}` : agentName[item.agent]} · {date(item.createdAt)} · {item.id.slice(-6)}
          </option>)}
        </select>
      </label>
      {run ? <>
        <div className="rh-compare-meta"><Status value={run.status}>{run.origin ? `File reports ${run.status}` : undefined}</Status><span>{run.origin ? `File declares ${providerName[run.provider]}` : providerName[run.provider]} · Policy v{run.policy.version}</span>{run.origin && <strong className="rh-imported-label">Unverified external evidence</strong>}</div>
        <dl className="rh-score-grid">
          <div><dt>Cases passed</dt><dd>{run.summary.passed}<span> / {run.summary.total}</span></dd></div>
          <div><dt>Excess refunded</dt><dd className={`rh-payment-amount ${payments!.confirmedExcessCents > 0 ? "rh-excess" : ""} ${!payments!.paymentEvidenceComplete ? "rh-payment-incomplete" : ""}`}>{excessLabel(payments!)}</dd></div>
        </dl>
        {!payments!.paymentEvidenceComplete && <p className="rh-payment-note"><CircleAlert size={15} /><span>{paymentExplanation(payments!)}</span></p>}
        <p className="rh-outcome-breakdown">{run.summary.failed} failed <span>·</span> {run.summary.inconclusive} inconclusive</p>
        <button className="button text rh-evidence-link" onClick={() => onOpen(run)}>Open {role.toLowerCase()} evidence <ArrowRight size={16} /></button>
      </> : <p className="rh-choose-note">Select a recorded run to see its outcomes.</p>}
    </div>;
  }

  return <div className="runs-page">
    <div className="page-heading">
      <div><div className="eyebrow">RECORDED EVIDENCE</div><h1>Run history</h1><p>Review saved results or compare two runs to understand what changed.</p></div>
      <div className="rh-heading-actions">
        <button className="button secondary" onClick={() => setCompare(!compare)} disabled={state.runs.length < 2} aria-expanded={compare} aria-controls="run-comparison" aria-describedby={state.runs.length < 2 ? "compare-unavailable" : undefined}>
          <GitCompareArrows size={17} />{compare ? "Hide comparison" : "Compare runs"}
        </button>
        <button className="button primary" onClick={onStart}><Play size={16} />New test run</button>
        {state.runs.length < 2 && <span id="compare-unavailable" className="rh-disabled-note">Save two runs to compare their evidence.</span>}
      </div>
    </div>

    <EvidenceImport operationBusy={operationBusy} onImported={onImported} />

    {compare && <section id="run-comparison" className="panel rh-comparison" aria-labelledby="comparison-title">
      <div className="rh-panel-heading"><div><div className="eyebrow">BEFORE & AFTER</div><h2 id="comparison-title">Compare recorded runs</h2><p>Choose a baseline and a candidate. Outcomes are limited to the cases each run tested.</p></div><button className="rh-icon-button" aria-label="Close comparison" onClick={() => setCompare(false)}><X size={19} /></button></div>
      <div className="rh-compare-grid">
        {comparisonSide(base, "Baseline", baseId, setBaseId)}
        {comparisonSide(candidate, "Candidate", candidateId, setCandidateId)}
      </div>
      {base && candidate && comparison && <>
        {!comparison.comparable ? <div className="rh-comparison-warning" role="status"><CircleAlert size={18} /><div><strong>Changes cannot be attributed to the agent.</strong>{comparison.reasons.map(reason => <p key={reason}>{reason}</p>)}<p>Outcomes remain visible, but fixes and regressions are not counted across different test conditions.</p></div></div>
          : <section className="rh-delta-summary" aria-label="Recorded changes" aria-live="polite"><div><strong>{comparison.summary.regressed}</strong><span>Previously passing cases lost</span></div><div><strong>{comparison.summary.fixed}</strong><span>Failures fixed</span></div><div><strong>{comparison.summary.unresolved}</strong><span>Candidate cases need attention</span></div><p>Same recorded inputs, policy, evidence source and evaluator. {comparison.summary.resolved > 0 ? `${comparison.summary.resolved} previously inconclusive ${comparison.summary.resolved === 1 ? 'case is' : 'cases are'} now confirmed passing. ` : ''}This comparison covers these cases; it does not establish production readiness.</p></section>}
        <div className="rh-case-heading"><h3>What changed by scenario</h3><span>{comparison.cases.length} distinct cases</span></div>
        <table className="rh-comparison-table"><thead><tr><th scope="col">Scenario</th><th scope="col">Baseline</th><th scope="col">Candidate</th></tr></thead><tbody>
          {comparison.cases.map(({ scenarioId, before, after, change, checks }) => {
            return <tr key={scenarioId}><th scope="row">{(before || after)?.scenario.title}<span className={`rh-case-change rh-change-${change}`}>{changeLabels[change]}</span>{checks.length > 0 && <details className="rh-check-changes"><summary>{checks.length} {checks.length === 1 ? 'check changed' : 'checks changed'}</summary><ul>{checks.map(check => <li key={check.name}><strong>{check.name}</strong><span>{check.before?.status || 'Not recorded'} → {check.after?.status || 'Not recorded'}</span><p>{check.after?.detail || 'This check was not recorded in the candidate.'}</p></li>)}</ul></details>}</th><td data-label="Baseline">{before ? <><Status value={before.verdict} /><button className="rh-case-evidence" onClick={() => onOpen(base, before.id)} aria-label={`Inspect baseline ${before.scenario.title}`}>Inspect evidence <ArrowRight size={13} /></button></> : <span className="rh-not-tested">Not tested</span>}</td><td data-label="Candidate">{after ? <><Status value={after.verdict} /><button className="rh-case-evidence" onClick={() => onOpen(candidate, after.id)} aria-label={`Inspect candidate ${after.scenario.title}`}>Inspect evidence <ArrowRight size={13} /></button></> : <span className="rh-not-tested">Not tested</span>}</td></tr>;
          })}
        </tbody></table>
      </>}
    </section>}

    {!state.runs.length ? <section className="panel rh-empty"><div className="rh-empty-icon"><History size={27} /></div><h2>Your first run starts the record.</h2><p>Run a scenario to save the policy, agent decision, and payment evidence together.</p><button className="button primary" onClick={onStart}><Play size={16} />Open the test lab</button></section>
      : <section className="panel rh-history" aria-labelledby="history-title">
        <div className="rh-panel-heading"><div><h2 id="history-title">Saved runs <span className="rh-count">{state.runs.length}</span></h2><p>Stored locally with the policy and scenario snapshots used at test time.</p></div></div>
        <div className="rh-filters"><label className="rh-search"><Search size={18} /><span className="rh-visually-hidden">Search saved runs</span><input type="search" placeholder="Search agent, run ID, or source" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="rh-filter"><span>Outcome</span><select value={outcome} onChange={(event) => setOutcome(event.target.value as ComparisonLocation['outcome'])}><option value="all">All outcomes</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="inconclusive">Inconclusive</option></select></label></div>
        <div className="rh-list-heading" aria-hidden="true"><span>Run / agent</span><span>Evidence source</span><span>Outcome</span><span>Passed</span><span>Excess refunded</span><span /></div>
        <div className="rh-list">
          {visibleRuns.map((run) => {
            const payments = summarizeRunPayments(run);
            return <article className="rh-row" key={run.id}>
            <button className="rh-row-main" onClick={() => onOpen(run)} aria-label={`Open ${run.importedAgent ? `${run.importedAgent.name} ${run.importedAgent.version}` : agentName[run.agent]} run from ${date(run.createdAt)}, ${run.status}`}>
              <span className="rh-run-identity"><strong>{run.importedAgent ? `${run.importedAgent.name} · ${run.importedAgent.version}` : agentName[run.agent]}</strong>{run.origin && <span className="rh-imported-label">Unverified external evidence</span>}{run.replay && <span className="rh-replay-label">Local snapshot replay</span>}<span className="rh-run-date">{date(run.createdAt)}</span><code title={run.id}>{run.id}</code></span>
              <span className="rh-row-field rh-source"><span className="rh-mobile-label">Evidence source</span>{run.origin ? `File declares ${providerName[run.provider]}` : providerName[run.provider]}</span>
              <span className="rh-row-field"><span className="rh-mobile-label">Outcome</span><Status value={run.status}>{run.origin ? `File reports ${run.status}` : undefined}</Status></span>
              <span className="rh-row-field rh-value"><span className="rh-mobile-label">Passed</span>{run.summary.passed}<span className="rh-total"> / {run.summary.total}</span></span>
              <span className={`rh-row-field rh-value ${payments.confirmedExcessCents > 0 ? "rh-excess" : ""}`} title={!payments.paymentEvidenceComplete ? paymentExplanation(payments) : undefined}><span className="rh-mobile-label">Excess refunded</span><span className="rh-payment-label">{excessLabel(payments)}</span>{!payments.paymentEvidenceComplete && <span className="rh-payment-count">{payments.unconfirmedCases > 0 ? `${payments.unconfirmedCases} ${payments.unconfirmedCases === 1 ? "case" : "cases"} unconfirmed` : "No payment evidence"}</span>}</span>
              <span className="rh-open-hint">View evidence <ChevronRight size={15} /></span>
            </button>
            <a className="rh-icon-button rh-download" href={`/api/runs/${encodeURIComponent(run.id)}/export`} download aria-label={`Download evidence for ${agentName[run.agent]} run ${run.id}`} title="Download run evidence"><ArrowDownToLine size={18} /></a>
          </article>;})}
        </div>
        {!visibleRuns.length && <div className="rh-no-matches"><Search size={23} /><h3>No matching runs</h3><p>Try a different search or include all outcomes.</p><button className="button secondary" onClick={() => {setQuery(""); setOutcome("all");}}>Clear filters</button></div>}
        <div className="rh-history-foot" aria-live="polite"><span>{visibleRuns.length} of {state.runs.length} saved {state.runs.length === 1 ? "run" : "runs"}</span><span>Select a run to inspect its evidence.</span></div>
      </section>}
  </div>;
}
