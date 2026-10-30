import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Beaker, Check, CheckCircle2, ChevronDown, CircleAlert, Clock3, Copy, ExternalLink, FileCheck2, Plus, Archive, RotateCcw, RefreshCw, ShieldCheck, Terminal } from "lucide-react";
import type { AppState, Fixture, IntegrationStatus } from "../../shared/types";
import { activeScenarios, isScenarioArchived } from "../../shared/scenario-library";
import { fixtureMatchesScenario, fixtureScenarioReady as isFixtureScenarioReady } from "../../shared/fixture-readiness";
import { api, money, date, Status, BusyIcon } from "./ui";
import "./connections.css";

export default function Connections({ state, operationBusy = false, workspaceCurrent, integrations, refresh, refreshing, onLocalUpdate, onError, onNotice, onReady }: {
  state: AppState;
  operationBusy?: boolean;
  workspaceCurrent: boolean;
  integrations: IntegrationStatus | null;
  refresh: (silent?: boolean) => Promise<AppState | undefined>;
  refreshing: boolean;
  onLocalUpdate: (update: (current: AppState) => AppState) => void;
  onError: (error: string) => void;
  onNotice: (notice: string) => void;
  onReady: (fixture: Fixture) => void;
}) {
  const eligibleScenarios = activeScenarios(state).filter((scenario) => scenario.approved && ["none", "lost-response"].includes(scenario.fault));
  const fixtureScenarioReady = (fixture: Fixture) => isFixtureScenarioReady(state, fixture);
  const fixtureChanged = (fixture: Fixture) => { const current = state.scenarios.find(s => s.id === fixture.scenarioId); return !!current && !fixtureMatchesScenario(fixture, current); };
  const [scenarioId, setScenarioId] = useState(eligibleScenarios[0]?.id || "");
  const [creating, setCreating] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [fixtureError, setFixtureError] = useState<{ id: string; message: string } | null>(null);
  const fixtureErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (fixtureError) { fixtureErrorRef.current?.focus(); fixtureErrorRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); } }, [fixtureError]);
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const createOperations = useRef<Record<string, string>>({});
  function applySavedFixture(saved: Fixture) {
    onLocalUpdate(current => ({ ...current, fixtures: current.fixtures.some(fixture => fixture.id === saved.id)
      ? current.fixtures.map(fixture => fixture.id === saved.id ? saved : fixture)
      : [saved, ...current.fixtures] }));
  }
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const selectedScenario = eligibleScenarios.find((scenario) => scenario.id === scenarioId);
  const unfinishedFixture = state.fixtures.find(fixture => fixture.scenarioId === scenarioId && !fixture.setAsideAt && ["CREATED", "UNKNOWN"].includes(fixture.status));
  const codexConnected = !!(integrations?.codex.authenticated && integrations.codex.available);
  const paypalConfigured = !!integrations?.paypal.configured;
  const createDisabledReason = creating ? "Creating the sandbox order. Its approval link will open when ready."
    : !workspaceCurrent ? "Refresh the workspace before taking another payment action."
    : !integrations ? "Refresh connection status before creating an order."
    : !paypalConfigured ? "Add PayPal sandbox credentials, restart the server, then refresh status."
    : !eligibleScenarios.length ? "Approve a scenario with no fault or a controlled lost response before creating an order."
    : unfinishedFixture ? "An unfinished payment for this scenario is listed below. Approve or resume it, or explicitly set it aside before creating a fresh order."
    : !selectedScenario ? "Choose an approved scenario to prepare its payment."
    : "The approval link opens PayPal Sandbox. Sign in there with a sandbox buyer account.";

  async function createFixture() {
    if (creating || capturing || !workspaceCurrent || !paypalConfigured || !selectedScenario || unfinishedFixture) return;
    setCreating(true);
    onError("");
    try {
      const storageKey = `payproof.sandbox.create.${scenarioId}`;
      let operationId: string | undefined = createOperations.current[scenarioId];
      if (state.fixtures.some(saved => saved.id === operationId && saved.setAsideAt)) operationId = undefined;
      if (!operationId) {
        try { operationId = sessionStorage.getItem(storageKey) || undefined; } catch { /* The in-memory ID still protects retries in this session. */ }
        if (state.fixtures.some(saved => saved.id === operationId && saved.setAsideAt)) operationId = undefined;
        operationId ||= crypto.randomUUID();
        createOperations.current[scenarioId] = operationId;
        try { sessionStorage.setItem(storageKey, operationId); } catch { /* Saved server fixtures remain visible after refresh. */ }
      }
      const fixture = await api<Fixture>("/api/sandbox/fixtures", { method: "POST", body: JSON.stringify({ scenarioId, operationId }) });
      applySavedFixture(fixture);
      delete createOperations.current[scenarioId];
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
      const next = await refresh(true);
      if (next) onNotice("Sandbox order created. Open the approval link, sign in as a sandbox buyer, then capture the approved order.");
      else onError("Sandbox order saved and shown locally, but workspace refresh failed. Use this saved fixture; do not create the order again.");
      if (fixture.approvalUrl) window.open(fixture.approvalUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      onError((error as Error).message);
      await refresh(true).catch(() => undefined);
    } finally { setCreating(false); }
  }
  async function capture(fixture: Fixture, resume = false) {
    if (capturing || creating || !workspaceCurrent || !paypalConfigured || !fixtureScenarioReady(fixture) || fixture.status !== (resume ? "UNKNOWN" : "CREATED")) return;
    setCapturing(fixture.id);
    onError("");
    try {
      const result = await api<Fixture>(`/api/sandbox/fixtures/${encodeURIComponent(fixture.id)}/${resume ? "resume" : "capture"}`, { method: "POST", body: "{}" });
      applySavedFixture(result);
      const next = await refresh(true);
      if (!next) onError("The fixture change was saved and is shown locally, but workspace refresh failed. Refresh before taking another payment action.");
      else onNotice(result.status === "CAPTURED"
        ? "Capture ready. Select it in the test lab to run this scenario."
        : result.status === "CREATED" ? "Order recovered. Approve it as a sandbox buyer before capturing it." : "Preparation is unfinished. Review the saved fixture state below.");
    } catch (error) {
      onError((error as Error).message);
      await refresh(true).catch(() => undefined);
    } finally { setCapturing(null); }
  }
  async function setAside(fixture: Fixture, restore = false) {
    if (capturing || creating || operationBusy || !workspaceCurrent) return;
    setCapturing(fixture.id); setFixtureError(null); onError("");
    try {
      const saved = await api<Fixture>(`/api/sandbox/fixtures/${encodeURIComponent(fixture.id)}/${restore ? 'restore' : 'set-aside'}`, { method: 'POST', body: '{}' });
      applySavedFixture(saved);
      if (!restore) {
        if (createOperations.current[fixture.scenarioId] === fixture.id) delete createOperations.current[fixture.scenarioId];
        const key = `payproof.sandbox.create.${fixture.scenarioId}`;
        try { if (sessionStorage.getItem(key) === fixture.id) sessionStorage.removeItem(key); } catch { /* Saved fixture state is authoritative. */ }
      }
      const next = await refresh(true);
      if (!next) setFixtureError({ id: fixture.id, message: 'Fixture status was saved. Refresh the workspace before continuing.' });
      else onNotice(restore ? 'Fixture restored locally. Its original payment state is unchanged.' : 'Fixture set aside locally. No provider operation was cancelled or repeated.');
    } catch (error) { setFixtureError({ id: fixture.id, message: (error as Error).message }); }
    finally { setCapturing(null); }
  }
  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      window.clearTimeout(copyTimer.current);
      setCopied(value);
      copyTimer.current = window.setTimeout(() => setCopied(null), 2000);
    } catch { onNotice(`Copy this value from the page: ${value}`); }
  }
  function fixtureLabel(fixture: Fixture) {
    if (fixture.setAsideAt) return "Set aside";
    if (fixture.status === "USED") return fixture.execution && !fixture.execution.recordedAt ? "Execution unfinished" : "Used";
    if (fixtureChanged(fixture)) return "Scenario inputs changed";
    if (isScenarioArchived(state, fixture.scenarioId)) return "Scenario archived";
    if (!fixtureScenarioReady(fixture)) return "Scenario needs review";
    if (fixture.status === "CAPTURED") return "Ready to test";
    if (fixture.status === "CREATED") return "Awaiting approval";
    if (fixture.preparation?.state === "pending") return "Provider pending";
    if (fixture.preparation?.state === "prepared") return "Prepared locally";
    if (fixture.preparation?.state === "failed") return "Request rejected";
    return "Outcome unknown";
  }
  function fixtureGuidance(fixture: Fixture) {
    if (fixture.setAsideAt) return "Set aside locally. The provider order or unresolved operation may still exist. No capture, refund or cancellation was requested. Its IDs and saved inputs remain below; a new fixture creates a separate order.";
    if (fixtureChanged(fixture) && fixture.status !== "USED") return "The scenario’s tested inputs changed after this fixture was prepared. Restore those inputs and approve the case, or set this fixture aside before creating a fresh order. Label edits do not invalidate a fixture.";
    if (capturing === fixture.id) return "Checking this saved fixture and recording provider progress…";
    if (isScenarioArchived(state, fixture.scenarioId)) return "This scenario is archived. Restore and approve it before preparing or using its fixture. Saved payment records remain available.";
    if (!fixtureScenarioReady(fixture) && fixture.status !== "USED") return "Review and approve the restored scenario before using its payment fixture.";
    if (fixture.status === "CAPTURED") return "Capture is ready. Open the test lab to run its scenario.";
    if (fixture.status === "USED") return fixture.execution && !fixture.execution.recordedAt
      ? "A completed case result has not been saved. Execution may still be running or may have been interrupted. Inspect the saved report and known request IDs before any further payment action."
      : fixture.execution ? "This fixture has a saved test result. Inspect its evidence before preparing a fresh fixture for another run."
      : "This capture was used before report links were recorded. Inspect Run history and the sandbox journal before preparing another payment.";
    if (!workspaceCurrent) return "Refresh the workspace before taking another payment action.";
    if (!paypalConfigured) return "Restore sandbox credentials and refresh status to continue this fixture.";
    if (fixture.status === "CREATED") return "Approve this order in PayPal before capturing it here.";
    return fixture.preparation?.detail || "The outcome is unconfirmed. Resume this saved fixture to check existing provider records.";
  }
  function identifier(label: string, value: string) {
    return <div className="cn-identifier"><span>{label}</span><code title={value}>{value}</code><button className="cn-copy-id" aria-label={`Copy ${label.toLowerCase()} ID ${value}`} title={copied === value ? "Copied" : `Copy ${label.toLowerCase()} ID`} onClick={() => void copyValue(value)}>{copied === value ? <Check size={15} /> : <Copy size={15} />}</button></div>;
  }

  return <div className="connections-page">
    <div className="page-heading"><div><div className="eyebrow">TOOLS & EVIDENCE SOURCES</div><h1>Connections</h1><p>Use the local simulator now. Connect Codex and PayPal Sandbox when you need them.</p></div><button className="button secondary" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} />{refreshing ? "Refreshing status…" : "Refresh status"}</button></div>
    <div className="cn-connections-grid">
      <section className="panel cn-connection-card">
        <div className="cn-connection-top"><div className="cn-service-icon"><Beaker size={25} /></div><Status value="connected">Ready</Status></div>
        <div className="cn-card-heading"><h2>Local simulator</h2><span className="cn-service-type">Included</span></div>
        <p>Repeatable payment fixtures for testing refund decisions, lost responses, and missing readbacks.</p>
        <div className="cn-connection-detail"><CheckCircle2 size={17} /><span>No account or credentials required.</span></div>
        <div className="cn-next-step"><span className="cn-next-label">READY TO USE</span><p>Choose <strong>Simulator</strong> in the test lab. Saved evidence is explicitly labeled Simulator.</p></div>
      </section>
      <section className="panel cn-connection-card">
        <div className="cn-connection-top"><div className="cn-service-icon"><Terminal size={25} /></div><Status value={codexConnected ? "connected" : "disconnected"}>{!integrations ? "Status unavailable" : codexConnected ? "Connected" : integrations.codex.available ? "Sign-in needed" : "CLI unavailable"}</Status></div>
        <div className="cn-card-heading"><h2>Codex</h2><span className="cn-service-type">ChatGPT plan</span></div>
        <p>Use your local Codex session for AI refund decisions and scenario drafts that you review before testing.</p>
        <div className="cn-connection-detail"><Terminal size={17} /><span>{integrations?.codex.detail || "Refresh status to check the local Codex session."}</span></div>
        {!codexConnected && <div className="cn-terminal-command"><code>npm run codex:login</code><button aria-label="Copy Codex login command" onClick={() => void copyValue("npm run codex:login")}>{copied === "npm run codex:login" ? <Check size={16} /> : <Copy size={16} />}</button></div>}
        <div className="cn-next-step"><span className="cn-next-label">{codexConnected ? "READY TO USE" : "NEXT STEP"}</span><p>{codexConnected ? <>Select <strong>Codex</strong> as the test agent, or generate scenario drafts for review.</> : <>Run the login command in your project terminal, complete sign-in, then <strong>refresh status</strong>.</>}</p></div>
      </section>
      <section className="panel cn-connection-card">
        <div className="cn-connection-top"><div className="cn-service-icon cn-paypal-icon" aria-hidden="true">P</div><Status value="configured">{!integrations ? "Status unavailable" : paypalConfigured ? "Credentials present" : "Setup needed"}</Status></div>
        <div className="cn-card-heading"><h2>PayPal Sandbox</h2><span className="cn-service-type">Test environment</span></div>
        <p>Prepare actual sandbox orders and captures, then inspect provider evidence from your refund tests.</p>
        <div className="cn-connection-detail"><ShieldCheck size={17} /><span>{integrations?.paypal.detail || "Refresh status to check server-side sandbox credentials."}</span></div>
        {paypalConfigured && <p className="cn-verification-note">Credentials are present. This status check does not verify a successful provider connection.</p>}
        <details className="cn-credentials-help"><summary><span>{paypalConfigured ? "View credential setup" : "Set up credentials"}</span><ChevronDown size={16} /></summary><div className="cn-credentials-body"><p>Add sandbox app credentials to the project’s local <code>.env</code> file. Restart the server, then refresh status.</p><pre>PAYPAL_CLIENT_ID=…{"\n"}PAYPAL_CLIENT_SECRET=…</pre><p>Keep secrets server-side. Do not paste them into this dashboard or commit them.</p><a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noreferrer">Open developer dashboard <ExternalLink size={14} /></a></div></details>
        <div className="cn-next-step"><span className="cn-next-label">NEXT STEP</span><p>{paypalConfigured ? "Use the workbench below to create an order and obtain sandbox payment evidence." : "Configure your sandbox app before preparing a payment in the workbench below."}</p></div>
      </section>
    </div>

    <section className="panel cn-workbench" aria-labelledby="workbench-title">
      <div className="cn-workbench-heading"><div><div className="eyebrow">PAYPAL SANDBOX WORKBENCH</div><h2 id="workbench-title">Prepare a payment to test.</h2><p>Create an order, approve it as a sandbox buyer, then capture it for one test run.</p></div><span className="cn-sandbox-badge"><ShieldCheck size={15} />Sandbox only</span></div>
      <ol className="cn-steps"><li><span className="cn-step-number">1</span><div><strong>Create an order</strong><p>Choose an approved scenario below.</p></div></li><li><span className="cn-step-number">2</span><div><strong>Approve as a buyer</strong><p>Follow its PayPal approval link.</p></div></li><li><span className="cn-step-number">3</span><div><strong>Capture & test</strong><p>Use each fresh capture once.</p></div></li></ol>
      <div className="cn-prepare-form">
        <div className="cn-fixture-create"><label className="form-field"><span>Approved scenario</span><select value={selectedScenario?.id || ""} onChange={(event) => setScenarioId(event.target.value)} disabled={creating || !eligibleScenarios.length}><option value="">Select an approved scenario</option>{eligibleScenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.title}{scenario.fault === "lost-response" ? " · Controlled lost response" : ""} · {money(scenario.capturedCents)} capture</option>)}</select></label><button className="button primary" disabled={operationBusy || creating || !!capturing || !workspaceCurrent || !paypalConfigured || !selectedScenario || !!unfinishedFixture} onClick={() => void createFixture()} aria-describedby="create-fixture-guidance"><BusyIcon busy={creating}><Plus size={17} /></BusyIcon>{creating ? "Creating order…" : "Create sandbox order"}</button></div>
        {selectedScenario && <dl className="cn-payment-preview"><div><dt>Capture value</dt><dd>{money(selectedScenario.capturedCents)}</dd></div><div><dt>Prior refunds to prepare</dt><dd>{money(selectedScenario.priorRefundCents)}</dd></div><div><dt>Agent’s test request</dt><dd>{money(selectedScenario.requestedCents)}</dd></div></dl>}
        <p id="create-fixture-guidance" className={`cn-create-guidance ${!paypalConfigured || !selectedScenario ? "cn-guidance-pending" : ""}`}><CircleAlert size={16} /><span>{createDisabledReason}</span></p>
        <p className="cn-fixture-note">Pending and readback-failure cases use the simulator. A controlled lost-response case hides one refund response locally; its payment and readback still use PayPal Sandbox. Preparing a fixture creates its capture and prior refunds before the test.</p>
      </div>
      <div className="cn-fixtures-heading"><h3>Payment fixtures <span>{state.fixtures.length}</span></h3><p>Order and capture IDs stay attached to their scenario.</p></div>
      {!state.fixtures.length ? <div className="cn-fixtures-empty"><div><FileCheck2 size={25} /></div><h3>No payment fixtures yet</h3><p>Create a sandbox order above. Its approval link and capture controls will appear here.</p></div>
        : <div className="cn-fixtures-list">{state.fixtures.map((fixture) => <article className="cn-fixture" key={fixture.id}>
          <div className="cn-fixture-top"><div className="cn-fixture-title"><span className="cn-fixture-icon">{fixture.status === "CAPTURED" ? <CheckCircle2 size={21} /> : fixture.status === "USED" ? <FileCheck2 size={21} /> : fixture.status === "UNKNOWN" ? <CircleAlert size={21} /> : <Clock3 size={21} />}</span><div><h4>{fixture.scenario.title}</h4><p>{date(fixture.createdAt)} <span>·</span> {money(fixture.scenario.capturedCents)} capture <span>·</span> {fixture.openingRefunds.length} confirmed prior refund {fixture.openingRefunds.length === 1 ? "record" : "records"}</p></div></div><Status value={fixture.setAsideAt || fixtureChanged(fixture) && fixture.status !== "USED" ? "review" : isScenarioArchived(state, fixture.scenarioId) ? "archived" : !fixtureScenarioReady(fixture) && fixture.status !== "USED" ? "review" : fixture.preparation?.state === "pending" ? "pending" : fixture.status}>{fixtureLabel(fixture)}</Status></div>
          {(fixture.orderId || fixture.captureId || fixture.seedRefundId) && <div className="cn-fixture-ids">{fixture.orderId && identifier("Order", fixture.orderId)}{fixture.captureId && identifier("Capture", fixture.captureId)}{fixture.seedRefundId && identifier("Opening refund", fixture.seedRefundId)}</div>}
          <details className="cn-operation-details cn-fixture-inputs"><summary>Original fixture inputs <ChevronDown size={15} /></summary><p>Saved when this fixture was created. Current library edits do not change this snapshot.</p><blockquote>{fixture.scenario.message}</blockquote><dl className="cn-payment-preview"><div><dt>Captured</dt><dd>{money(fixture.scenario.capturedCents)}</dd></div><div><dt>Prior refunds</dt><dd>{money(fixture.scenario.priorRefundCents)}</dd></div><div><dt>Requested</dt><dd>{money(fixture.scenario.requestedCents)}</dd></div><div><dt>Supervisor approval</dt><dd>{fixture.scenario.supervisorApproved ? 'Present' : 'Absent'}</dd></div></dl><p>Payment condition: {fixture.scenario.fault === 'none' ? 'Standard processing' : fixture.scenario.fault}</p></details>
          <details className="cn-operation-details"><summary>Saved operation IDs <ChevronDown size={15} /></summary><p>These IDs stay fixed when preparation is resumed. Existing provider IDs are read first; a request with no returned ID can only be replayed within the app’s one-hour recovery window.</p><div className="cn-operation-ids">{identifier("Create request", fixture.createRequestId || fixture.id)}{identifier("Capture request", fixture.captureRequestId)}{identifier("Opening refund request", fixture.seedRequestId)}</div>{fixture.preparation?.attemptedAt && <p>Current step: {fixture.preparation.step === "opening-refund" ? "opening refund" : fixture.preparation.step}. First attempted {date(fixture.preparation.attemptedAt)}.</p>}</details>
          <div className="cn-fixture-bottom"><p className="cn-fixture-next">{fixtureGuidance(fixture)}</p><div className="cn-fixture-actions">
            {fixture.execution && state.runs.some(run => run.id === fixture.execution!.runId) && <a className="button secondary small" href={`/app?run=${encodeURIComponent(fixture.execution.runId)}&case=${encodeURIComponent(fixture.execution.caseId)}`}>Inspect saved execution <ArrowRight size={15} /></a>}
            {!fixture.setAsideAt && (isScenarioArchived(state, fixture.scenarioId) ? <a className="button secondary small" href="/app?view=scenarios&filter=archived">View archived scenarios <ArrowRight size={15} /></a> : !fixtureScenarioReady(fixture) && fixture.status !== "USED" ? <a className="button secondary small" href="/app?view=scenarios">Review scenario <ArrowRight size={15} /></a> : <>
              {fixture.status === "CREATED" && <>{fixture.approvalUrl && <a className="button secondary small" href={fixture.approvalUrl} target="_blank" rel="noreferrer">Approve order <ExternalLink size={14} /></a>}<button className="button primary small" disabled={operationBusy || !!capturing || creating || !workspaceCurrent || !paypalConfigured} onClick={() => void capture(fixture)}><BusyIcon busy={capturing === fixture.id}><ArrowDown size={15} /></BusyIcon>{capturing === fixture.id ? "Capturing…" : "Capture approved order"}</button></>}
              {fixture.status === "UNKNOWN" && <button className="button secondary small" disabled={operationBusy || !!capturing || creating || !workspaceCurrent || !paypalConfigured} onClick={() => void capture(fixture, true)}><BusyIcon busy={capturing === fixture.id}><RefreshCw size={15} /></BusyIcon>{capturing === fixture.id ? "Checking preparation…" : "Resume preparation"}</button>}
              {fixture.status === "CAPTURED" && <button className="button secondary small" onClick={() => onReady(fixture)}>Use in test lab <ArrowRight size={15} /></button>}
            </>)}
            {fixture.status !== "USED" && <button className="button secondary small" onClick={() => void setAside(fixture, !!fixture.setAsideAt)} disabled={operationBusy || !!capturing || creating || !workspaceCurrent}><BusyIcon busy={capturing === fixture.id}>{fixture.setAsideAt ? <RotateCcw size={15} /> : <Archive size={15} />}</BusyIcon>{fixture.setAsideAt ? 'Restore fixture' : 'Set aside fixture'}</button>}
          </div></div>
          {fixture.status !== "USED" && !fixture.setAsideAt && <p className="cn-set-aside-note">Set aside only changes this local workspace. It does not cancel an order or resolve an unknown provider outcome. Inspect the retained payment records before preparing a separate order.</p>}
          {fixtureError?.id === fixture.id && <div ref={fixtureErrorRef} className="agent-import-error" role="alert" tabIndex={-1}>{fixtureError.message}</div>}
        </article>)}</div>}
    </section>
    <span className="cn-visually-hidden" aria-live="polite">{copied ? "Copied to clipboard." : ""}</span>
  </div>;
}
