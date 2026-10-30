import { randomUUID } from 'node:crypto';
import type { Fixture, RefundGateway, RefundRecord, Scenario } from '../shared/types.ts';

// Deliberately not configurable: this application must never call PayPal Live.
const SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const REQUEST_TIMEOUT_MS = 20_000;
// A deliberately shorter local replay window than Orders v2's documented six hours.
// Known provider IDs can still be read after this window; missing IDs require inspection.
const PREPARATION_RETRY_WINDOW_MS = 60 * 60 * 1000;
export type FixtureCheckpoint = (fixture: Fixture) => Promise<void>;
const noCheckpoint: FixtureCheckpoint = async () => {};
type Json = Record<string, unknown>;
type Credentials = { clientId: string; clientSecret: string };
type AdapterOptions = {
  fetch?: typeof fetch;
  credentials?: () => Credentials | undefined;
  now?: () => number;
  id?: () => string;
};

class SandboxError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = 'PayPalSandboxError';
  }
}

class PreparationPending extends SandboxError {}

class FixturePreparation {
  current: Fixture;
  private storageFailed = false;
  constructor(fixture: Fixture, private checkpoint: FixtureCheckpoint, private now: () => number) {
    this.current = structuredClone(fixture);
  }
  async save(patch: Partial<Fixture>): Promise<void> {
    const next = { ...this.current, ...patch };
    try { await this.checkpoint(structuredClone(next)); }
    catch {
      this.storageFailed = true;
      throw new SandboxError('Fixture checkpoint could not be saved. Preparation stopped; refresh and resume the saved fixture.');
    }
    this.current = next;
  }
  async phase(step: NonNullable<Fixture['preparation']>['step'], state: NonNullable<Fixture['preparation']>['state'], detail: string, starting = false): Promise<void> {
    const previous = this.current.preparation;
    const attemptedAt = previous?.step === step ? previous.attemptedAt : undefined;
    await this.save({ status: 'UNKNOWN', preparation: {
      ...previous, step, state, detail, checkedAt: new Date(this.now()).toISOString(),
      attemptedAt: attemptedAt ?? (starting ? new Date(this.now()).toISOString() : undefined),
    } });
  }
  async beforePost(step: NonNullable<Fixture['preparation']>['step']): Promise<void> {
    const attemptedAt = this.current.preparation?.step === step ? this.current.preparation.attemptedAt : undefined;
    // Legacy UNKNOWN fixtures cannot prove when the ambiguous operation began.
    if (this.current.preparation?.replayBlocked || (!attemptedAt && this.current.status === 'UNKNOWN' && !this.current.preparation)
      || (attemptedAt && (!Number.isFinite(Date.parse(attemptedAt)) || this.now() - Date.parse(attemptedAt) >= PREPARATION_RETRY_WINDOW_MS
        || Date.parse(attemptedAt) > this.now()))) {
      throw new SandboxError('Automatic replay is unavailable for this older unconfirmed operation. Inspect its saved request ID in PayPal Sandbox before preparing another payment.');
    }
    await this.phase(step, 'unknown', 'Request started. Its outcome is unconfirmed until PayPal responds.', true);
  }
  async failed(error: unknown): Promise<never> {
    if (!this.storageFailed) {
      const state = error instanceof PreparationPending ? 'pending'
        : error instanceof SandboxError && error.status !== undefined && error.status >= 400 && error.status < 500 ? 'failed' : 'unknown';
      await this.phase(this.current.preparation?.step ?? 'capture', state,
        error instanceof SandboxError ? error.message : 'Preparation could not be confirmed. Resume this same saved fixture.');
    }
    throw error;
  }
}

function environmentCredentials(): Credentials | undefined {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

export function paypalConfigured(): boolean {
  return Boolean(environmentCredentials());
}

function object(value: unknown, label: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SandboxError(`PayPal Sandbox returned an invalid ${label}. Outcome is unconfirmed.`);
  }
  return value as Json;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new SandboxError(`Invalid ${label}.`);
  }
  return value;
}

