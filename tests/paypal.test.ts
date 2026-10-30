import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalSandboxAdapter } from '../server/paypal.ts';
import type { Fixture, Scenario } from '../shared/types.ts';

const scenario: Scenario = {
  id: 'partial-refund', title: 'Cumulative courtesy limit', category: 'policy',
  message: 'Please refund $10.', capturedCents: 10_000, priorRefundCents: 1_500,
  requestedCents: 1_000, supervisorApproved: false, expectedAction: 'escalate',
  fault: 'none', source: 'curated', approved: true,
};
const fixture: Fixture = {
  id: 'fixture-1', scenarioId: scenario.id, orderId: 'ORDER1',
  approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER1',
  status: 'CREATED', createdAt: '2026-10-09T00:00:00.000Z',
  openingRefunds: [], scenario, captureRequestId: 'capture-key-1', seedRequestId: 'seed-key-1',
};
const credentials = () => ({ clientId: 'fake-client', clientSecret: 'fake-secret' });
const oauth = { access_token: 'fake-token', expires_in: 3600 };
const order = { id: 'ORDER1', purchase_units: [{ payments: { captures: [{ id: 'CAPTURE1' }] } }] };
const capture = { id: 'CAPTURE1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '100.00' } };
const refund = (id = 'REFUND1', value = '15.00', status = 'COMPLETED', currency = 'USD') => ({
  id, status, amount: { currency_code: currency, value },
  links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE1' }],
});
type Call = { url: URL; method: string; headers: Headers; body: Record<string, unknown> | string | undefined };
type Step = { path: string; method?: string; data?: unknown; status?: number; fail?: boolean; check?: (call: Call) => void };

function mocked(steps: Step[], extra: { now?: () => number; id?: () => string } = {}) {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://api-m.sandbox.paypal.com', 'every network request is sandbox-only');
    assert.equal(init?.redirect, 'error', 'credentials cannot follow redirects');
    assert.ok(init?.signal, 'requests have a bounded timeout');
    const step = steps.shift();
    assert.ok(step, `unexpected request: ${url.pathname}`);
    const headers = new Headers(init?.headers);
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    const call = { url, method: init?.method ?? 'GET', headers,
      body: headers.get('Content-Type') === 'application/json' && rawBody ? JSON.parse(rawBody) : rawBody };
    calls.push(call);
    assert.equal(url.pathname, step.path);
    assert.equal(call.method, step.method ?? 'GET');
    if (url.pathname === '/v1/oauth2/token') {
      assert.equal(headers.get('Authorization'), `Basic ${Buffer.from('fake-client:fake-secret').toString('base64')}`);
      assert.equal(rawBody, 'grant_type=client_credentials');
    } else assert.equal(headers.get('Authorization'), 'Bearer fake-token');
    step.check?.(call);
    if (step.fail) throw new TypeError('simulated connection reset containing fake-secret');
    return Response.json(step.data, { status: step.status ?? 200 });
  }) as typeof fetch;
  let id = 0;
  return {
    adapter: new PayPalSandboxAdapter({ fetch: fetcher, credentials, id: () => `id-${++id}`, ...extra }),
    calls,
    done: () => assert.equal(steps.length, 0, 'all expected PayPal calls occurred'),
  };
}
const authStep = (): Step => ({ path: '/v1/oauth2/token', method: 'POST', data: oauth });
const capturedFixture = (): Fixture => ({ ...structuredClone(fixture), captureId: 'CAPTURE1', status: 'CAPTURED', openingRefunds: [{
  id: 'REFUND1', captureId: 'CAPTURE1', requestId: 'seed-key-1', amountCents: 1500, currency: 'USD', status: 'COMPLETED', source: 'paypal',
}] });

