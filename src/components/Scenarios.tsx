import { useState } from "react";
import { Archive, ArchiveRestore, ArrowRight, Check, CheckCircle2, CircleAlert, FileCheck2, Layers3, LoaderCircle, Plus, Search, ShieldCheck, Sparkles, Terminal, X } from "lucide-react";
import type { AppState, Scenario, ScenarioArchiveResult } from "../../shared/types";
import { activeScenarios, isScenarioArchived, MAX_ACTIVE_SCENARIOS } from "../../shared/scenario-library";
import { api, money, Status, BusyIcon, Empty, useModalFocus } from "./ui";
import "./scenarios.css";

type ScenarioFilter = "all" | "review" | "approved" | "archived";
type AmountField = "capturedCents" | "priorRefundCents" | "requestedCents";
const amountLabels: Record<AmountField, string> = { capturedCents: "Captured payment", priorRefundCents: "Prior refunds", requestedCents: "Requested refund" };
function parseUSD(value: string): number | null {
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents <= 100000 ? cents : null;
}
const conditionLabels: Record<Scenario["fault"], string> = {
  none: "Standard processing",
  "lost-response": "Lost refund response",
  pending: "Pending refund",
  "readback-failure": "Unavailable payment readback",
};
function ScenarioFacts({ scenario }: { scenario: Scenario }) {
  return <dl className="scenarios-facts">
    <div><dt>Captured</dt><dd>{money(scenario.capturedCents)}</dd></div>
    <div><dt>Prior refunds</dt><dd>{money(scenario.priorRefundCents)}</dd></div>
    <div><dt>Requested</dt><dd>{money(scenario.requestedCents)}</dd></div>
  </dl>;
}

