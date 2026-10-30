import { useEffect, useRef, useState, type SetStateAction } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Beaker,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Code2,
  FileCheck2,
  FlaskConical,
  History,
  Layers3,
  LoaderCircle,
  Menu,
  Play,
  Plug,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AgentKind,
  AppState,
  IntegrationStatus,
  Policy,
  ProviderKind,
  Run,
} from "../shared/types";

import {
  api,
  money,
  agentName,
  providerName,
  BusyIcon,
  Empty,
  useModalFocus,
} from "./components/ui";
import RunEvidence from "./components/RunEvidence";
import AgentImport from "./components/AgentImport";
import Scenarios from "./components/Scenarios";
import Runs from "./components/Runs";
import Connections from "./components/Connections";
import Documentation from "./components/Documentation";
import { MAX_DECISION_BUNDLE_BYTES } from "../shared/limits";
import { activeScenarios, isScenarioArchived } from "../shared/scenario-library";

import { fixtureScenarioReady } from "../shared/fixture-readiness";
import { configurationDifferences } from "../shared/run-configuration";
import { useOperation } from './useOperation';

type Page = "lab" | "scenarios" | "runs" | "connections" | "docs";
const pageNames: Record<Page, string> = {
  lab: "Test lab",
  scenarios: "Scenarios",
  runs: "Run history",
  connections: "Connections",
  docs: "Quickstart",
};
export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(
    null,
  );
  const [page, setPage] = useState<Page>(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    return ["lab", "scenarios", "runs", "connections", "docs"].includes(view || "")
      ? (view as Page)
      : "lab";
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceCurrent, setWorkspaceCurrent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const { operation, unavailable: operationUnavailable, failure: operationFailure, dismissFailure: dismissOperationFailure } = useOperation(() => { void refresh(true); });
  const operationBusy = !!operation;
  const [agent, setAgent] = useState<AgentKind>("seeded");
  const [importedText, setImportedText] = useState("");
  const [importError, setImportError] = useState("");
  const [provider, setProvider] = useState<ProviderKind>("simulator");
  const maxSelected = 20;
  const [selectedScenarios, setSelection] = useState<string[]>([]);
  function setSelectedScenarios(next: SetStateAction<string[]>) {
    setSelection(current => [...new Set(typeof next === 'function' ? next(current) : next)].slice(0, maxSelected));
  }
  const [selectedFixture, setSelectedFixture] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [showSuite, setShowSuite] = useState(false);
  const initialized = useRef(false);
  const refreshVersion = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const operationFailureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (operationFailure && !error && !importError) {
      operationFailureRef.current?.focus();
      operationFailureRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [operationFailure?.id]);
  const navigationRef = useModalFocus(mobileNav, () => setMobileNav(false));
  const activeRun = state?.runs.find((r) => r.id === activeRunId) || null;
  const activeCase =
    activeRun?.results.find((r) => r.id === activeCaseId) ||
    activeRun?.results.find((r) => r.verdict === "fail") ||
    activeRun?.results[0] ||
    null;
  const readyFixtures =
    state?.fixtures.filter((f) => f.status === "CAPTURED" && fixtureScenarioReady(state, f)) || [];
  const fixture = readyFixtures.find((f) => f.id === selectedFixture);
  const approved = state ? activeScenarios(state).filter(scenario => scenario.approved) : [];
  const selectedApproved = approved.filter((s) =>
    selectedScenarios.includes(s.id),
  );
  const configuredScenarios = provider === "paypal" ? (fixture ? [fixture.scenario] : []) : selectedApproved;
  const changedSettings = activeRun && state ? configurationDifferences(activeRun, { agent, provider, policy: state.policy, scenarios: configuredScenarios }) : [];
  const codexReady =
    workspaceCurrent && !!integrations?.codex.authenticated && !!integrations?.codex.available;
  function applyLocalUpdate(update: (current: AppState) => AppState) {
    setState(current => current ? update(current) : current);
  }

  async function refresh(silent = false) {
    const version = ++refreshVersion.current;
    let workspacePending = true;
    let statusPending = true;
    const finishRefresh = () => { if (!workspacePending && !statusPending && version === refreshVersion.current) setRefreshing(false); };
    if (!silent) setRefreshing(true);
    // Connection checks may be slow or unavailable; they never discard a valid workspace.
    void api<IntegrationStatus>("/api/status").then(status => {
      if (version !== refreshVersion.current) return;
      setIntegrations(status);
      setConnectionNotice("");
    }).catch(() => {
      if (version !== refreshVersion.current) return;
      setIntegrations(null);
      setConnectionNotice("Connection status is unavailable. Simulator runs do not require this check; refresh status before using Codex or PayPal Sandbox.");
    }).finally(() => { statusPending = false; finishRefresh(); });
    try {
      const next = await api<AppState>("/api/state");
      if (version !== refreshVersion.current) return undefined;
      setState(next);
      setWorkspaceCurrent(true);
      setWorkspaceError("");
      if (!initialized.current) {
        const requestedRunId = new URLSearchParams(window.location.search).get(
          "run",
        );
        const requestedRun = requestedRunId
          ? next.runs.find((run) => run.id === requestedRunId)
          : undefined;
        setSelectedScenarios(
          requestedRun
            ? requestedRun.results
                .map((result) => result.scenario.id)
                .filter((id) =>
                  next.scenarios.some(
                    (scenario) => scenario.id === id && scenario.approved && !isScenarioArchived(next, scenario.id),
                  ),
                )
            : activeScenarios(next).filter(scenario => scenario.approved).map(scenario => scenario.id),
        );
        setActiveRunId(requestedRun?.id || next.runs[0]?.id || null);
        if (requestedRun) {
          const requestedCaseId = new URLSearchParams(window.location.search).get("case");
          setAgent(requestedRun.origin ? "imported" : requestedRun.agent);
          setProvider(requestedRun.origin ? "simulator" : requestedRun.provider);
          setActiveCaseId(
            requestedRun.results.find(result => result.id === requestedCaseId)?.id ||
            requestedRun.results.find((result) => result.verdict === "fail")
              ?.id ||
              requestedRun.results[0]?.id ||
              null,
          );
          setPage("lab");
        } else if (requestedRunId) {
          setNotice(
            "That saved run was not found. Showing your current workspace.",
          );
        }
        initialized.current = true;
      }
      return next;
    } catch (e) {
      if (version === refreshVersion.current) {
        setWorkspaceCurrent(false);
        setWorkspaceError(`Workspace refresh failed: ${(e as Error).message} Saved changes remain on the server. Refresh before starting another run.`);
      }
    } finally {
      workspacePending = false;
      if (version === refreshVersion.current) setLoading(false);
      finishRefresh();
    }
  }
  useEffect(() => {
    void refresh(true);
  }, []);
  useEffect(() => {
    if (!state) return;
    const available = new Set(activeScenarios(state).filter(scenario => scenario.approved).map(scenario => scenario.id));
    setSelection(current => current.some(id => !available.has(id)) ? current.filter(id => available.has(id)) : current);
    setSelectedFixture(current => current && !state.fixtures.some(fixture => fixture.id === current && fixture.status === "CAPTURED" && fixtureScenarioReady(state, fixture) && available.has(fixture.scenarioId)) ? "" : current);
  }, [state]);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    function restoreLocation() {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view");
      setPage(
        ["lab", "scenarios", "runs", "connections", "docs"].includes(view || "")
          ? (view as Page)
          : "lab",
      );
      const saved = state?.runs.find((run) => run.id === params.get("run"));
      if (saved) {
        setActiveRunId(saved.id);
        setActiveCaseId(saved.results.find(result => result.id === params.get("case"))?.id || saved.results.find(result => result.verdict === "fail")?.id || saved.results[0]?.id || null);
        setAgent(saved.origin ? "imported" : saved.agent);
        setProvider(saved.origin ? "simulator" : saved.provider);
        setSelectedScenarios(saved.results.map((result) => result.scenario.id).filter((id) => state?.scenarios.some((scenario) => scenario.id === id && scenario.approved && !isScenarioArchived(state, id))));
        setPage("lab");
      }
      setMobileNav(false);
    }
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [state]);
  function navigate(next: Page, runId?: string, caseId?: string) {
    setPage(next);
    setMobileNav(false);
    const params = new URLSearchParams({ view: next });
    if (runId) params.set("run", runId);
    if (runId && caseId && state?.runs.find(run => run.id === runId)?.results.some(result => result.id === caseId)) params.set("case", caseId);
    window.history.pushState(null, "", `/app?${params}`);
    window.scrollTo({ top: 0, behavior: "instant" });
    window.requestAnimationFrame(() =>
      mainRef.current?.focus({ preventScroll: true }),
    );
  }
  async function acceptSavedEvidence(run: Run, action: "import" | "replay") {
    // The returned run is already saved. Show it even if the following workspace GET fails.
    applyLocalUpdate(current => ({ ...current, runs: [run, ...current.runs.filter(item => item.id !== run.id)] }));
    setActiveRunId(run.id);
    setActiveCaseId(run.results.find(result => result.verdict === "fail")?.id || run.results[0]?.id || null);
    setAgent(run.origin ? "imported" : run.agent);
    setProvider("simulator");
    setSelectedFixture("");
    if (run.origin) { setImportedText(""); setImportError(""); }
    const next = await refresh(true);
    navigate("lab", run.id);
    if (!next) setError(`${action === "import" ? "Evidence imported" : "Replay saved"}, but the workspace could not refresh. The saved run is shown; do not repeat the action to recover it.`);
    else setNotice(action === "import" ? "Evidence imported as unverified file claims. Replay saved inputs to evaluate them locally." : "Saved inputs replayed in the local simulator. No new AI or PayPal calls were made.");
  }
  async function replaySavedInputs(runId: string) {
    if (running || operationBusy) throw new Error("Wait for the current evaluation to finish, then replay the saved inputs.");
    setRunning(true);
    try {
      const replayed = await api<Run>(`/api/runs/${encodeURIComponent(runId)}/replay`, { method: "POST", body: "{}" });
      await acceptSavedEvidence(replayed, "replay");
    } finally { setRunning(false); }
  }
  async function runSuite() {
    if (!workspaceCurrent || (agent === "imported" && new TextEncoder().encode(importedText).byteLength > MAX_DECISION_BUNDLE_BYTES)) return;
    const startedLocation = window.location.pathname + window.location.search;
    const startedFixture = selectedFixture;
    if (agent === "imported") setImportError(""); else setError("");
    setRunning(true);
    try {
      const result = await api<Run>("/api/runs", {
        method: "POST",
        body: JSON.stringify({
          agent,
          provider,
          scenarioIds:
            provider === "paypal" && fixture
              ? [fixture.scenarioId]
              : selectedApproved.map((s) => s.id),
          ...(provider === "paypal" ? { fixtureIds: [selectedFixture] } : {}),
          ...(agent === "imported" ? { decisionBundle: JSON.parse(importedText) } : {}),
        }),
      });
      const next = await refresh(true);
      if (!next)
        setState((s) =>
          s
            ? {
                ...s,
                runs: [result, ...s.runs.filter((r) => r.id !== result.id)],
              }
            : s,
        );
      setSelectedFixture((current) => current === startedFixture ? "" : current);
      if (window.location.pathname + window.location.search === startedLocation) {
        setActiveRunId(result.id);
        setActiveCaseId(result.results.find((r) => r.verdict === "fail")?.id || result.results[0]?.id || null);
        setShowSuite(false);
        window.history.replaceState(null, "", `/app?view=lab&run=${encodeURIComponent(result.id)}`);
      } else {
        setNotice("Run complete. Your results are saved in Run history.");
      }
    } catch (e) {
      const message = e instanceof SyntaxError ? "Paste a valid JSON decision bundle before running your agent." : (e as Error).message;
      if (agent === "imported") setImportError(message); else setError(message);
    } finally {
      setRunning(false);
    }
  }
  const canRun =
    !running && !operationBusy && workspaceCurrent &&
    (agent !== "codex" || codexReady) &&
    (agent !== "imported" || (importedText.trim().length > 0 && new TextEncoder().encode(importedText).byteLength <= MAX_DECISION_BUNDLE_BYTES)) &&
    (provider === "simulator"
      ? selectedApproved.length > 0 && selectedApproved.length <= maxSelected
      : !!fixture && !!integrations?.paypal.configured);

  return (
    <div className="app-shell">
      <a className="app-skip" href="#app-content">
        Skip to workspace
      </a>
      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        ref={navigationRef}
        id="workspace-navigation"
        className={`sidebar ${mobileNav ? "open" : ""}`}
        role={mobileNav ? "dialog" : undefined}
        tabIndex={-1}
        aria-modal={mobileNav || undefined}
        aria-label="Workspace navigation"
      >
        <div className="brand-row">
          <a
            className="brand"
            href="/"
            aria-label="PayProof home"
            title="PayProof home"
          >
            <span className="brand-icon">
              <ShieldCheck size={23} strokeWidth={1.8} />
            </span>
            <span>
              payproof<span className="brand-period">.</span>
            </span>
          </a>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            <Layers3 size={17} />
          </span>
          <span>
            Personal workspace
            <small>
              <span className="environment-dot" />
              Local development
            </small>
          </span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace pages">
          {(
            [
              { id: "lab", icon: FlaskConical, label: "Test lab" },
              { id: "scenarios", icon: Layers3, label: "Scenarios" },
              { id: "runs", icon: History, label: "Run history" },
              { id: "connections", icon: Plug, label: "Connections" },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "scenarios" && state && (
                <span className="nav-count">{activeScenarios(state).length}</span>
              )}
              {id === "runs" && !!state?.runs.length && (
                <span className="nav-count">{state.runs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-support">
            <a href="/app?view=docs" aria-current={page === "docs" ? "page" : undefined} onClick={(event) => { event.preventDefault(); navigate("docs"); }}>
              <FileCheck2 size={16} /> Help & documentation{" "}
              <ArrowUpRight size={13} />
            </a>
            <a href="/">
              <ArrowLeft size={16} /> Back to website
            </a>
          </div>
          <div className="sidebar-footer">
            <span className="user-avatar">
              <ShieldCheck size={16} />
            </span>
            <span>
              Your local workspace<small>Runs stored on this device</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={mobileNav || policyOpen}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-button"
              onClick={() => setMobileNav(true)}
              aria-label="Open menu"
              aria-expanded={mobileNav}
              aria-controls="workspace-navigation"
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight size={13} />
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="topbar-right">
            <a
              className="topbar-docs"
              href="/app?view=docs"
              onClick={(event) => { event.preventDefault(); navigate("docs"); }}
            >
              Quickstart <ArrowUpRight size={13} />
            </a>
            <span className="topbar-divider" />
            <span className="safe-environment">
              <span />
              Sandbox only
            </span>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              title="Refresh workspace"
              onClick={() => {
                setError("");
                void refresh();
              }}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            </button>
          </div>
        </header>
        <main id="app-content" className="app-main" ref={mainRef} tabIndex={-1}>
          {operation && <div className="alert operation-status" role="status"><LoaderCircle size={18} className="spin" /><span><strong>{operation.kind}</strong><br />Running since {new Date(operation.startedAt).toLocaleTimeString()}. You can browse saved evidence. Changes and new runs will be available when this operation ends.</span></div>}
          {operationFailure && <div ref={operationFailureRef} className="alert error operation-failure" role="alert" tabIndex={-1}><CircleAlert size={18} /><span><strong>{operationFailure.kind} did not complete.</strong><br />The server reported a failure at {new Date(operationFailure.finishedAt).toLocaleString()}. Saved progress may still exist. Review your cases, run history or payment fixtures before retrying.</span><button onClick={dismissOperationFailure} aria-label="Dismiss operation failure"><X size={16} /></button></div>}
          {operationUnavailable && <div className="alert" role="status"><CircleAlert size={18} /><span>Operation status is unavailable. A request may still be running; refresh the workspace before retrying a payment action.</span></div>}
          {workspaceError && <div className="alert error" role="alert"><CircleAlert size={18} /><span>{workspaceError}</span><button onClick={() => void refresh()} disabled={refreshing}>Refresh workspace</button></div>}
          {connectionNotice && <div className="alert" role="status"><CircleAlert size={18} /><span>{connectionNotice}</span><button onClick={() => void refresh()} disabled={refreshing}>Refresh status</button></div>}
          {error && (
            <div className="alert error" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="initial-loading">
              <LoaderCircle className="spin" size={28} />
              <p>Opening your test lab…</p>
            </div>
          ) : !state ? (
            <Empty
              icon={<Plug size={28} />}
              title="Your workspace is unavailable"
            >
              <button
                className="button secondary"
                onClick={() => void refresh()}
              >
                Try again
              </button>
            </Empty>
          ) : (
            <>
              {page === "lab" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        <span className="orange-line" />
                        BEFORE YOU SHIP
                      </div>
                      <h1>Test lab</h1>
                      <p>
                        Put your refund agent to the test. Follow every decision
                        to the money.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => navigate("scenarios")}
                    >
                      <Layers3 size={15} />
                      Manage scenarios
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="lab-top-grid">
                    <section className="panel run-config">
                      <div className="section-heading">
                        <span className="section-number">01</span>
                        <h2>Configure your next run</h2>
                        <span className="label-soft">Release test</span>
                      </div>
                      <div
                        className="agent-options"
                        role="group"
                        aria-label="Agent under test"
                      >
                        {(["seeded", "corrected", "codex", "imported"] as AgentKind[]).map(
                          (value) => (
                            <button
                              key={value}
                              className={`agent-option ${agent === value ? "selected" : ""}`}
                              aria-pressed={agent === value}
                              onClick={() => setAgent(value)}
                              disabled={running || operationBusy || (value === "codex" && !codexReady)}
                              title={
                                value === "codex" && !codexReady
                                  ? "Connect Codex on the Connections page to use this agent"
                                  : undefined
                              }
                            >
                              <span className="agent-icon">
                                {value === "seeded" ? (
                                  <Code2 size={17} />
                                ) : value === "corrected" ? (
                                  <FileCheck2 size={17} />
                                ) : (
                                  <Sparkles size={17} />
                                )}
                              </span>
                              <span>
                                <strong>
                                  {value === "codex"
                                    ? "Codex"
                                    : agentName[value]}
                                </strong>
                                <small>
                                  {value === "seeded"
                                    ? "Find the known faults"
                                    : value === "corrected"
                                      ? "Verify the candidate fix"
                                      : value === "imported"
                                        ? "Import a decision bundle"
                                      : codexReady
                                        ? "Your ChatGPT plan"
                                        : "Connect to enable"}
                                </small>
                              </span>
                              {agent === value && (
                                <CheckCircle2
                                  size={16}
                                  className="agent-selected-check"
                                />
                              )}
                            </button>
                          ),
                        )}
                      </div>
                      <div className="config-row">
                        <div className="provider-field">
                          <label htmlFor="provider">Evidence source</label>
                          <div className="select-wrap">
                            <select
                              id="provider"
                              disabled={running || operationBusy}
                              value={provider}
                              onChange={(e) => {
                                setProvider(e.target.value as ProviderKind);
                                setSelectedFixture("");
                              }}
                            >
                              <option value="simulator">Simulator</option>
                              <option value="paypal">PayPal Sandbox</option>
                            </select>
                            <ChevronDown size={14} />
                          </div>
                        </div>
                        <div className="suite-field">
                          <label>
                            {provider === "simulator"
                              ? "Test suite"
                              : "Prepared capture"}
                          </label>
                          {provider === "simulator" ? (
                            <button
                              className="suite-toggle"
                              disabled={running || operationBusy}
                              onClick={() => setShowSuite(!showSuite)}
                              aria-expanded={showSuite}
                              aria-controls="suite-picker"
                            >
                              <Layers3 size={15} />
                              <span>
                                {selectedApproved.length} approved{" "}
                                {selectedApproved.length === 1
                                  ? "scenario"
                                  : "scenarios"}
                              </span>
                              <ChevronDown
                                size={14}
                                className={showSuite ? "rotated" : ""}
                              />
                            </button>
                          ) : (
                            <div className="select-wrap">
                              <select
                                aria-label="Select captured sandbox fixture"
                                disabled={running || operationBusy}
                                value={selectedFixture}
                                onChange={(e) =>
                                  setSelectedFixture(e.target.value)
                                }
                              >
                                <option value="">Select a fresh capture</option>
                                {readyFixtures.map((f) => (
                                  <option value={f.id} key={f.id}>
                                    {f.scenario.title} · {f.id.slice(-6)}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={14} />
                            </div>
                          )}
                        </div>
                        <button
                          className="button primary run-button"
                          onClick={runSuite}
                          disabled={!canRun}
                        >
                          <BusyIcon busy={running}>
                            <Play size={15} fill="currentColor" />
                          </BusyIcon>
                          {running ? "Running checks…" : "Run test suite"}
                        </button>
                      </div>
                      {showSuite && provider === "simulator" && (
                        <div className="suite-picker" id="suite-picker">
                          <div className="suite-picker-top">
                            <strong>{selectedApproved.length} of {maxSelected} cases selected</strong>
                            <button
                              className="text-button"
                              disabled={running || operationBusy}
                              onClick={() =>
                                setSelectedScenarios(
                                  selectedApproved.length === Math.min(approved.length, maxSelected)
                                    ? []
                                    : approved.map((s) => s.id),
                                )
                              }
                            >
                              {selectedApproved.length === Math.min(approved.length, maxSelected)
                                ? "Clear all"
                                : approved.length > maxSelected ? "Select first 20" : "Select all"}
                            </button>
                          </div>
                          <p className="suite-limit-note">Run up to {maxSelected} cases at a time. {selectedApproved.length >= maxSelected ? "Uncheck a case to choose another." : `${approved.length} approved cases are available.`}</p>
                          {approved.map((s) => (
                            <label className="suite-check" key={s.id}>
                              <input
                                type="checkbox"
                                disabled={running || operationBusy || (!selectedScenarios.includes(s.id) && selectedApproved.length >= maxSelected)}
                                checked={selectedScenarios.includes(s.id)}
                                onChange={(e) =>
                                  setSelectedScenarios((prev) =>
                                    e.target.checked
                                      ? [...prev, s.id]
                                      : prev.filter((id) => id !== s.id),
                                  )
                                }
                              />
                              <span>
                                {s.title}
                                <small>{s.category}</small>
                              </span>
                              <span className="mono">
                                {money(s.requestedCents)}
                              </span>
                            </label>
                          ))}
                          {!approved.length && (
                            <p className="muted">
                              Approve a scenario to include it in a run.
                            </p>
                          )}
                        </div>
                      )}
                      {agent === "imported" && <AgentImport scenarioIds={provider === "paypal" && fixture ? [fixture.scenarioId] : selectedApproved.map(s => s.id)} value={importedText} onChange={setImportedText} disabled={running || operationBusy} onError={setImportError} error={importError} />}
                      {!workspaceCurrent && <p className="config-disabled-note">Refresh the workspace to confirm current scenarios and fixtures before running.</p>}
                      {provider === "paypal" && !fixture && (
                        <p className="config-disabled-note">
                          <CircleAlert size={14} />
                          <span>
                            {integrations?.paypal.configured
                              ? "Prepare a fresh capture to run in sandbox."
                              : "Connect PayPal Sandbox before running provider tests."}{" "}
                            <button onClick={() => navigate("connections")}>
                              Set up in Connections
                            </button>
                          </span>
                        </p>
                      )}
                      {!codexReady && (
                        <p className="config-disabled-note">
                          <Sparkles size={14} />
                          <span>
                            Want live AI decisions?{" "}
                            <button onClick={() => navigate("connections")}>
                              Connect Codex
                            </button>
                          </span>
                        </p>
                      )}
                      {provider === "simulator" && !selectedApproved.length && (
                        <p className="config-disabled-note">
                          <CircleAlert size={14} />
                          Select at least one approved scenario to run.
                        </p>
                      )}
                      <div className="config-footnote">
                        <ShieldCheck size={14} />
                        <span>
                          {provider === "simulator"
                            ? "Local deterministic fixtures. No payment provider is called."
                            : "One fresh, approved sandbox capture per case. No live money."}
                        </span>
                        {provider === "paypal" && (
                          <button
                            className="text-button"
                            onClick={() => navigate("connections")}
                          >
                            Prepare capture <ArrowUpRight size={12} />
                          </button>
                        )}
                      </div>
                    </section>
                    <section className="policy-card">
                      <div className="policy-top">
                        <span className="eyebrow">ACTIVE POLICY</span>
                        <button
                          className="icon-button"
                          onClick={() => setPolicyOpen(true)}
                          aria-label="Edit refund policy"
                          disabled={running || operationBusy}
                        >
                          <Settings2 size={17} />
                        </button>
                      </div>
                      <div className="policy-value">
                        {money(state.policy.limitCents)}
                        <span>USD</span>
                      </div>
                      <h3>Cumulative refund limit</h3>
                      <p>
                        Across all refunds on one capture.
                        <br />
                        Above the limit, ask a human.
                      </p>
                      <div className="policy-bottom">
                        <span className="policy-version">
                          POLICY V{state.policy.version}
                        </span>
                        <span>{state.policy.name}</span>
                      </div>
                    </section>
                  </div>
                  {activeRun && <aside className={`saved-run-scope ${changedSettings.length ? 'has-differences' : ''}`} aria-label="Saved result scope">
                    <FileCheck2 size={19} aria-hidden="true" />
                    <div><strong>Saved results · {activeRun.summary.total} {activeRun.summary.total === 1 ? 'case' : 'cases'}</strong>
                      <p>{activeRun.importedAgent ? `${activeRun.importedAgent.name} · ${activeRun.importedAgent.version}` : agentName[activeRun.agent]} · {providerName[activeRun.provider]} · {money(activeRun.policy.limitCents)} policy v{activeRun.policy.version}</p>
                      <p>{changedSettings.length ? `The configuration above differs: ${changedSettings.join(', ')}. Run the test suite to evaluate those settings.` : 'The controls above configure a new run. These saved results retain the inputs and decisions recorded at test time.'}</p>
                    </div>
                  </aside>}
                  {running && (
                    <div className="running-strip" role="status">
                      <LoaderCircle size={18} className="spin" />
                      <div>
                        <strong>Following the money</strong>
                        <span>
                          Running decisions, reading payment state, and checking
                          policy. This may take a moment.
                        </span>
                      </div>
                      <div className="running-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}
                  {!activeRun ? (
                    <>
                      <section className="first-run-hero">
                        <div className="first-run-copy">
                          <div className="eyebrow">
                            A SMALL REQUEST. A BIG DIFFERENCE.
                          </div>
                          <h2>
                            A $10 refund can break
                            <br />a $20 promise.
                          </h2>
                          <p>
                            An agent can approve a reasonable request and still
                            cross your cumulative limit. PayProof checks the
                            full story.
                          </p>
                          <span className="illustration-label">
                            <Beaker size={13} /> Illustrative scenario · not a
                            test result
                          </span>
                        </div>
                        <div className="money-example">
                          <div className="example-line">
                            <span>
                              <span className="example-number">1</span>Already
                              refunded
                            </span>
                            <strong>$15.00</strong>
                          </div>
                          <div className="example-line">
                            <span>
                              <span className="example-number">2</span>New
                              refund request
                            </span>
                            <strong>+ $10.00</strong>
                          </div>
                          <div className="example-total">
                            <span>Total exposure</span>
                            <strong>$25.00</strong>
                          </div>
                          <div className="example-warning">
                            <CircleAlert size={15} />
                            $5.00 above a $20.00 policy
                          </div>
                        </div>
                      </section>
                      <section className="panel evidence-empty">
                        <div>
                          <span className="section-number">02</span>
                          <h2>The evidence starts here</h2>
                        </div>
                        <div className="empty-evidence-row">
                          <div className="evidence-empty-icon">
                            <FileCheck2 size={24} />
                          </div>
                          <span>
                            <strong>No runs yet</strong>
                            <small>
                              Run the seeded agent to establish your baseline,
                              then compare the corrected agent.
                            </small>
                          </span>
                          <ArrowUpRight size={21} />
                        </div>
                      </section>
                    </>
                  ) : (
                    <RunEvidence
                      run={activeRun}
                      result={activeCase}
                      onSelect={(caseId) => {
                        if (!activeRun.results.some(result => result.id === caseId)) return;
                        setActiveCaseId(caseId);
                        const params = new URLSearchParams(window.location.search);
                        params.set("view", "lab"); params.set("run", activeRun.id); params.set("case", caseId);
                        window.history.replaceState(null, "", `/app?${params}`);
                      }}
                      onHistory={() => navigate("runs")}
                      onReplay={() => replaySavedInputs(activeRun.id)}
                      operationBusy={operationBusy}
                    />
                  )}
                  <div className="page-footer">
                    <span>
                      <ShieldCheck size={13} />
                      Evidence for your tested scenarios. Never a blanket safety
                      guarantee.
                    </span>
                    <span>PAYPROOF · BEFORE YOU SHIP</span>
                  </div>
                </>
              )}
              {page === "scenarios" && (
                <Scenarios
                  operationBusy={operationBusy}
                  state={state}
                  codexReady={codexReady}
                  refresh={refresh}
                  onLocalUpdate={applyLocalUpdate}
                  onError={setError}
                  onNotice={setNotice}
                  onApprove={(id) =>
                    setSelectedScenarios((prev) => [...new Set([...prev, id])])
                  }
                />
              )}
              {page === "runs" && (
                <Runs
                  operationBusy={operationBusy}
                  state={state}
                  onImported={(run) => acceptSavedEvidence(run, "import")}
                  onOpen={(run, caseId) => {
                    setActiveRunId(run.id);
                    setActiveCaseId(caseId || run.results.find(result => result.verdict === "fail")?.id || run.results[0]?.id || null);
                    setAgent(run.origin ? "imported" : run.agent);
                    setProvider(run.origin ? "simulator" : run.provider);
                    if (run.origin) { setImportedText(""); setImportError(""); }
                    setSelectedScenarios(
                      run.results
                        .map((result) => result.scenario.id)
                        .filter((id) =>
                          approved.some((scenario) => scenario.id === id),
                        ),
                    );
                    navigate("lab", run.id, caseId);
                  }}
                  onStart={() => navigate("lab")}
                />
              )}
              {page === "connections" && (
                <Connections
                  operationBusy={operationBusy}
                  state={state}
                  workspaceCurrent={workspaceCurrent}
                  integrations={integrations}
                  refresh={refresh}
                  onLocalUpdate={applyLocalUpdate}
                  refreshing={refreshing}
                  onError={setError}
                  onNotice={setNotice}
                  onReady={(f) => {
                    setSelectedFixture(f.id);
                    setProvider("paypal");
                    navigate("lab");
                  }}
                />
              )}
              {page === "docs" && <Documentation onNavigate={navigate} />}
            </>
          )}
        </main>
      </div>
      {policyOpen && state && (
        <PolicyModal
          operationBusy={operationBusy}
          policy={state.policy}
          onClose={() => setPolicyOpen(false)}
          onSave={async (policy) => {
            const saved = await api<Policy>("/api/policy", {
              method: "PATCH",
              body: JSON.stringify(policy),
            });
            applyLocalUpdate(current => ({ ...current, policy: saved, scenarios: current.scenarios.map(scenario => ({
              ...scenario,
              expectedAction: scenario.requestedCents > 0 && scenario.requestedCents <= scenario.capturedCents - scenario.priorRefundCents && (scenario.supervisorApproved || scenario.priorRefundCents + scenario.requestedCents <= saved.limitCents) ? "refund" : "escalate",
              approved: scenario.source === "curated" && scenario.approved,
              ...(scenario.generation ? { generation: { ...scenario.generation, pair: undefined } } : {}),
            })) }));
            const next = await refresh(true);
            setPolicyOpen(false);
            if (next) setNotice("Policy updated. Existing runs keep their original policy snapshot.");
            else setError("Policy saved, but the workspace could not refresh. The saved policy is shown; refresh before starting another run.");
          }}
        />
      )}
    </div>
  );
}

function PolicyModal({
  operationBusy,
  policy,
  onClose,
  onSave,
}: {
  operationBusy: boolean;
  policy: Policy;
  onClose: () => void;
  onSave: (policy: { name: string; limitCents: number }) => Promise<void>;
}) {
  const [name, setName] = useState(policy.name);
  const [amount, setAmount] = useState((policy.limitCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    if (!saving) onClose();
  };
  const modalRef = useModalFocus(true, close);
  const value = Number(amount);
  const valid =
    name.trim().length > 0 &&
    amount.trim() !== "" &&
    /^\d+(\.\d{0,2})?$/.test(amount) &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1000;
  async function save() {
    if (!valid) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), limitCents: Math.round(value * 100) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="policy-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !saving) void save();
          }}
        >
          <div className="modal-header">
            <div>
              <div className="eyebrow">WORKSPACE SETTINGS</div>
              <h2 id="policy-modal-title">Refund policy</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={close}
              disabled={saving}
              aria-label="Close policy editor"
            >
              <X size={20} />
            </button>
          </div>
          <p className="modal-intro">
            Set the cumulative amount an agent may refund on one capture without
            supervisor approval.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <label className="form-field">
            Policy name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              disabled={saving}
              required
            />
          </label>
          <label className="form-field">
            Cumulative refund limit (USD)
            <div className="currency-input">
              <span>$</span>
              <input
                type="text"
                inputMode="decimal"
                aria-describedby="policy-amount-help"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={saving}
                required
              />
            </div>
            <small className="form-help" id="policy-amount-help">
              Enter $0–$1,000 with up to two decimal places.
            </small>
          </label>
          <div className="info-note">
            <History size={16} />
            <span>
              New runs use this policy. AI drafts will need review again;
              previous runs keep their original policy snapshot.
            </span>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={close}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={saving || operationBusy || !valid}
            >
              <BusyIcon busy={saving}>
                <Check size={15} />
              </BusyIcon>
              {saving ? "Saving…" : "Save policy"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
