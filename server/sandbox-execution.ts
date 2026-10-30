import { randomUUID } from 'node:crypto';
import type { AppState, CaseResult, Decision, Policy, RefundGateway, Run, Scenario, TraceEvent } from '../shared/types.ts';
import { expectedActionFor, makeRun } from './engine.ts';
import { Store } from './store.ts';

/** An unfinished reservation never asserts zero money or a successful provider call. */
export function unfinishedSandboxCase(scenario: Scenario, decision: Decision, policy: Policy): CaseResult {
  const detail = 'No complete result has been saved for this case. Execution may still be running or may have been interrupted. Inspect its saved timeline and known provider IDs before any further payment action.';
  return {
    id: randomUUID(), scenario: structuredClone(scenario), decision: structuredClone(decision), expectedAction: expectedActionFor(scenario, policy),
    verdict: 'inconclusive', checks: [{ name: 'Execution completion', status: 'unknown', detail }],
    events: [{ at: new Date().toISOString(), kind: 'execution-reserved', title: 'Sandbox evaluation reserved', detail: 'Saved before provider execution. No completed payment outcome is established.' }],
    refunds: [], attemptedCents: 0, observedRefundCents: 0, totalRefundCents: 0, excessCents: 0, evidenceComplete: false, durationMs: 0,
  };
}

/** Durable progress for one batch. A failed checkpoint blocks every later provider call. */
export class SandboxExecution {
  private failed = false;
  private constructor(private store: Store, readonly runId: string) {}

  static async begin(store: Store, run: Run): Promise<SandboxExecution> {
    if (run.provider !== 'paypal' || run.origin || run.replay) throw new Error('Sandbox execution needs an original PayPal run.');
    const recorder = new SandboxExecution(store, run.id);
    await recorder.persist(state => { state.runs.unshift(structuredClone(run)); });
    return recorder;
  }

  private assertWritable() {
    if (this.failed) throw this.storageError();
  }

  private storageError() { return new Error(`Sandbox execution stopped because its progress could not be saved. Inspect run ${this.runId} and the sandbox journal before any further payment action.`); }

  private async persist<T>(update: (state: AppState) => T): Promise<T> {
    this.assertWritable();
    try { return await this.store.update(update); }
    catch { this.failed = true; throw this.storageError(); }
  }

  private savedRun(state: AppState): Run {
    const run = state.runs.find(run => run.id === this.runId);
    if (!run) throw new Error('The reserved Sandbox report was not found.');
    return run;
  }

  async reserveFixture(fixtureId: string, scenarioId: string) {
    await this.persist(state => {
      const result = this.savedRun(state).results.find(result => result.scenario.id === scenarioId);
      const fixture = state.fixtures.find(fixture => fixture.id === fixtureId);
      if (!result || !fixture || fixture.status !== 'CAPTURED' || fixture.setAsideAt) throw new Error('A fresh captured fixture is required.');
      fixture.status = 'USED';
      fixture.execution = { runId: this.runId, caseId: result.id, startedAt: new Date().toISOString() };
    });
  }

  private async event(scenarioId: string, kind: string, title: string, detail: string, data?: Record<string, unknown>) {
    const event: TraceEvent = { at: new Date().toISOString(), kind, title, detail, ...(data ? { data: structuredClone(data) } : {}) };
    await this.persist(state => {
      const result = this.savedRun(state).results.find(result => result.scenario.id === scenarioId);
      if (!result) throw new Error('The reserved Sandbox case was not found.');
      result.events.push(event);
    });
  }

  gateway(scenarioId: string, gateway: RefundGateway): RefundGateway {
    if (gateway.provider !== 'paypal') throw new Error('A Sandbox recorder cannot relabel simulator evidence.');
    return {
      ...gateway,
      ...(gateway.verifyOpening ? { verifyOpening: async () => {
        await this.event(scenarioId, 'capture-readback-start', 'Checking the saved capture', 'Read-only opening verification started.', { captureId: gateway.captureId });
        try {
          const opening = await gateway.verifyOpening!();
          await this.event(scenarioId, 'capture-readback', 'Opening verification returned', 'This is a bounded snapshot of the controlled fixture.', { ...opening });
          return opening;
        } catch (error) {
          await this.event(scenarioId, 'capture-readback-error', 'Opening verification unavailable', 'The current opening payment state was not confirmed.');
          throw error;
        }
      } } : {}),
      refund: async (amountCents, requestId) => {
        // This must commit before the payment-changing method is called.
        await this.event(scenarioId, 'attempt', 'Refund request saved before sending', 'The request identity is retained. Its payment outcome remains unconfirmed.', { amountCents, requestId, captureId: gateway.captureId });
        try {
          const response = await gateway.refund(amountCents, requestId);
          await this.event(scenarioId, 'tool-response', 'Provider response saved', 'A response is not an independent payment readback.', { ...response });
          return response;
        } catch (error) {
          await this.event(scenarioId, 'tool-error', 'Refund response unconfirmed', 'Inspect this request identity before considering another payment. No request was automatically repeated by the recovery recorder.', { requestId, captureId: gateway.captureId });
          throw error;
        }
      },
      readRefund: async id => {
        await this.event(scenarioId, 'readback-start', 'Refund readback started', 'Reading a known provider refund ID.', { refundId: id, captureId: gateway.captureId });
        try {
          const refund = await gateway.readRefund(id);
          await this.event(scenarioId, 'readback', 'Independent refund readback saved', `${refund.id}: ${refund.status}. The full case is not yet finalized.`, { ...refund });
          return refund;
        } catch (error) {
          await this.event(scenarioId, 'readback-error', 'Refund readback unavailable', 'This known refund could not be confirmed. Its payment state remains unconfirmed.', { refundId: id });
          throw error;
        }
      },
    };
  }

  async completeCase(scenarioId: string, result: CaseResult): Promise<void> {
    await this.persist(state => {
      const run = this.savedRun(state);
      const index = run.results.findIndex(item => item.scenario.id === scenarioId);
      if (index < 0) throw new Error('The reserved Sandbox case was not found.');
      const interrupted = result.checks.some(check => check.name === 'Runner completion' && check.status === 'unknown');
      // Keep the URL that was published when the fixture was reserved.
      // A runner exception cannot erase provider IDs saved before the exception.
      if (interrupted) {
        run.results[index].checks.push(...structuredClone(result.checks));
        run.results[index].events.push(...structuredClone(result.events));
      } else {
        run.results[index] = { ...structuredClone(result), id: run.results[index].id };
      }
      const summary = makeRun(run.policy, run.agent, run.provider, run.results);
      run.summary = summary.summary; run.status = summary.status;
      const fixture = state.fixtures.find(item => item.execution?.runId === run.id && item.execution.caseId === run.results[index].id);
      if (fixture?.execution && !interrupted) fixture.execution.recordedAt = new Date().toISOString();
    });
  }

  async snapshot(): Promise<Run> {
    this.assertWritable();
    return this.savedRun(await this.store.read());
  }
}