function requestIdentifier(value: string): string {
  // UUIDs fit PayPal's documented 38-byte request-id recommendation.
  if (!/^[A-Za-z0-9_-]{1,38}$/.test(value)) throw new SandboxError('Invalid PayPal request ID.');
  return value;
}

function cents(value: number, label: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new SandboxError(`${label} must be ${allowZero ? 'non-negative' : 'positive'} integer USD cents.`);
  }
  return value;
}

function usd(value: number): string {
  cents(value, 'Amount');
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

function money(value: unknown): number {
  const amount = object(value, 'money amount');
  if (amount.currency_code !== 'USD') throw new SandboxError('PayPal Sandbox currency mismatch: expected USD.');
  if (typeof amount.value !== 'string' || !/^\d{1,14}(?:\.\d{1,2})?$/.test(amount.value)) {
    throw new SandboxError('PayPal Sandbox amount is not exact USD cents.');
  }
  const [whole, fraction = ''] = amount.value.split('.');
  const valueInCents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (valueInCents > BigInt(Number.MAX_SAFE_INTEGER)) throw new SandboxError('PayPal Sandbox amount exceeds the supported range.');
  return Number(valueInCents);
}

function validateScenario(scenario: Scenario): void {
  identifier(scenario.id, 'scenario ID');
  cents(scenario.capturedCents, 'Capture');
  cents(scenario.priorRefundCents, 'Opening refund', true);
  cents(scenario.requestedCents, 'Requested refund', true);
  if (scenario.priorRefundCents > scenario.capturedCents) {
    throw new SandboxError('Opening refunds cannot exceed the captured amount.');
  }
}

function callbackUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new SandboxError('Invalid checkout return URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new SandboxError('Checkout return URLs must be HTTP(S) URLs without credentials.');
  }
  return url.href;
}

function approvalLink(order: Json): string {
  const links = Array.isArray(order.links) ? order.links : [];
  const link = links.map((entry) => object(entry, 'order link'))
    .find((entry) => entry.rel === 'payer-action' || entry.rel === 'approve');
  if (typeof link?.href !== 'string') throw new SandboxError('PayPal Sandbox did not provide a buyer approval URL.');
  let url: URL;
  try { url = new URL(link.href); } catch { throw new SandboxError('PayPal Sandbox returned an invalid approval URL.'); }
  if (url.protocol !== 'https:' || !['www.sandbox.paypal.com', 'sandbox.paypal.com'].includes(url.hostname)
    || url.username || url.password || url.port) {
    throw new SandboxError('Refusing an approval URL outside PayPal Sandbox.');
  }
  return url.href;
}

function captureFromOrder(order: Json, expectedOrderId: string): string {
  if (order.id !== expectedOrderId) throw new SandboxError('PayPal Sandbox order ID mismatch.');
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  const captures = units.flatMap((unit) => {
    const payments = object(object(unit, 'purchase unit').payments, 'order payments');
    return Array.isArray(payments.captures) ? payments.captures : [];
  });
  if (captures.length !== 1) throw new SandboxError('Expected exactly one sandbox capture. Approve the order before capturing it.');
  return identifier(object(captures[0], 'capture').id, 'capture ID');
}

