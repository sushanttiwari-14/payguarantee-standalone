export type AgentKind = 'seeded' | 'corrected' | 'codex' | 'imported';
export type ProviderKind = 'simulator' | 'paypal';
export type Fault = 'none' | 'lost-response' | 'pending' | 'readback-failure';
export type Action = 'refund' | 'escalate';
export interface Policy { id: string; name: string; currency: 'USD'; limitCents: number; version: number }
export interface Scenario {
  id: string; title: string; category: string; message: string; capturedCents: number;
  priorRefundCents: number; requestedCents: number; supervisorApproved: boolean;
  expectedAction: Action; fault: Fault; source: 'curated' | 'codex' | 'manual'; approved: boolean;
  generation?: {
    threadId: string | null; model: string; createdAt: string; policyVersion: number;
    pair?: { id: string; partnerId: string; changedField: 'capturedCents' | 'priorRefundCents' | 'requestedCents' | 'supervisorApproved'; role: 'baseline' | 'variant' };
  };
}
export interface Decision { action: Action; amountCents: number; reason: string; customerMessage: string }
export interface AgentInputScenario {
  id: string; message: string; capturedCents: number; priorRefundCents: number;
  requestedCents: number; supervisorApproved: boolean; fault: Fault;
}
export interface AgentInput { schemaVersion: 1; inputDigest: string; policy: Policy; scenarios: AgentInputScenario[] }
/** Agent-facing view. The schema-1 input remains the private, reproducible harness fixture. */
export interface AgentRequest { schemaVersion: 2; inputDigest: string; policy: Policy; scenarios: Omit<AgentInputScenario, 'fault'>[] }
export interface ImportedAgent { name: string; version: string }
export interface DecisionBundle { schemaVersion: 1 | 2; inputDigest: string; agent: ImportedAgent; decisions: (Decision & { scenarioId: string })[] }
export interface RunProvenance { verifierVersion: string; agentVersion: string; inputDigest?: string }
export interface RefundRecord { id: string; captureId: string; requestId: string; amountCents: number; currency: string; status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'UNKNOWN'; source: ProviderKind; cumulativeRefundedCents?: number }
export interface TraceEvent { at: string; kind: string; title: string; detail: string; data?: Record<string, unknown> }
export interface Check { name: string; status: 'pass' | 'fail' | 'unknown'; detail: string }
export interface CaseResult {
  id: string; scenario: Scenario; decision: Decision; expectedAction: Action;
  verdict: 'pass' | 'fail' | 'inconclusive'; checks: Check[]; events: TraceEvent[];
  refunds: RefundRecord[]; attemptedCents: number; observedRefundCents: number;
  totalRefundCents: number; excessCents: number; evidenceComplete: boolean; durationMs: number;
  decisionValid?: false; submittedDecision?: unknown;
}
export interface Run {
  id: string; createdAt: string; policy: Policy; agent: AgentKind; provider: ProviderKind;
  status: 'passed' | 'failed' | 'inconclusive'; results: CaseResult[];
  summary: { total: number; passed: number; failed: number; inconclusive: number; excessCents: number; legitimateCompleted: number; legitimateTotal: number };
  ai?: { threadId: string | null; model: string; usage?: Record<string, number> };
  importedAgent?: ImportedAgent;
  provenance?: RunProvenance;
  origin?: { kind: 'imported-evidence'; sourceRunId: string; importedAt: string };
  replay?: {
    sourceRunId: string; sourceProvider: ProviderKind; sourceCreatedAt: string;
    sourceProvenance?: RunProvenance; sourceAI?: Run['ai'];
    sourceAgent?: AgentKind; sourceImportedAgent?: ImportedAgent;
    sourceOrigin?: Run['origin']; sourceReplay?: Run['replay'];
    inputIntegrity?: 'verified' | 'unverified-legacy';
    decisions: 'reused' | 'replaced'; replacementAgent?: 'seeded' | 'corrected';
  };
}
export interface RefundGateway {
  provider: ProviderKind; captureId: string;
  verifyOpening?(): Promise<{ captureId: string; capturedCents: number; refundedCents: number; captureStatus: string; basis: 'capture-status' | 'refund-cumulative' }>;
  refund(amountCents: number, requestId: string): Promise<RefundRecord>;
  readRefund(id: string): Promise<RefundRecord>;
  openingRefunds: RefundRecord[];
}
export interface Fixture {
  id: string; scenarioId: string; orderId: string; approvalUrl: string;
  /** Local visibility/eligibility choice; never cancellation or a provider outcome. */
  setAsideAt?: string;
  status: 'CREATED' | 'CAPTURED' | 'USED' | 'UNKNOWN'; captureId?: string; createdAt: string;
  openingRefunds: RefundRecord[]; scenario: Scenario;
  captureRequestId: string; seedRequestId: string;
  createRequestId?: string; seedRefundId?: string;
  /** Stable evidence link saved atomically when a captured fixture is consumed. */
  execution?: { runId: string; caseId: string; startedAt: string; recordedAt?: string };
  preparation?: {
    step: 'order' | 'capture' | 'opening-refund';
    state: 'prepared' | 'pending' | 'unknown' | 'failed';
    attemptedAt?: string; checkedAt?: string; detail?: string; replayBlocked?: boolean;
    returnUrl?: string; cancelUrl?: string;
  };
}
export interface ProofAIRequest {
  id: string; operationId: string; baselineId: string; refusalId: string; candidateId: string;
  status: 'running' | 'completed' | 'failed'; startedAt: string; finishedAt?: string; runId?: string; error?: string;
}
export interface AppState { policy: Policy; scenarios: Scenario[]; runs: Run[]; fixtures: Fixture[]; archivedScenarioIds?: string[]; proofAIRequests?: ProofAIRequest[] }
export interface ScenarioArchiveResult { scenario: Scenario; archivedScenarioIds: string[] }
export interface IntegrationStatus { codex: { available: boolean; authenticated: boolean; detail: string }; paypal: { configured: boolean; environment: 'sandbox'; detail: string } }
