// Rate-limit history ring buffer (GAP: Ban-history ring buffer, auth.js +
// dashboard). markRateLimited is the single funnel every 429/cooldown event in
// the pool flows through, but nothing ever RECORDED those events — an operator
// asking "which window did the upstream ask for, and which did we apply?" had
// to grep logs. This pins the ring's contract: every event lands, in order,
// with BOTH the raw upstream window and the clamped effective window, and the
// oldest falls off once at capacity (a storm must not grow it unbounded).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import {
  addAccountByKey,
  configureBindHost,
  getRateLimitHistory,
  markRateLimited,
  removeAccount,
  _resetRateLimitHistoryForTests,
} from '../src/auth.js';
import { _resetRuntimeConfigForTests } from '../src/runtime-config.js';

const createdAccounts = [];
const originalDashboardPassword = config.dashboardPassword;
const originalApiKey = config.apiKey;
const originalAllowNoAuth = process.env.DASHBOARD_ALLOW_NO_AUTH;

afterEach(() => {
  _resetRateLimitHistoryForTests();
  while (createdAccounts.length) removeAccount(createdAccounts.pop());
  _resetRuntimeConfigForTests();
  config.dashboardPassword = originalDashboardPassword;
  config.apiKey = originalApiKey;
  if (originalAllowNoAuth === undefined) delete process.env.DASHBOARD_ALLOW_NO_AUTH;
  else process.env.DASHBOARD_ALLOW_NO_AUTH = originalAllowNoAuth;
  configureBindHost('0.0.0.0');
});

function addTestAccount(label = 'rlh') {
  const account = addAccountByKey(`rlh-key-${Date.now()}-${Math.random().toString(36).slice(2)}`, label);
  createdAccounts.push(account.id);
  return account;
}

describe('rate-limit history ring buffer', () => {
  it('records every markRateLimited event in order with raw and clamped windows', () => {
    const account = addTestAccount('rlh-order');
    const model = 'gemini-2.5-flash';

    // Default call site (chat.js's `markRateLimited(apiKey, getBreakerTunable('rlBurstMs'), null)`):
    // the default parameter fills in 5min, so the recorded upstream window is
    // exactly that — and, being below the clamp, unclamped.
    markRateLimited(account.apiKey);
    // Model-scoped with an explicit window that survives unclamped.
    markRateLimited(account.apiKey, 60 * 1000, model);
    // Sub-second window hits the clamp floor: 500ms -> effective 1000ms.
    markRateLimited(account.apiKey, 500, null, 'c');

    const events = getRateLimitHistory();
    assert.equal(events.length, 3, 'each markRateLimited must append exactly one event');
    assert.deepEqual(
      events.map(e => e.accountId),
      [account.id, account.id, account.id],
      'events must record the account that was rate-limited, in order',
    );

    // Event 1 — no explicit window: the recorded upstream is the 5min default,
    // applied unclamped.
    assert.equal(events[0].upstreamMs, 5 * 60 * 1000);
    assert.equal(events[0].effectiveMs, 5 * 60 * 1000);
    assert.equal(events[0].clamped, false);
    assert.equal(events[0].modelKey, null);
    assert.equal(events[0].kind, 't');

    // Event 2 — explicit window survives unclamped.
    assert.equal(events[1].upstreamMs, 60 * 1000);
    assert.equal(events[1].effectiveMs, 60 * 1000);
    assert.equal(events[1].clamped, false);
    assert.equal(events[1].modelKey, model);

    // Event 3 — sub-second window is clamped up to the 1000ms floor.
    assert.equal(events[2].upstreamMs, 500);
    assert.equal(events[2].effectiveMs, 1000);
    assert.equal(events[2].clamped, true);
    assert.equal(events[2].kind, 'c');

    // Every event carries a wall-clock and an expiry; expiry is the effective
    // window off `now`, so bound it loosely rather than pin it.
    for (const e of events) {
      assert.ok(Number.isFinite(e.at) && e.at > 0, 'event must carry a timestamp');
      assert.ok(Number.isFinite(e.expiresAt) && e.expiresAt >= e.at);
    }
  });

  it('records a lost upstream window as null rather than as a real cooldown', () => {
    const account = addTestAccount('rlh-lost');
    // The #242 shape: the transport dropped resetMs, so the handler passes a
    // non-numeric window through. The ring must show that the upstream window
    // NEVER ARRIVED (null) and that the applied 1s floor was invented here —
    // reporting it as a genuine 1s cooldown is exactly the loss being guarded.
    markRateLimited(account.apiKey, undefined, null, 't');
    markRateLimited(account.apiKey, null, null, 't');

    const events = getRateLimitHistory();
    assert.equal(events.length, 2);
    // `undefined` triggers the default parameter, so that one is the 5min default.
    assert.equal(events[0].upstreamMs, 5 * 60 * 1000);
    // An explicit null defeats the default and reaches the ring as "no window".
    assert.equal(events[1].upstreamMs, null, 'a dropped reset window must not read as a real one');
    assert.equal(events[1].effectiveMs, 1000, 'the clamp floor is what actually got applied');
    assert.equal(events[1].clamped, true);
  });

  it('evicts the oldest event once the ring is at capacity', () => {
    const first = addTestAccount('rlh-first');
    const rest = addTestAccount('rlh-rest');
    // One event from `first`, then capacity-worth from `rest`: at 500 the ring
    // is full and event #501 must push `first`'s event out entirely.
    markRateLimited(first.apiKey);
    for (let i = 0; i < 500; i++) markRateLimited(rest.apiKey);

    const events = getRateLimitHistory();
    assert.equal(events.length, 500, 'ring is capped, not unbounded');
    assert.ok(
      events.every(e => e.accountId === rest.id),
      `the oldest event must be evicted, got first=${first.id} rest=${rest.id}`,
    );
  });

  it('surfaces the ring through the dashboard /rate-limit-history endpoint', async () => {
    // Convenience no-auth so this test exercises the route, not auth.
    config.dashboardPassword = '';
    config.apiKey = '';
    configureBindHost('127.0.0.1');
    process.env.DASHBOARD_ALLOW_NO_AUTH = '1';
    const { handleDashboardApi } = await import('../src/dashboard/api.js');
    const account = addTestAccount('rlh-dash');
    markRateLimited(account.apiKey, 60 * 1000, 'gemini-2.5-flash');

    const res = {
      statusCode: 0,
      body: '',
      writeHead(status) { this.statusCode = status; },
      end(chunk) { this.body += chunk ? String(chunk) : ''; },
      json() { return this.body ? JSON.parse(this.body) : null; },
    };
    const req = { url: '/dashboard/api/rate-limit-history', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    await handleDashboardApi('GET', '/rate-limit-history', {}, req, res);

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].accountId, account.id);
    assert.equal(body.events[0].upstreamMs, 60 * 1000);
  });
});