function refundRecord(body: Json, captureId: string, requestId: string, expectedId?: string, capturedCents?: number): RefundRecord {
  const id = identifier(body.id, 'refund ID');
  if (expectedId && id !== expectedId) throw new SandboxError('PayPal Sandbox refund ID mismatch.');
  const amountCents = money(body.amount);
  cents(amountCents, 'Refund');
  if (!['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED'].includes(String(body.status))) {
    throw new SandboxError('PayPal Sandbox refund status is missing or unrecognized. Outcome is unconfirmed.');
  }
  // Link metadata is checked, never followed. All API URLs are built from the fixed sandbox origin.
  for (const entry of Array.isArray(body.links) ? body.links : []) {
    const link = object(entry, 'refund link');
    if (link.rel === 'up' && typeof link.href === 'string') {
      let url: URL;
      try { url = new URL(link.href); } catch { throw new SandboxError('Invalid refund capture link.'); }
      if (url.pathname !== `/v2/payments/captures/${captureId}`) {
        throw new SandboxError('PayPal Sandbox refund belongs to a different capture.');
      }
    }
  }
  let cumulativeRefundedCents: number | undefined;
  if (body.seller_payable_breakdown !== undefined) {
    const breakdown = object(body.seller_payable_breakdown, 'refund breakdown');
    if (breakdown.total_refunded_amount !== undefined) {
      cumulativeRefundedCents = money(breakdown.total_refunded_amount);
      if (body.status === 'COMPLETED' && cumulativeRefundedCents < amountCents) {
        throw new SandboxError('PayPal Sandbox cumulative refund total is below the completed refund amount. Outcome is unconfirmed.');
      }
      if (capturedCents !== undefined && cumulativeRefundedCents > capturedCents) {
        throw new SandboxError('PayPal Sandbox cumulative refund total exceeds the original capture. Outcome is unconfirmed.');
      }
    }
  }
  return {
    id, captureId, requestId, amountCents, currency: 'USD',
    status: body.status === 'CANCELLED' ? 'FAILED' : body.status as RefundRecord['status'], source: 'paypal',
    ...(cumulativeRefundedCents === undefined ? {} : { cumulativeRefundedCents }),
  };
}

/** Only its fetch/clock/ID/credential dependencies are injectable; the payment origin is not. */
export class PayPalSandboxAdapter {
  private readonly fetcher: typeof fetch;
  private readonly credentials: () => Credentials | undefined;
  private readonly now: () => number;
  private readonly id: () => string;
  private token?: { value: string; expiresAt: number; key: string };
  private tokenInFlight?: { key: string; promise: Promise<string> };

  constructor(options: AdapterOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.credentials = options.credentials ?? environmentCredentials;
    this.now = options.now ?? Date.now;
    this.id = options.id ?? randomUUID;
  }