export default function Scenarios({ state, operationBusy = false, codexReady, refresh, onLocalUpdate, onError, onNotice, onApprove }: {
  state: AppState;
  operationBusy?: boolean;
  codexReady: boolean;
  refresh: (silent?: boolean) => Promise<AppState | undefined>;
  onLocalUpdate: (update: (current: AppState) => AppState) => void;
  onError: (e: string) => void;
  onNotice: (v: string) => void;
  onApprove: (id: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<ScenarioFilter>(() => new URLSearchParams(window.location.search).get("filter") === "archived" ? "archived" : "all");
  const [editing, setEditing] = useState<Scenario | null>(null);
  const [creating, setCreating] = useState(false);
  const [editorPolicyVersion, setEditorPolicyVersion] = useState(state.policy.version);
  const [amounts, setAmounts] = useState<Record<AmountField, string>>({ capturedCents: "100.00", priorRefundCents: "0.00", requestedCents: "10.00" });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const closeReview = () => {
    if (saving) return;
    setEditing(null);
    setModalError("");
  };
  const modalRef = useModalFocus(!!editing, closeReview);
  const active = activeScenarios(state);
  const archivedCount = state.scenarios.length - active.length;
  const availableSlots = Math.max(0, MAX_ACTIVE_SCENARIOS - active.length);
  const pending = active.filter((scenario) => !scenario.approved).length;
  const approved = active.length - pending;
  const editingArchived = !!editing && isScenarioArchived(state, editing.id);
  const editorDisabled = saving || editingArchived;
  const query = search.trim().toLowerCase();
  const scenarios = state.scenarios.filter((scenario) =>
    (filter === "archived" ? isScenarioArchived(state, scenario.id) : !isScenarioArchived(state, scenario.id)) &&
    (filter === "all" || filter === "archived" || (filter === "approved" ? scenario.approved : !scenario.approved)) &&
    `${scenario.title} ${scenario.category} ${scenario.message}`.toLowerCase().includes(query),
  );
  const hasFilters = filter !== "all" || search.length > 0;
  const parsed = { capturedCents: parseUSD(amounts.capturedCents), priorRefundCents: parseUSD(amounts.priorRefundCents), requestedCents: parseUSD(amounts.requestedCents) };
  const amountsValid = parsed.capturedCents !== null && parsed.capturedCents > 0 && parsed.priorRefundCents !== null && parsed.priorRefundCents <= parsed.capturedCents && parsed.requestedCents !== null && parsed.requestedCents > 0;
  const expectedPreview = amountsValid && editing ? parsed.requestedCents! <= parsed.capturedCents! - parsed.priorRefundCents! && (editing.supervisorApproved || parsed.priorRefundCents! + parsed.requestedCents! <= state.policy.limitCents) ? "refund" : "escalate" : null;
  function updateEditing(patch: Partial<Scenario>) { if (editing) setEditing({ ...editing, ...patch, approved: false }); }
  function applySavedScenario(saved: Scenario) {
    onLocalUpdate(current => {
      const previous = current.scenarios.find(scenario => scenario.id === saved.id);
      const pair = previous?.generation?.pair;
      const scenarios = current.scenarios.map(scenario => {
        if (scenario.id === saved.id) return saved;
        if (pair && !saved.generation?.pair && scenario.id === pair.partnerId && scenario.generation?.pair?.id === pair.id) {
          return { ...scenario, generation: { ...scenario.generation, pair: undefined } };
        }
        return scenario;
      });
      return { ...current, scenarios: previous ? scenarios : [...scenarios, saved] };
    });
  }

  async function generate() {
    if (generating || availableSlots < 4) return;
    setGenerating(true);
    onError("");
    try {
      const response = await api<{ scenarios: Scenario[] }>("/api/scenarios/generate", { method: "POST", body: "{}" });
      onLocalUpdate(current => ({ ...current, scenarios: [...current.scenarios, ...response.scenarios.filter(scenario => !current.scenarios.some(existing => existing.id === scenario.id))] }));
      const next = await refresh(true);
      setSearch("");
      setFilter("review");
      if (next) onNotice(`${response.scenarios.length} scenarios drafted. Review the facts and expected action before approval.`);
      else onError(`${response.scenarios.length} scenarios were saved and are shown locally, but workspace refresh failed. Refresh before drafting more or running tests.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Scenarios could not be drafted. Please try again.");
    } finally { setGenerating(false); }
  }
  async function removeApproval(scenario: Scenario) {
    if (busyId) return;
    setBusyId(scenario.id);
    onError("");
    try {
      const saved = await api<Scenario>(`/api/scenarios/${encodeURIComponent(scenario.id)}`, { method: "PATCH", body: JSON.stringify({ approved: false }) });
      applySavedScenario(saved);
      const next = await refresh(true);
      if (next) onNotice("Approval removed. Review this scenario before including it in another test run.");
      else onError("Approval was removed and the saved change is shown locally, but workspace refresh failed. Refresh before running tests.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Approval could not be removed. Please try again.");
    } finally { setBusyId(null); }
  }
  async function changeArchive(scenario: Scenario, archived: boolean) {
    if (busyId || saving || (!archived && !availableSlots)) return;
    setBusyId(scenario.id);
    onError("");
    try {
      const response = await api<ScenarioArchiveResult>(`/api/scenarios/${encodeURIComponent(scenario.id)}/${archived ? "archive" : "restore"}`, { method: "POST", body: "{}" });
      onLocalUpdate(current => ({ ...current, archivedScenarioIds: response.archivedScenarioIds,
        scenarios: current.scenarios.map(item => item.id === response.scenario.id ? response.scenario : item),
      }));
      if (editing?.id === scenario.id) setEditing(null);
      if (!archived) { setFilter("review"); setSearch(""); }
      const next = await refresh(true);
      if (next) onNotice(archived ? "Scenario archived. Saved runs and paired cases are unchanged. Restore it from Archived whenever you need it." : "Scenario restored. Review and approve it before testing; its previous approval was removed.");
      else onError(`Scenario ${archived ? "archived" : "restored"} and shown locally, but workspace refresh failed. Refresh before taking another action.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The scenario could not be updated.";
      if (editing?.id === scenario.id) setModalError(message); else onError(message);
    } finally { setBusyId(null); }
  }
  function openReview(scenario: Scenario) {
    setModalError("");
    setCreating(false);
    setEditorPolicyVersion(state.policy.version);
    setAmounts({ capturedCents: (scenario.capturedCents / 100).toFixed(2), priorRefundCents: (scenario.priorRefundCents / 100).toFixed(2), requestedCents: (scenario.requestedCents / 100).toFixed(2) });
    setEditing({ ...scenario });
  }
  function openNew() {
    if (!availableSlots) return;
    openReview({ id: "", title: "", category: "Merchant case", message: "", capturedCents: 10000, priorRefundCents: 0, requestedCents: 1000, supervisorApproved: false, expectedAction: "refund", fault: "none", source: "manual", approved: false });
    setCreating(true);
  }
  async function save() {
    if (!editing || saving || editingArchived || !amountsValid || !expectedPreview) return;
    setSaving(true);
    setModalError("");
    try {
      const saved = await api<Scenario>(creating ? "/api/scenarios" : `/api/scenarios/${encodeURIComponent(editing.id)}`, {
        method: creating ? "POST" : "PATCH",
        body: JSON.stringify({ title: editing.title, category: editing.category, message: editing.message, ...parsed, supervisorApproved: editing.supervisorApproved, fault: editing.fault, approved: editing.approved, policyVersion: editorPolicyVersion, ...(!creating ? { expectedAction: expectedPreview } : {}) }),
      });
      applySavedScenario(saved);
      const next = await refresh(true);
      if (saved.approved) onApprove(saved.id);
      setEditing(null);
      setSearch(""); setFilter(saved.approved ? "all" : "review");
      if (next) onNotice(saved.approved ? "Scenario saved and approved for testing." : "Scenario saved. It still needs approval before testing.");
      else onError("Scenario saved and shown locally, but workspace refresh failed. Do not create it again; refresh before running tests.");
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The scenario could not be saved. Please try again.");
    } finally { setSaving(false); }
  }

  return <div className="scenarios-page">
    <div className="page-heading scenarios-heading">
      <div><div className="eyebrow">YOUR TEST LIBRARY</div><h1>Scenarios</h1><p>Define the requests, check the facts, and approve what your agent should do.</p></div>
      <div className="scenarios-heading-actions"><button className="button secondary" onClick={openNew} disabled={!availableSlots} aria-describedby="scenarios-capacity"><Plus size={17} />New scenario</button><button className="button primary" disabled={operationBusy || generating || !codexReady || availableSlots < 4} onClick={() => void generate()} aria-describedby={!codexReady ? "scenarios-codex-note scenarios-capacity" : "scenarios-capacity"}>
        <BusyIcon busy={generating}><Sparkles size={17} /></BusyIcon>{generating ? "Drafting scenarios…" : "Draft with Codex"}
      </button></div>
    </div>
    {!codexReady && <div className="scenarios-connection-note" id="scenarios-codex-note"><Terminal size={18} aria-hidden="true" /><p>Create your own scenarios now, or connect Codex to draft more.</p><a href="/app?view=connections">Set up Codex <ArrowRight size={16} /></a></div>}
    {generating && <div className="running-strip" role="status"><LoaderCircle size={18} className="spin" /><span>Drafting scenarios against your current policy. Every draft starts unapproved.</span></div>}
    <div className={`scenarios-capacity ${availableSlots < 4 ? "is-near-limit" : ""}`} id="scenarios-capacity"><div><strong>{active.length} / {MAX_ACTIVE_SCENARIOS} active scenarios</strong><span>{availableSlots} {availableSlots === 1 ? "slot" : "slots"} available. {availableSlots < 4 ? "Archive cases to make room; Codex drafts need 4 slots." : "Archived cases keep their saved evidence and can be restored for review."}</span></div>{archivedCount > 0 && <button onClick={() => { setFilter("archived"); setSearch(""); }}><Archive size={15} />View {archivedCount} archived</button>}</div>
    <div className="scenarios-overview" aria-label="Scenario summary">
      <div className="scenarios-metric"><span className="scenarios-metric-icon"><Layers3 size={19} /></span><div><strong>{active.length}</strong><span>Active scenarios</span></div></div>
      <div className="scenarios-metric"><span className="scenarios-metric-icon is-approved"><CheckCircle2 size={19} /></span><div><strong>{approved}</strong><span>Approved for testing</span></div></div>
      <div className="scenarios-metric"><span className={`scenarios-metric-icon ${pending ? "is-pending" : ""}`}><FileCheck2 size={19} /></span><div><strong>{pending}</strong><span>Awaiting review</span></div></div>
    </div>
    <section className="panel scenarios-library" aria-label="Scenario library">
      <div className="scenarios-library-header">
        <div className="scenarios-filters" role="group" aria-label="Filter by approval">
          {([ ["all", "Active", active.length], ["approved", "Approved", approved], ["review", "Needs review", pending], ["archived", "Archived", archivedCount] ] as const).map(([value, label, count]) => <button key={value} className={filter === value ? "is-selected" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{count}</span></button>)}
        </div>
        <label className="scenarios-search"><Search size={18} aria-hidden="true" /><input aria-label="Search scenarios" type="search" placeholder="Search scenarios…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <div className="scenarios-library-caption"><span aria-live="polite" aria-atomic="true">{scenarios.length} {scenarios.length === 1 ? "scenario" : "scenarios"}{query ? ` matching “${search.trim()}”` : filter === "review" ? " to review" : filter === "approved" ? " approved" : filter === "archived" ? " archived" : " active in your library"}</span><span><ShieldCheck size={14} /> Only active, approved scenarios can run</span></div>
      <div className="scenarios-list">
        {scenarios.map((scenario) => {
          const archived = isScenarioArchived(state, scenario.id);
          const partner = scenario.generation?.pair ? state.scenarios.find(item => item.id === scenario.generation!.pair!.partnerId) : undefined;
          const partnerArchived = !!partner && isScenarioArchived(state, partner.id);
          return <article className={`scenarios-row ${archived ? "is-archived" : ""}`} key={scenario.id} id={`scenario-${scenario.id}`}>
          <div className="scenarios-row-content">
            <div className="scenarios-row-labels"><span className="scenarios-category">{scenario.category}</span><span className="scenarios-origin">{scenario.source === "codex" ? <Sparkles size={13} /> : <FileCheck2 size={13} />}{scenario.source === "codex" ? "AI generated" : scenario.source === "manual" ? "Merchant authored" : "Curated"}</span></div>
            <h2>{scenario.title}</h2><p className="scenarios-message">“{scenario.message}”</p>
            <div className="scenarios-row-context">{scenario.supervisorApproved && <span><ShieldCheck size={14} /> Supervisor approved</span>}{scenario.fault !== "none" && <span><CircleAlert size={14} /> {conditionLabels[scenario.fault]}</span>}</div>
            {scenario.generation?.pair && <div className="scenarios-pair-note"><span>Matched pair · {scenario.generation.pair.changedField === "supervisorApproved" ? "supervisor approval" : amountLabels[scenario.generation.pair.changedField].toLowerCase()} changes{partnerArchived ? " · Partner archived" : ""}</span>{partner && <button onClick={() => openReview(partner)}>{partnerArchived ? "View archived partner" : "Review paired case"} <ArrowRight size={13} /></button>}</div>}
          </div>
          <div className="scenarios-row-details">
            <ScenarioFacts scenario={scenario} />
            <div className="scenarios-expectation"><span>Expected action</span><strong>{scenario.expectedAction === "refund" ? "Issue refund" : "Escalate for approval"}</strong></div>
            <div className="scenarios-row-actions"><Status value={archived ? "archived" : scenario.approved ? "approved" : "review"}>{archived ? "Archived" : scenario.approved ? "Approved" : "Needs review"}</Status><button className={`button ${archived || scenario.approved ? "secondary" : "primary"} small`} disabled={operationBusy || !!busyId} onClick={() => openReview(scenario)} aria-label={`${archived ? "View" : "Review"} ${scenario.title}`}>{archived ? "View case" : "Review"} <ArrowRight size={15} /></button>{!archived && scenario.approved && <button className="scenarios-remove-approval" disabled={operationBusy || !!busyId} onClick={() => void removeApproval(scenario)} title={busyId === scenario.id ? "Removing approval…" : "Remove approval"} aria-label={busyId === scenario.id ? `Removing approval for ${scenario.title}` : `Remove approval for ${scenario.title}`}><BusyIcon busy={busyId === scenario.id}><X size={16} /></BusyIcon></button>}</div>
            <div className="scenarios-lifecycle"><button disabled={operationBusy || !!busyId || (archived && !availableSlots)} onClick={() => void changeArchive(scenario, !archived)} aria-label={`${archived ? "Restore" : "Archive"} ${scenario.title}`} aria-describedby={archived && !availableSlots ? "scenarios-capacity" : undefined}><BusyIcon busy={busyId === scenario.id}>{archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</BusyIcon>{archived ? "Restore for review" : "Archive case"}</button>{archived && !availableSlots && <small>Archive an active case to make room.</small>}</div>
          </div>
        </article>; })}
      </div>
      {!scenarios.length && <div className="scenarios-empty"><Empty icon={<Layers3 size={26} />} title={query ? "No matching scenarios" : filter === "archived" ? "No archived scenarios" : filter === "review" ? "Your review queue is clear" : filter === "approved" ? "No approved scenarios yet" : "Your active library is empty"}>
        {query ? "Try a different title, category, or customer request." : filter === "archived" ? "Archive cases you no longer need in your active library. Saved runs stay available, and every case can be restored." : filter === "review" ? "New drafts and restored cases appear here for your review." : filter === "approved" ? "Review a scenario and approve its expected action to make it available for testing." : "Create a scenario, draft a pair with Codex, or restore an archived case."}
      </Empty>{hasFilters && <button className="button secondary" onClick={() => { setSearch(""); setFilter("all"); }}>Show active scenarios</button>}</div>}
    </section>
    {editing && <div className="modal-backdrop" onClick={closeReview}>
      <section ref={modalRef} className="modal scenarios-review" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="scenarios-review-title" aria-describedby="scenarios-review-description" aria-busy={saving} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header scenarios-review-header"><div><div className="eyebrow">{editingArchived ? "ARCHIVED CASE" : creating ? "YOUR MERCHANT CASE" : "SCENARIO REVIEW"}</div><h2 id="scenarios-review-title">{editingArchived ? "Archived scenario" : creating ? "New scenario" : "Review scenario"}</h2><p id="scenarios-review-description">{editingArchived ? "This case is kept for reference. Restore it, then review and approve it before testing." : "Set the payment facts. The expected action is calculated from your current policy."}</p></div><button className="icon-button" disabled={saving} onClick={closeReview} aria-label="Close scenario review"><X size={21} /></button></div>
        <div className="scenarios-review-body">
          <div className="scenarios-title-fields"><label className="form-field">Scenario title<input maxLength={200} disabled={editorDisabled} value={editing.title} placeholder="A repeat refund request" onChange={(event) => updateEditing({ title: event.target.value })} /></label><label className="form-field">Category<input maxLength={80} disabled={editorDisabled} value={editing.category} onChange={(event) => updateEditing({ category: event.target.value })} /></label></div>
          <label className="form-field scenarios-request-field">Customer request<textarea rows={3} maxLength={4000} disabled={editorDisabled} value={editing.message} placeholder="Write the exact request your agent should receive…" onChange={(event) => updateEditing({ message: event.target.value })} /><span className="scenarios-field-hint">Customer wording is untrusted. The payment facts below are authoritative.</span></label>
          <div className="scenarios-review-context"><div className="scenarios-review-context-heading"><h3>Payment facts</h3><span>USD · up to $1,000.00</span></div>
            <div className="scenarios-money-fields">{(Object.keys(amountLabels) as AmountField[]).map((field) => <label className="form-field" key={field}>{amountLabels[field]}<input type="text" inputMode="decimal" autoComplete="off" maxLength={7} disabled={editorDisabled} value={amounts[field]} aria-invalid={parseUSD(amounts[field]) === null || (field !== "priorRefundCents" && parseUSD(amounts[field]) === 0)} onChange={(event) => { setAmounts({ ...amounts, [field]: event.target.value }); updateEditing({}); }} /></label>)}</div>
            <p className="scenarios-field-hint">Use dollars with up to two decimal places. Prior refunds cannot exceed the captured payment.</p>
            <label className="scenarios-supervisor"><input type="checkbox" checked={editing.supervisorApproved} disabled={editorDisabled} onChange={(event) => updateEditing({ supervisorApproved: event.target.checked })} /><span>Supervisor approval is present<span className="scenarios-field-hint">Bypasses the courtesy limit, never the remaining payment balance.</span></span></label>
            <label className="form-field scenarios-condition-field">Payment condition<select disabled={editorDisabled} value={editing.fault} onChange={(event) => updateEditing({ fault: event.target.value as Scenario["fault"] })}>{Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="scenarios-field-hint">Pending and unavailable readback conditions run in the simulator only.</span></label>
            <dl className="scenarios-review-conditions"><div><dt>Courtesy refund limit</dt><dd>{money(state.policy.limitCents)}</dd></div><div><dt>Expected action</dt><dd aria-live="polite">{expectedPreview === "refund" ? "Issue refund" : expectedPreview === "escalate" ? "Escalate for approval" : "Check the payment amounts"}</dd></div></dl>
          </div>
          {!amountsValid && <p className="scenarios-amount-error" role="status">Enter a positive capture and request, and prior refunds between $0 and the captured amount.</p>}
          {!editingArchived && <label className={`scenarios-approval ${editing.approved ? "is-checked" : ""}`}><input type="checkbox" checked={editing.approved} disabled={saving} onChange={(event) => setEditing({ ...editing, approved: event.target.checked })} /><span><strong>I approve this scenario for testing</strong><small>I have reviewed the request, financial facts, and expected action.</small></span></label>}
          {modalError && <div className="alert scenarios-review-error" role="alert"><CircleAlert size={18} /><span>{modalError}</span></div>}
        </div>
        <div className="modal-actions scenarios-review-actions"><button className="button secondary" disabled={saving} onClick={closeReview}>{editingArchived ? "Close" : "Cancel"}</button>{editingArchived ? <button className="button primary" disabled={operationBusy || !!busyId || !availableSlots} onClick={() => void changeArchive(editing, false)} aria-describedby="scenarios-capacity"><BusyIcon busy={busyId === editing.id}><ArchiveRestore size={16} /></BusyIcon>Restore for review</button> : <button className="button primary" disabled={operationBusy || saving || !amountsValid || !editing.title.trim() || !editing.category.trim() || !editing.message.trim()} onClick={() => void save()}><BusyIcon busy={saving}><Check size={16} /></BusyIcon>{saving ? "Saving…" : creating ? editing.approved ? "Create & approve" : "Create for review" : editing.approved ? "Save approved scenario" : "Save for review"}</button>}</div>
      </section>
    </div>}
  </div>;
}