test('orders use server-side OAuth, exact cents, immutable sandbox host and a cached token', async () => {
  const createStep = (): Step => ({ path: '/v2/checkout/orders', method: 'POST', data: {
    id: 'ORDER1', links: [{ rel: 'payer-action', href: fixture.approvalUrl }],
  }, check: ({ headers, body }) => {
    assert.ok(headers.get('PayPal-Request-Id'));
    const data = body as { purchase_units: { amount: unknown }[]; payment_source: { paypal: { experience_context: unknown } } };
    assert.deepEqual(data.purchase_units[0].amount, { currency_code: 'USD', value: '100.00' });
    assert.deepEqual(data.payment_source.paypal.experience_context, {
      brand_name: 'PayProof Sandbox', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING',
      return_url: 'http://127.0.0.1:4318/return', cancel_url: 'http://127.0.0.1:4318/cancel',
    });
  } });
  const mock = mocked([authStep(), createStep(), createStep()]);
  const first = await mock.adapter.createFixture(scenario, 'http://127.0.0.1:4318/return', 'http://127.0.0.1:4318/cancel');
  const second = await mock.adapter.createFixture(scenario, 'http://127.0.0.1:4318/return', 'http://127.0.0.1:4318/cancel');
  assert.equal(first.status, 'CREATED');
  assert.notEqual(first.captureRequestId, first.seedRequestId);
  assert.notEqual(first.captureRequestId, second.captureRequestId);
  assert.equal(mock.calls.filter((call) => call.url.pathname === '/v1/oauth2/token').length, 1);
  mock.done();
});

test('capture verifies authoritative amount, seeds prior refund and requires completed GET evidence', async () => {
  const original = structuredClone(fixture);
  const mock = mocked([
    authStep(),
    { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', data: order, check: ({ headers }) => assert.equal(headers.get('PayPal-Request-Id'), fixture.captureRequestId) },
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund(), check: ({ headers, body }) => {
      assert.equal(headers.get('PayPal-Request-Id'), fixture.seedRequestId);
      assert.deepEqual((body as { amount: unknown }).amount, { currency_code: 'USD', value: '15.00' });
    } },
    { path: '/v2/payments/refunds/REFUND1', data: refund() },
  ]);
  const result = await mock.adapter.captureFixture(original);
  assert.equal(result.status, 'CAPTURED');
  assert.equal(result.captureId, 'CAPTURE1');
  assert.equal(result.openingRefunds[0].status, 'COMPLETED');
  assert.equal(result.openingRefunds[0].amountCents, 1500);
  assert.deepEqual(original, fixture, 'caller can persist the original fixture if an operation is ambiguous');
  mock.done();
});