  private async accessToken(): Promise<string> {
    const credentials = this.credentials();
    if (!credentials?.clientId || !credentials.clientSecret) {
      throw new SandboxError('PayPal Sandbox is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the local server.');
    }
    const key = `${credentials.clientId}\0${credentials.clientSecret}`;
    if (this.token?.key === key && this.token.expiresAt > this.now()) return this.token.value;
    if (this.tokenInFlight?.key === key) return this.tokenInFlight.promise;
    const promise = (async () => {
      let response: Response;
      try {
        response = await this.fetcher(`${SANDBOX_API}/v1/oauth2/token`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
          },
          body: 'grant_type=client_credentials',
        });
      } catch {
        throw new SandboxError('Unable to connect to PayPal Sandbox for authentication.');
      }
      if (!response.ok) throw new SandboxError(`PayPal Sandbox authentication failed (HTTP ${response.status}). Check the sandbox app credentials.`, response.status);
      let body: Json;
      try { body = object(await response.json(), 'OAuth response'); }
      catch { throw new SandboxError('PayPal Sandbox returned an invalid authentication response.'); }
      if (typeof body.access_token !== 'string' || !body.access_token || typeof body.expires_in !== 'number'
        || !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
        throw new SandboxError('PayPal Sandbox returned an invalid authentication response.');
      }
      this.token = {
        value: body.access_token, key,
        expiresAt: this.now() + Math.max(0, body.expires_in - 30) * 1000,
      };
      return body.access_token;
    })();
    this.tokenInFlight = { key, promise };
    try { return await promise; }
    finally { if (this.tokenInFlight?.promise === promise) this.tokenInFlight = undefined; }
  }

  private async request(method: 'GET' | 'POST', path: string, body?: Json, requestId?: string): Promise<Json> {
    const token = await this.accessToken();
    let response: Response;
    try {
      response = await this.fetcher(`${SANDBOX_API}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
          Prefer: 'return=representation', ...(requestId ? { 'PayPal-Request-Id': requestIdentifier(requestId) } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SandboxError('PayPal Sandbox request could not be confirmed. Retry the same fixture or operation with its existing request ID.');
    }
    let result: Json;
    try { result = object(await response.json(), 'API response'); }
    catch { throw new SandboxError('PayPal Sandbox returned an unreadable response. Outcome is unconfirmed; reuse the existing request ID.', response.status); }
    if (!response.ok) {
      if (response.status === 401) this.token = undefined;
      // Never expose PayPal descriptions, customer records, credential material, or raw bodies.
      const details = Array.isArray(result.details) ? result.details : [];
      const first = details[0] && typeof details[0] === 'object' ? details[0] as Json : undefined;
      const candidate = first?.issue ?? result.name;
      const code = typeof candidate === 'string' && /^[A-Z0-9_]{1,80}$/.test(candidate) ? candidate : undefined;
      throw new SandboxError(`PayPal Sandbox request failed (HTTP ${response.status}${code ? `, ${code}` : ''}).`, response.status, code);
    }
    return result;
  }

  /** Allocate once and persist this draft before any provider call. */
  prepareFixture(scenario: Scenario, returnUrl: string, cancelUrl: string, fixtureId?: string): Fixture {
    validateScenario(scenario);
    const id = requestIdentifier(fixtureId ?? this.id());
    return {
      id, scenarioId: scenario.id, orderId: '', approvalUrl: '', status: 'UNKNOWN',
      createdAt: new Date(this.now()).toISOString(), openingRefunds: [], scenario: structuredClone(scenario),
      createRequestId: id, captureRequestId: requestIdentifier(this.id()), seedRequestId: requestIdentifier(this.id()),
      preparation: { step: 'order', state: 'prepared', returnUrl: callbackUrl(returnUrl), cancelUrl: callbackUrl(cancelUrl) },
    };
  }

  /** Compatibility helper. Durable callers must save prepareFixture() and use createPreparedFixture(). */
  async createFixture(scenario: Scenario, returnUrl: string, cancelUrl: string): Promise<Fixture> {
    return this.createPreparedFixture(this.prepareFixture(scenario, returnUrl, cancelUrl), noCheckpoint);
  }

  async createPreparedFixture(fixture: Fixture, checkpoint: FixtureCheckpoint): Promise<Fixture> {
    if (fixture.status === 'USED') throw new SandboxError('This sandbox fixture was already used. Create and approve a fresh fixture.');
    if (fixture.status === 'CAPTURED' || fixture.status === 'CREATED') return structuredClone(fixture);
    validateScenario(fixture.scenario);
    const progress = new FixturePreparation(fixture, checkpoint, this.now);
    try {
      let order: Json;
      if (fixture.orderId) {
        // An order ID received before approval-link parsing failed is still useful evidence.
        order = await this.request('GET', `/v2/checkout/orders/${identifier(fixture.orderId, 'order ID')}`);
        if (order.id !== fixture.orderId) throw new SandboxError('PayPal Sandbox order ID mismatch.');
      } else {
        const returnUrl = callbackUrl(fixture.preparation?.returnUrl ?? '');
        const cancelUrl = callbackUrl(fixture.preparation?.cancelUrl ?? '');
        await progress.beforePost('order');
        order = await this.request('POST', '/v2/checkout/orders', {
          intent: 'CAPTURE',
          purchase_units: [{ reference_id: 'payproof', custom_id: fixture.id, amount: { currency_code: 'USD', value: usd(fixture.scenario.capturedCents) } }],
          payment_source: { paypal: { experience_context: {
            brand_name: 'PayProof Sandbox', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
            return_url: returnUrl, cancel_url: cancelUrl,
          } } },
        }, requestIdentifier(fixture.createRequestId ?? fixture.id));
        await progress.save({ orderId: identifier(order.id, 'order ID') });
      }
      await progress.save({ approvalUrl: approvalLink(order), status: 'CREATED', preparation: undefined });
      return progress.current;
    } catch (error) { return progress.failed(error); }
  }

  /** Explicit resume never captures a newly created order; buyer approval stays a separate action. */
  async resumeFixture(fixture: Fixture, checkpoint: FixtureCheckpoint): Promise<Fixture> {
    if (fixture.status === 'USED') throw new SandboxError('This sandbox fixture was already used. Create and approve a fresh fixture.');
    if (fixture.status === 'CAPTURED' || fixture.status === 'CREATED') return structuredClone(fixture);
    if (!fixture.orderId || fixture.preparation?.step === 'order') return this.createPreparedFixture(fixture, checkpoint);
    return this.captureFixture(fixture, checkpoint);
  }

  async captureFixture(fixture: Fixture, checkpoint: FixtureCheckpoint = noCheckpoint): Promise<Fixture> {
    if (fixture.status === 'USED') throw new SandboxError('This sandbox fixture was already used. Create and approve a fresh fixture.');
    validateScenario(fixture.scenario);
    const orderId = identifier(fixture.orderId, 'order ID');
    requestIdentifier(fixture.captureRequestId);
    requestIdentifier(fixture.seedRequestId);
    const progress = new FixturePreparation(fixture, checkpoint, this.now);
    try {
      if (fixture.status === 'UNKNOWN' && !fixture.preparation) {
        await progress.save({ preparation: { step: 'capture', state: 'unknown', replayBlocked: true } });
      }
      let captureId = fixture.captureId ? identifier(fixture.captureId, 'capture ID') : undefined;
      if (!captureId) {
        // On an explicit resume, read the existing order before considering the same POST again.
        if (fixture.status === 'UNKNOWN' || fixture.preparation?.step === 'capture') {
          const knownOrder = await this.request('GET', `/v2/checkout/orders/${orderId}`);
          if (knownOrder.id !== orderId) throw new SandboxError('PayPal Sandbox order ID mismatch.');
          const units = Array.isArray(knownOrder.purchase_units) ? knownOrder.purchase_units : [];
          const hasCaptures = units.some(unit => {
            const payments = object(unit, 'purchase unit').payments;
            return payments && typeof payments === 'object' && Array.isArray((payments as Json).captures) && ((payments as Json).captures as unknown[]).length > 0;
          });
          if (hasCaptures) captureId = captureFromOrder(knownOrder, orderId);
          else if (!['APPROVED', 'CREATED', 'PAYER_ACTION_REQUIRED'].includes(String(knownOrder.status))) {
            throw new SandboxError('The existing order has no confirmed capture. Inspect it in PayPal Sandbox before continuing.');
          }
        }
        if (!captureId) {
          await progress.beforePost('capture');
          let order: Json;
          try {
            order = await this.request('POST', `/v2/checkout/orders/${orderId}/capture`, {}, fixture.captureRequestId);
          } catch (error) {
            if (error instanceof SandboxError && error.status !== undefined && error.status < 500
              && error.status !== 409 && error.code !== 'ORDER_ALREADY_CAPTURED') throw error;
            try { order = await this.request('GET', `/v2/checkout/orders/${orderId}`); captureId = captureFromOrder(order, orderId); }
            catch { throw error; }
          }
          captureId ??= captureFromOrder(order!, orderId);
        }
        // Save the committed capture before its GET or any seed refund can fail.
        await progress.save({ captureId });
      }
      await progress.phase(fixture.preparation?.step === 'opening-refund' ? 'opening-refund' : 'capture', 'unknown', 'Checking the saved capture with PayPal Sandbox.');
      const capture = await this.request('GET', `/v2/payments/captures/${captureId}`);
      if (capture.id !== captureId) throw new SandboxError('PayPal Sandbox capture ID mismatch.');
      if (!['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(capture.status))) {
        if (capture.status === 'PENDING') throw new PreparationPending('Sandbox capture is not completed: PENDING. Resume this fixture later to read its status.');
        throw new SandboxError('Sandbox capture is not completed. No refund fixture is ready.');
      }
      if (fixture.scenario.priorRefundCents === 0 && capture.status !== 'COMPLETED') {
        throw new SandboxError('This fixture expects no opening refunds, but the capture is already refunded. Create a fresh fixture.');
      }
      if (money(capture.amount) !== fixture.scenario.capturedCents) {
        throw new SandboxError('Sandbox captured amount does not match the approved test fixture.');
      }
      const openingRefunds: RefundRecord[] = [];
      if (fixture.scenario.priorRefundCents > 0) {
        const existing = fixture.openingRefunds.find(refund => refund.requestId === fixture.seedRequestId);
        let seedRefundId = fixture.seedRefundId ?? existing?.id;
        await progress.phase('opening-refund', 'unknown', 'Checking the opening refund for this capture.');
        if (!seedRefundId) {
          if (fixture.status === 'UNKNOWN' && !fixture.preparation) {
            throw new SandboxError('This legacy fixture has no saved opening-refund attempt time. Inspect its seed request ID in PayPal Sandbox before preparing another payment.');
          }
          await progress.beforePost('opening-refund');
          const response = await this.request('POST', `/v2/payments/captures/${captureId}/refund`, {
            amount: { currency_code: 'USD', value: usd(fixture.scenario.priorRefundCents) },
            note_to_payer: 'PayProof sandbox fixture: opening refund',
          }, fixture.seedRequestId);
          seedRefundId = identifier(response.id, 'refund ID');
          // Retain even a pending or malformed response's ID before parsing or GET readback.
          await progress.save({ seedRefundId });
          refundRecord(response, captureId, fixture.seedRequestId, seedRefundId, fixture.scenario.capturedCents);
        } else {
          seedRefundId = identifier(seedRefundId, 'refund ID');
          if (!progress.current.seedRefundId) await progress.save({ seedRefundId });
        }
        const seeded = refundRecord(await this.request('GET', `/v2/payments/refunds/${seedRefundId}`),
          captureId, fixture.seedRequestId, seedRefundId, fixture.scenario.capturedCents);
        if (seeded.amountCents !== fixture.scenario.priorRefundCents) throw new SandboxError('Sandbox opening refund amount mismatch.');
        if (seeded.status !== 'COMPLETED') {
          if (seeded.status === 'PENDING') throw new PreparationPending('Sandbox opening refund is PENDING. Resume this fixture later to read its status.');
          throw new SandboxError(`Sandbox opening refund is ${seeded.status}. Inspect this fixture in PayPal Sandbox.`);
        }
        if (seeded.cumulativeRefundedCents !== undefined && seeded.cumulativeRefundedCents !== fixture.scenario.priorRefundCents) {
          throw new SandboxError('Sandbox cumulative opening refunds do not match the scenario. This capture may contain untracked refunds; create a fresh fixture.');
        }
        openingRefunds.push(seeded);
      }
      await progress.save({ captureId, openingRefunds, status: 'CAPTURED', preparation: undefined });
      return progress.current;
    } catch (error) { return progress.failed(error); }
  }

  fixtureGateway(fixture: Fixture): RefundGateway {
    if (fixture.status !== 'CAPTURED') throw new SandboxError('A captured, unused sandbox fixture is required.');
    validateScenario(fixture.scenario);
    const captureId = identifier(fixture.captureId, 'capture ID');
    const openingRefunds = structuredClone(fixture.openingRefunds);
    for (const refund of openingRefunds) {
      if (refund.captureId !== captureId || refund.source !== 'paypal' || refund.currency !== 'USD' || refund.status !== 'COMPLETED') {
        throw new SandboxError('Invalid opening refund evidence for this fixture.');
      }
      identifier(refund.id, 'refund ID');
      cents(refund.amountCents, 'Opening refund');
      if (refund.cumulativeRefundedCents !== undefined) {
        cents(refund.cumulativeRefundedCents, 'Cumulative opening refund', true);
        if (refund.cumulativeRefundedCents < refund.amountCents || refund.cumulativeRefundedCents > fixture.scenario.priorRefundCents) {
          throw new SandboxError('Invalid cumulative opening refund evidence for this fixture.');
        }
      }
    }
    if (openingRefunds.reduce((sum, refund) => sum + refund.amountCents, 0) !== fixture.scenario.priorRefundCents) {
      throw new SandboxError('Known opening refunds do not match the scenario.');
    }
    const known = new Map(openingRefunds.map((refund) => [refund.id, refund]));
    return {
      provider: 'paypal', captureId, openingRefunds,
      verifyOpening: async () => {
        // Capture GET exposes status and the original amount, not a refunded-money total.
        // Source: https://developer.paypal.com/api/payments/v2/schema.json
        const capture = await this.request('GET', `/v2/payments/captures/${captureId}`);
        if (capture.id !== captureId) throw new SandboxError('PayPal Sandbox capture ID mismatch during opening verification.');
        const capturedCents = money(capture.amount);
        if (capturedCents !== fixture.scenario.capturedCents) throw new SandboxError('The current captured amount differs from the saved fixture. No refund was attempted.');
        const prior = fixture.scenario.priorRefundCents;
        const expectedStatus = prior === 0 ? 'COMPLETED' : prior === capturedCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        if (capture.status !== expectedStatus) {
          throw new SandboxError('The current PayPal capture status does not match the saved opening balance. This fixture may have changed; no refund was attempted.');
        }
        if (prior === 0) return { captureId, capturedCents, refundedCents: 0, captureStatus: expectedStatus, basis: 'capture-status' as const };

        // A partial-refund status does not quantify its balance. Require a current GET's
        // optional total_refunded_amount; fees, net amounts and cached totals are not substitutes.
        let aggregate: number | undefined;
        for (const opening of openingRefunds) {
          const observed = refundRecord(await this.request('GET', `/v2/payments/refunds/${opening.id}`), captureId, opening.requestId, opening.id, capturedCents);
          if (observed.status !== 'COMPLETED' || observed.amountCents !== opening.amountCents) {
            throw new SandboxError('The current opening refund differs from the saved fixture. No refund was attempted.');
          }
          if (observed.cumulativeRefundedCents !== undefined) aggregate = Math.max(aggregate ?? 0, observed.cumulativeRefundedCents);
        }
        if (aggregate === undefined) {
          throw new SandboxError('PayPal omitted the cumulative refunded amount needed to verify this prior-refund fixture. Opening payment evidence is unconfirmed; no refund was attempted.');
        }
        if (aggregate !== prior) {
          throw new SandboxError('PayPal cumulative opening refunds differ from the saved fixture. Other refund activity may exist; no refund was attempted.');
        }
        return { captureId, capturedCents, refundedCents: aggregate, captureStatus: expectedStatus, basis: 'refund-cumulative' as const };
      },
      refund: async (amountCents, requestId) => {
        cents(amountCents, 'Refund');
        requestIdentifier(requestId);
        const body = await this.request('POST', `/v2/payments/captures/${captureId}/refund`, {
          amount: { currency_code: 'USD', value: usd(amountCents) },
          note_to_payer: 'PayProof sandbox test refund',
        }, requestId);
        const refund = refundRecord(body, captureId, requestId, undefined, fixture.scenario.capturedCents);
        known.set(refund.id, refund);
        return refund;
      },
      readRefund: async (id) => {
        identifier(id, 'refund ID');
        const previous = known.get(id);
        if (!previous) throw new SandboxError('Cannot verify an untracked refund. This fixture only covers known test refund IDs.');
        const refund = refundRecord(await this.request('GET', `/v2/payments/refunds/${id}`), captureId, previous.requestId, id, fixture.scenario.capturedCents);
        if (refund.amountCents !== previous.amountCents) throw new SandboxError('PayPal Sandbox refund amount changed during readback.');
        known.set(id, refund);
        return refund;
      },
    };
  }
}

const adapter = new PayPalSandboxAdapter();
export const createFixture = (scenario: Scenario, returnUrl: string, cancelUrl: string): Promise<Fixture> =>
  adapter.createFixture(scenario, returnUrl, cancelUrl);
export const prepareFixture = (scenario: Scenario, returnUrl: string, cancelUrl: string, fixtureId?: string): Fixture =>
  adapter.prepareFixture(scenario, returnUrl, cancelUrl, fixtureId);
export const createPreparedFixture = (fixture: Fixture, checkpoint: FixtureCheckpoint): Promise<Fixture> => adapter.createPreparedFixture(fixture, checkpoint);
export const captureFixture = (fixture: Fixture, checkpoint?: FixtureCheckpoint): Promise<Fixture> => adapter.captureFixture(fixture, checkpoint);
export const resumeFixture = (fixture: Fixture, checkpoint: FixtureCheckpoint): Promise<Fixture> => adapter.resumeFixture(fixture, checkpoint);
export const fixtureGateway = (fixture: Fixture): RefundGateway => adapter.fixtureGateway(fixture);