test('lost capture response recovers the committed capture by reading the same order', async () => {
  const mock = mocked([
    authStep(), { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', fail: true },
    { path: '/v2/checkout/orders/ORDER1', data: order },
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
  ]);
  const result = await mock.adapter.captureFixture({ ...fixture, scenario: { ...scenario, priorRefundCents: 0 } });
  assert.equal(result.status, 'CAPTURED');
  assert.equal(mock.calls.filter((call) => call.url.pathname.endsWith('/capture')).length, 1);
  mock.done();
});

test('an ambiguous seed refund is recoverable with the original capture and seed request IDs', async () => {
  const ids: string[] = [];
  const check = ({ headers }: Call) => { ids.push(headers.get('PayPal-Request-Id')!); };
  const mock = mocked([
    authStep(),
    { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', data: order, check },
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', fail: true, check },
    { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', data: order, check },
    { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund(), check },
    { path: '/v2/payments/refunds/REFUND1', data: refund() },
  ]);
  await assert.rejects(mock.adapter.captureFixture(fixture), /could not be confirmed/);
  const recovered = await mock.adapter.captureFixture(fixture);
  assert.deepEqual(ids, ['capture-key-1', 'seed-key-1', 'capture-key-1', 'seed-key-1']);
  assert.equal(recovered.openingRefunds.length, 1);
  mock.done();
});

test('gateway reuses refund request IDs and reads only tracked refund evidence', async () => {
  const requestIds: string[] = [];
  const step = (): Step => ({ path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund('REFUND2', '5.09'), check: ({ headers, body }) => {
    requestIds.push(headers.get('PayPal-Request-Id')!);
    assert.deepEqual((body as { amount: unknown }).amount, { currency_code: 'USD', value: '5.09' });
  } });
  const mock = mocked([
    authStep(), { path: '/v2/payments/refunds/REFUND1', data: refund() }, step(), step(),
    { path: '/v2/payments/refunds/REFUND2', data: refund('REFUND2', '5.09') },
  ]);
  const gateway = mock.adapter.fixtureGateway(capturedFixture());
  assert.equal((await gateway.readRefund('REFUND1')).amountCents, 1500);
  const first = await gateway.refund(509, 'same-request');
  const retry = await gateway.refund(509, 'same-request');
  assert.equal(first.id, retry.id);
  assert.deepEqual(requestIds, ['same-request', 'same-request']);
  assert.equal((await gateway.readRefund(first.id)).amountCents, 509);
  await assert.rejects(gateway.readRefund('UNTRACKED'), /untracked refund/);
  mock.done();
});

test('pending refunds remain pending and pending seed refunds do not create ready fixtures', async () => {
  const pendingGateway = mocked([authStep(), {
    path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund('REFUND2', '5.00', 'PENDING'),
  }, { path: '/v2/payments/refunds/REFUND2', data: refund('REFUND2', '5.00', 'PENDING') }]);
  const gateway = pendingGateway.adapter.fixtureGateway(capturedFixture());
  const result = await gateway.refund(500, 'pending-request');
  assert.equal(result.status, 'PENDING');
  assert.equal((await gateway.readRefund(result.id)).status, 'PENDING');
  pendingGateway.done();

  const pendingSeed = mocked([
    authStep(), { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', data: order },
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund('REFUND1', '15.00', 'PENDING') },
    { path: '/v2/payments/refunds/REFUND1', data: refund('REFUND1', '15.00', 'PENDING') },
  ]);
  await assert.rejects(pendingSeed.adapter.captureFixture(fixture), /opening refund is PENDING/);
  assert.equal(fixture.status, 'CREATED');
  pendingSeed.done();
});

test('currency, precision, identity and unrecognized statuses cannot become valid evidence', async () => {
  const invalid = [
    { value: refund('REFUND2', '5.00', 'COMPLETED', 'EUR'), error: /currency mismatch/ },
    { value: refund('REFUND2', '5.001'), error: /exact USD cents/ },
    { value: refund('REFUND2', '5.00', 'SUCCESS'), error: /status is missing or unrecognized/ },
    { value: { ...refund('REFUND2', '5.00'), links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/OTHER' }] }, error: /different capture/ },
  ];
  for (const item of invalid) {
    const mock = mocked([authStep(), { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: item.value }]);
    await assert.rejects(mock.adapter.fixtureGateway(capturedFixture()).refund(500, 'valid-request'), item.error);
    mock.done();
  }
  const readback = mocked([authStep(), { path: '/v2/payments/refunds/REFUND1', data: refund('OTHER', '15.00') }]);
  await assert.rejects(readback.adapter.fixtureGateway(capturedFixture()).readRefund('REFUND1'), /refund ID mismatch/);
  readback.done();
});

test('capture rejects currency/amount mismatches and unexpected existing refunds', async () => {
  for (const item of [
    { data: { ...capture, amount: { currency_code: 'EUR', value: '100.00' } }, error: /currency mismatch/ },
    { data: { ...capture, amount: { currency_code: 'USD', value: '90.00' } }, error: /captured amount does not match/ },
    { data: { ...capture, status: 'PENDING' }, error: /capture is not completed/ },
    { data: { ...capture, status: 'PARTIALLY_REFUNDED' }, error: /already refunded/ },
  ]) {
    const mock = mocked([authStep(), { path: '/v2/payments/captures/CAPTURE1', data: item.data }]);
    await assert.rejects(mock.adapter.captureFixture({ ...fixture, captureId: 'CAPTURE1', scenario: { ...scenario, priorRefundCents: 0 } }), item.error);
    mock.done();
  }
});

test('unsafe approval links and invalid local inputs are rejected', async () => {
  const mock = mocked([authStep(), { path: '/v2/checkout/orders', method: 'POST', data: {
    id: 'ORDER1', links: [{ rel: 'approve', href: 'https://www.paypal.com/checkoutnow?token=ORDER1' }],
  } }]);
  await assert.rejects(mock.adapter.createFixture(scenario, 'http://127.0.0.1:4318/', 'http://127.0.0.1:4318/'), /outside PayPal Sandbox/);
  mock.done();
  const empty = mocked([]);
  await assert.rejects(empty.adapter.captureFixture({ ...fixture, status: 'USED' }), /already used/);
  assert.throws(() => empty.adapter.fixtureGateway({ ...capturedFixture(), status: 'USED' }), /unused sandbox fixture/);
  await assert.rejects(empty.adapter.fixtureGateway(capturedFixture()).refund(1.5, 'key'), /integer USD cents/);
  await assert.rejects(empty.adapter.createFixture({ ...scenario, priorRefundCents: 10001 }, 'http://localhost/', 'http://localhost/'), /cannot exceed/);
  empty.done();
});

test('authentication and PayPal errors do not expose secrets or customer response descriptions', async () => {
  const unavailable = new PayPalSandboxAdapter({ credentials: () => undefined, fetch: (async () => { throw new Error('must not fetch'); }) as typeof fetch });
  await assert.rejects(unavailable.createFixture(scenario, 'http://localhost/', 'http://localhost/'), /not configured/);
  const denied = mocked([authStep(), { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', status: 422,
    data: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'REFUND_AMOUNT_EXCEEDED', description: 'fake-secret customer@example.com' }] },
  }]);
  await assert.rejects(denied.adapter.fixtureGateway(capturedFixture()).refund(1000, 'key'), (error: Error) => {
    assert.match(error.message, /REFUND_AMOUNT_EXCEEDED/);
    assert.doesNotMatch(error.message, /fake-secret|customer@example/);
    return true;
  });
  denied.done();
});

test('OAuth refreshes after its conservative cache lifetime', async () => {
  let now = 0;
  const step = (): Step => ({ path: '/v2/payments/refunds/REFUND1', data: refund() });
  const mock = mocked([authStep(), step(), step(), authStep(), step()], { now: () => now });
  const gateway = mock.adapter.fixtureGateway(capturedFixture());
  await gateway.readRefund('REFUND1');
  now = 1000;
  await gateway.readRefund('REFUND1');
  now = 3_580_000;
  await gateway.readRefund('REFUND1');
  assert.equal(mock.calls.filter((call) => call.url.pathname === '/v1/oauth2/token').length, 2);
  mock.done();
});

const withCumulative = (body: ReturnType<typeof refund>, value: string, currency = 'USD') => ({
  ...body, seller_payable_breakdown: { total_refunded_amount: { currency_code: currency, value } },
});

test('PayPal cumulative totals survive independent reads without becoming a per-refund amount', async () => {
  const mock = mocked([
    authStep(),
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: withCumulative(refund('REFUND2', '5.00'), '20.00') },
    { path: '/v2/payments/refunds/REFUND2', data: withCumulative(refund('REFUND2', '5.00'), '25.00') },
  ]);
  const gateway = mock.adapter.fixtureGateway(capturedFixture());
  const response = await gateway.refund(500, 'cumulative-request');
  assert.equal(response.amountCents, 500);
  assert.equal(response.cumulativeRefundedCents, 2000);
  const independentlyRead = await gateway.readRefund(response.id);
  assert.equal(independentlyRead.amountCents, 500);
  assert.equal(independentlyRead.cumulativeRefundedCents, 2500, 'later aggregate evidence is retained for engine reconciliation');
  mock.done();
});

test('a contaminated opening fixture is rejected when provider cumulative evidence exceeds its known seed', async () => {
  for (const reuseExistingSeed of [false, true]) {
    const contaminated = withCumulative(refund(), '25.00');
    const mock = mocked([
      authStep(),
      { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
      ...(!reuseExistingSeed ? [{ path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: contaminated }] : []),
      { path: '/v2/payments/refunds/REFUND1', data: contaminated },
    ]);
    const original = reuseExistingSeed ? capturedFixture() : { ...structuredClone(fixture), captureId: 'CAPTURE1' };
    const snapshot = structuredClone(original);
    await assert.rejects(mock.adapter.captureFixture(original), /cumulative opening refunds do not match/);
    assert.deepEqual(original, snapshot, 'a rejected fixture cannot be silently marked ready');
    mock.done();
  }
});

test('a matching cumulative opening readback is retained in a ready fixture', async () => {
  const mock = mocked([
    authStep(),
    { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
    { path: '/v2/payments/refunds/REFUND1', data: withCumulative(refund(), '15.00') },
  ]);
  const ready = await mock.adapter.captureFixture(capturedFixture());
  assert.equal(ready.status, 'CAPTURED');
  assert.equal(ready.openingRefunds[0].cumulativeRefundedCents, 1500);
  mock.done();
});

test('missing cumulative metadata stays absent on old fixtures and on a fresh readback', async () => {
  const mock = mocked([
    authStep(),
    { path: '/v2/payments/refunds/REFUND1', data: refund() },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: withCumulative(refund('REFUND2', '5.00'), '20.00') },
    { path: '/v2/payments/refunds/REFUND2', data: refund('REFUND2', '5.00') },
  ]);
  const gateway = mock.adapter.fixtureGateway(capturedFixture());
  const opening = await gateway.readRefund('REFUND1');
  assert.equal(Object.hasOwn(opening, 'cumulativeRefundedCents'), false);
  const created = await gateway.refund(500, 'optional-cumulative');
  assert.equal(created.cumulativeRefundedCents, 2000);
  const final = await gateway.readRefund(created.id);
  assert.equal(Object.hasOwn(final, 'cumulativeRefundedCents'), false, 'a current absence cannot inherit a stale provider total');
  mock.done();
});

test('invalid cumulative currency, cents, bounds, and refund identity never become valid evidence', async () => {
  const invalid = [
    { body: withCumulative(refund('REFUND2', '5.00'), '20.00', 'EUR'), error: /currency mismatch/ },
    { body: withCumulative(refund('REFUND2', '5.00'), '20.001'), error: /exact USD cents/ },
    { body: withCumulative(refund('REFUND2', '5.00'), '-20.00'), error: /exact USD cents/ },
    { body: withCumulative(refund('REFUND2', '5.00'), '99999999999999.99'), error: /supported range/ },
    { body: withCumulative(refund('REFUND2', '5.00'), '4.99'), error: /below the completed refund/ },
    { body: withCumulative(refund('REFUND2', '5.00'), '100.01'), error: /exceeds the original capture/ },
    { body: withCumulative({ ...refund('REFUND2', '5.00'), links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/OTHER' }] }, '20.00'), error: /different capture/ },
  ];
  for (const { body, error } of invalid) {
    const mock = mocked([authStep(), { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: body }]);
    await assert.rejects(mock.adapter.fixtureGateway(capturedFixture()).refund(500, 'invalid-cumulative'), error);
    mock.done();
  }
  const wrongIdentity = mocked([authStep(), { path: '/v2/payments/refunds/REFUND1', data: withCumulative(refund('OTHER'), '15.00') }]);
  await assert.rejects(wrongIdentity.adapter.fixtureGateway(capturedFixture()).readRefund('REFUND1'), /refund ID mismatch/);
  wrongIdentity.done();
});

test('a pending refund may report zero cumulative completion without being made ready', async () => {
  const pending = withCumulative(refund('REFUND1', '15.00', 'PENDING'), '0.00');
  const mock = mocked([
    authStep(),
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: pending },
    { path: '/v2/payments/refunds/REFUND1', data: pending },
  ]);
  await assert.rejects(mock.adapter.captureFixture({ ...fixture, captureId: 'CAPTURE1' }), /opening refund is PENDING/);
  mock.done();
});

test('malformed cumulative metadata in a saved opening record is rejected before requests', () => {
  for (const value of [-1, 1.5, 1499, 2500, Number.MAX_SAFE_INTEGER + 1]) {
    const stored = capturedFixture();
    stored.openingRefunds[0].cumulativeRefundedCents = value;
    const mock = mocked([]);
    assert.throws(() => mock.adapter.fixtureGateway(stored), /[Cc]umulative opening refund/);
    mock.done();
  }
});

test('a lost order-create response resumes its persisted identity and frozen body after restart', async () => {
  let saved: Fixture | undefined;
  let originalBody: unknown;
  let originalRequestId: string | null = null;
  const first = mocked([authStep(), { path: '/v2/checkout/orders', method: 'POST', fail: true, check: call => {
    assert.equal(saved?.preparation?.state, 'unknown', 'attempt was durable before the POST');
    originalBody = call.body;
    originalRequestId = call.headers.get('PayPal-Request-Id');
  } }]);
  const draft = first.adapter.prepareFixture(scenario, 'http://localhost:4318/return', 'http://localhost:4318/cancel', 'browser-operation-1');
  saved = structuredClone(draft);
  const checkpoint = async (value: Fixture) => { saved = structuredClone(value); };
  await assert.rejects(first.adapter.createPreparedFixture(draft, checkpoint), /could not be confirmed/);
  assert.equal(saved.status, 'UNKNOWN');
  assert.equal(saved.orderId, '');
  assert.equal(saved.preparation?.step, 'order');
  first.done();
  const second = mocked([authStep(), { path: '/v2/checkout/orders', method: 'POST', data: {
    id: 'ORDER1', links: [{ rel: 'approve', href: fixture.approvalUrl }],
  }, check: call => {
    assert.equal(call.headers.get('PayPal-Request-Id'), originalRequestId);
    assert.deepEqual(call.body, originalBody);
  } }], { id: () => { throw new Error('resume must not allocate IDs'); } });
  const created = await second.adapter.resumeFixture(saved, checkpoint);
  assert.equal(created.status, 'CREATED');
  assert.equal(saved.orderId, 'ORDER1');
  assert.equal(saved.captureId, undefined, 'resuming creation must not capture the order');
  second.done();
});

test('capture checkpoint survives a later seed failure and only that same seed request resumes', async () => {
  let saved = structuredClone(fixture);
  const checkpoint = async (value: Fixture) => { saved = structuredClone(value); };
  const first = mocked([
    authStep(), { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', data: order },
    { path: '/v2/payments/captures/CAPTURE1', data: capture, check: () => assert.equal(saved.captureId, 'CAPTURE1') },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', fail: true,
      check: () => { assert.equal(saved.captureId, 'CAPTURE1'); assert.equal(saved.preparation?.step, 'opening-refund'); assert.ok(saved.preparation?.attemptedAt); } },
  ]);
  await assert.rejects(first.adapter.captureFixture(fixture, checkpoint), /could not be confirmed/);
  assert.equal(saved.captureId, 'CAPTURE1');
  assert.equal(saved.seedRefundId, undefined);
  first.done();
  const second = mocked([
    authStep(), { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund(), check: call => assert.equal(call.headers.get('PayPal-Request-Id'), fixture.seedRequestId) },
    { path: '/v2/payments/refunds/REFUND1', data: refund() },
  ]);
  const ready = await second.adapter.resumeFixture(saved, checkpoint);
  assert.equal(ready.status, 'CAPTURED');
  assert.equal(ready.seedRefundId, 'REFUND1');
  second.done();
});

test('pending seed ID is saved before readback and later resume only reads provider records', async () => {
  let saved = structuredClone(fixture);
  const checkpoint = async (value: Fixture) => { saved = structuredClone(value); };
  const first = mocked([
    authStep(), { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', data: order },
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund('REFUND1', '15.00', 'PENDING') },
    { path: '/v2/payments/refunds/REFUND1', data: refund('REFUND1', '15.00', 'PENDING'), check: () => assert.equal(saved.seedRefundId, 'REFUND1') },
  ]);
  await assert.rejects(first.adapter.captureFixture(fixture, checkpoint), /opening refund is PENDING/);
  assert.equal(saved.status, 'UNKNOWN');
  assert.equal(saved.preparation?.state, 'pending');
  assert.equal(saved.openingRefunds.length, 0);
  first.done();
  const second = mocked([
    authStep(), { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
    { path: '/v2/payments/refunds/REFUND1', data: refund() },
  ], { now: () => Date.now() + 86_400_000 });
  assert.equal((await second.adapter.resumeFixture(saved, checkpoint)).status, 'CAPTURED');
  assert.equal(second.calls.filter(call => call.method === 'POST' && !call.url.pathname.includes('oauth')).length, 0);
  second.done();
});

test('unknown capture resumes with an order read and never repeats a committed capture', async () => {
  let saved: Fixture = { ...structuredClone(fixture), status: 'UNKNOWN', preparation: {
    step: 'capture', state: 'unknown', attemptedAt: new Date().toISOString(),
  } };
  const mock = mocked([
    authStep(), { path: '/v2/checkout/orders/ORDER1', data: order },
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
  ]);
  const ready = await mock.adapter.resumeFixture({ ...saved, scenario: { ...scenario, priorRefundCents: 0 } }, async value => { saved = value; });
  assert.equal(ready.captureId, 'CAPTURE1');
  assert.equal(saved.status, 'CAPTURED');
  mock.done();
});

test('failed checkpoints stop before order POST and before a seed can follow an unsaved capture', async () => {
  const empty = mocked([]);
  const draft = empty.adapter.prepareFixture(scenario, 'http://localhost/', 'http://localhost/');
  await assert.rejects(empty.adapter.createPreparedFixture(draft, async () => { throw new Error('disk full'); }), /checkpoint could not be saved/);
  empty.done();
  const mock = mocked([authStep(), { path: '/v2/checkout/orders/ORDER1/capture', method: 'POST', data: order }]);
  await assert.rejects(mock.adapter.captureFixture(fixture, async value => {
    if (value.captureId) throw new Error('disk full');
  }), /checkpoint could not be saved/);
  mock.done();
});

test('expired ambiguous create and seed requests cannot be reposted under a fresh identity', async () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  const empty = mocked([], { now: () => now });
  const draft = empty.adapter.prepareFixture(scenario, 'http://localhost/', 'http://localhost/');
  draft.preparation!.attemptedAt = '2026-10-09T10:00:00Z';
  draft.preparation!.state = 'unknown';
  await assert.rejects(empty.adapter.resumeFixture(draft, async () => {}), /older unconfirmed operation/);
  empty.done();
  const seed = mocked([authStep(), { path: '/v2/payments/captures/CAPTURE1', data: capture }], { now: () => now });
  let saved: Fixture = { ...structuredClone(fixture), captureId: 'CAPTURE1', status: 'UNKNOWN', preparation: {
    step: 'opening-refund', state: 'unknown', attemptedAt: '2026-10-09T10:00:00Z',
  } };
  await assert.rejects(seed.adapter.resumeFixture(saved, async value => { saved = value; }), /older unconfirmed operation/);
  assert.equal(saved.preparation?.attemptedAt, '2026-10-09T10:00:00Z');
  assert.equal(saved.preparation?.step, 'opening-refund');
  seed.done();
});

test('known order ID remains recoverable when approval-link parsing fails', async () => {
  let saved: Fixture;
  const first = mocked([authStep(), { path: '/v2/checkout/orders', method: 'POST', data: { id: 'ORDER1', links: [] } }]);
  const draft = first.adapter.prepareFixture(scenario, 'http://localhost/', 'http://localhost/');
  await assert.rejects(first.adapter.createPreparedFixture(draft, async value => { saved = value; }), /approval URL/);
  assert.equal(saved!.orderId, 'ORDER1');
  first.done();
  const second = mocked([authStep(), { path: '/v2/checkout/orders/ORDER1', data: { id: 'ORDER1', links: [{ rel: 'approve', href: fixture.approvalUrl }] } }]);
  assert.equal((await second.adapter.resumeFixture(saved!, async () => {})).status, 'CREATED');
  second.done();
});

test('legacy unknown fixtures stay blocked from seed POST across repeated resumes', async () => {
  let saved: Fixture = { ...structuredClone(fixture), captureId: 'CAPTURE1', status: 'UNKNOWN' };
  const mock = mocked([
    authStep(), { path: '/v2/payments/captures/CAPTURE1', data: capture },
    { path: '/v2/payments/captures/CAPTURE1', data: capture },
  ]);
  const checkpoint = async (value: Fixture) => { saved = value; };
  await assert.rejects(mock.adapter.resumeFixture(saved, checkpoint), /no saved opening-refund attempt time/);
  assert.equal(saved.preparation?.replayBlocked, true);
  await assert.rejects(mock.adapter.resumeFixture(saved, checkpoint), /older unconfirmed operation/);
  assert.equal(saved.preparation?.replayBlocked, true);
  mock.done();
});

test('execution opening verification detects a stale zero-refund capture before new refunds', async () => {
  const { executeScenario } = await import('../server/engine.ts');
  const { defaultPolicy } = await import('../shared/fixtures.ts');
  const currentScenario = { ...scenario, priorRefundCents: 0, expectedAction: 'refund' as const };
  const ready: Fixture = { ...fixture, scenario: currentScenario, status: 'CAPTURED', captureId: 'CAPTURE1', openingRefunds: [] };
  const mock = mocked([authStep(), { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } }]);
  const result = await executeScenario({ scenario: currentScenario, policy: defaultPolicy, agent: 'corrected', gateway: mock.adapter.fixtureGateway(ready) });
  assert.equal(result.verdict, 'inconclusive');
  assert.equal(result.evidenceComplete, false);
  assert.equal(result.attemptedCents, 0);
  assert.equal(result.checks.find(check => check.name === 'Current capture and opening balance')?.status, 'unknown');
  assert.match(result.events.find(event => event.kind === 'capture-readback-error')!.detail, /does not match the saved opening balance/);
  mock.done();
});

test('execution verifies an unchanged zero-refund capture then reads the actual new refund', async () => {
  const { executeScenario } = await import('../server/engine.ts');
  const { defaultPolicy } = await import('../shared/fixtures.ts');
  const currentScenario = { ...scenario, priorRefundCents: 0, expectedAction: 'refund' as const };
  const ready: Fixture = { ...fixture, scenario: currentScenario, status: 'CAPTURED', captureId: 'CAPTURE1', openingRefunds: [] };
  const mock = mocked([
    authStep(), { path: '/v2/payments/captures/CAPTURE1', data: capture },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: refund('NEW1', '10.00') },
    { path: '/v2/payments/refunds/NEW1', data: refund('NEW1', '10.00') },
  ]);
  const result = await executeScenario({ scenario: currentScenario, policy: defaultPolicy, agent: 'corrected', gateway: mock.adapter.fixtureGateway(ready) });
  assert.equal(result.verdict, 'pass');
  assert.equal(result.evidenceComplete, true);
  const captureEvent = result.events.findIndex(event => event.kind === 'capture-readback');
  assert.ok(captureEvent >= 0 && captureEvent < result.events.findIndex(event => event.kind === 'attempt'));
  assert.equal(result.events[captureEvent].data?.basis, 'capture-status');
  mock.done();
});

test('execution opening verification requires fresh cumulative metadata for prior-refund fixtures', async () => {
  for (const evidence of [refund(), withCumulative(refund(), '25.00')]) {
    const mock = mocked([
      authStep(), { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
      { path: '/v2/payments/refunds/REFUND1', data: evidence },
    ]);
    const ready = capturedFixture();
    ready.openingRefunds[0].cumulativeRefundedCents = 1500;
    await assert.rejects(mock.adapter.fixtureGateway(ready).verifyOpening!(), /omitted the cumulative|cumulative opening refunds differ/);
    mock.done();
  }
  const complete = mocked([
    authStep(), { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
    { path: '/v2/payments/refunds/REFUND1', data: withCumulative(refund(), '15.00') },
  ]);
  assert.deepEqual(await complete.adapter.fixtureGateway(capturedFixture()).verifyOpening!(), {
    captureId: 'CAPTURE1', capturedCents: 10000, refundedCents: 1500, captureStatus: 'PARTIALLY_REFUNDED', basis: 'refund-cumulative',
  });
  complete.done();
});

test('opening verification rejects changed identities, amounts, currencies, and unknown capture status', async () => {
  for (const changed of [
    { ...capture, id: 'OTHER' }, { ...capture, amount: { currency_code: 'EUR', value: '100.00' } },
    { ...capture, amount: { currency_code: 'USD', value: '90.00' } }, { ...capture, status: 'PENDING' },
    { ...capture, status: 'REFUNDED' }, { ...capture, status: undefined },
  ]) {
    const mock = mocked([authStep(), { path: '/v2/payments/captures/CAPTURE1', data: changed }]);
    const ready = { ...capturedFixture(), scenario: { ...scenario, priorRefundCents: 0 }, openingRefunds: [] };
    await assert.rejects(mock.adapter.fixtureGateway(ready).verifyOpening!());
    mock.done();
  }
});

test('a prior-refund run blocks when fresh aggregate evidence is omitted and passes when complete', async () => {
  const { executeScenario } = await import('../server/engine.ts');
  const { defaultPolicy } = await import('../shared/fixtures.ts');
  const currentScenario = { ...scenario, requestedCents: 500, expectedAction: 'refund' as const };
  const ready = { ...capturedFixture(), scenario: currentScenario };
  const absent = mocked([
    authStep(), { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
    { path: '/v2/payments/refunds/REFUND1', data: refund() },
    { path: '/v2/payments/refunds/REFUND1', data: refund() },
  ]);
  const blocked = await executeScenario({ scenario: currentScenario, policy: defaultPolicy, agent: 'corrected', gateway: absent.adapter.fixtureGateway(ready) });
  assert.equal(blocked.verdict, 'inconclusive');
  assert.equal(blocked.attemptedCents, 0);
  assert.match(blocked.checks.find(check => check.name === 'Current capture and opening balance')!.detail, /omitted the cumulative/);
  absent.done();

  const complete = mocked([
    authStep(), { path: '/v2/payments/captures/CAPTURE1', data: { ...capture, status: 'PARTIALLY_REFUNDED' } },
    { path: '/v2/payments/refunds/REFUND1', data: withCumulative(refund(), '15.00') },
    { path: '/v2/payments/refunds/REFUND1', data: withCumulative(refund(), '15.00') },
    { path: '/v2/payments/captures/CAPTURE1/refund', method: 'POST', data: withCumulative(refund('NEW1', '5.00'), '20.00') },
    { path: '/v2/payments/refunds/REFUND1', data: withCumulative(refund(), '15.00') },
    { path: '/v2/payments/refunds/NEW1', data: withCumulative(refund('NEW1', '5.00'), '20.00') },
  ]);
  const passed = await executeScenario({ scenario: currentScenario, policy: defaultPolicy, agent: 'corrected', gateway: complete.adapter.fixtureGateway(ready) });
  assert.equal(passed.verdict, 'pass');
  assert.equal(passed.totalRefundCents, 2000);
  assert.equal(passed.evidenceComplete, true);
  complete.done();
});
