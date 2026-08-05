// RESPONSE_STORE_TTL_MS is an IDLE timeout, not a retention bound.
//
// The TTL check reads `now - entry.lastAccess`, and every successful read does
// `entry.lastAccess = now`. That refresh is deliberate — an agent loop chaining off
// the same id must not have its context expire underneath it — but it meant nothing
// bounded how long a conversation was KEPT. A periodic GET /v1/responses/{id} held an
// entry alive without limit.
//
// MEASURED against the pre-fix code at RESPONSE_STORE_TTL_MS=120, polling every 40ms:
//     1020ms elapsed (8.5x the TTL), 25 successful reads, entry still alive
// and there was no knob of any kind that would have stopped it. (TTL also has no
// floor — `Number.isFinite(n) && n > 0` accepts 1ms — so it is a tuning dial, not a
// guarantee.)
//
// RESPONSE_STORE_MAX_AGE_MS is the bound that does not depend on read traffic: it is
// measured from createdAt, which no read refreshes. Default 24 hours; see the source
// for why the default is generous rather than small.
//
// This file makes the ABSOLUTE bound the only binding limit: idle timeout 1 hour,
// absolute bound 400ms. So an entry dying here can only have died of age.

process.env.RESPONSE_STORE_TTL_MS = '3600000';
process.env.RESPONSE_STORE_MAX_AGE_MS = '400';

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const store = await import('../src/response-store.js');

const A = 'api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:user:alice';
const CONV = [{ role: 'user', content: 'turn 1' }, { role: 'assistant', content: 'reply 1' }];
const MAX_AGE = 400;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

beforeEach(() => store.resetResponseStore());

// MUST BE THE FIRST TEST IN THIS FILE. ensureSweepTimer installs the interval on the
// first putResponse and never reinstalls it (resetResponseStore does not clear the
// timer), so mock.timers has to be enabled before any store write or it captures
// nothing. Declaring it first is what guarantees that — tests in one file run in
// declaration order. If someone puts a test above it the tick fires nothing, the
// entry survives, and the assertion below fails loudly rather than passing vacuously.
describe('the periodic sweep also enforces the absolute bound', () => {
  it('reaps an over-age entry that nobody ever reads back', () => {
    // The lookup path can only collect what is looked up. An abandoned conversation
    // is exactly what the sweep is for, and it must check the same two bounds — idle
    // alone would keep an over-age entry until someone happened to read it.
    // Here TTL is 1 hour and the tick is 5 minutes, so the entry is NOT idle-expired:
    // only the absolute bound can be what removes it.
    mock.timers.enable({ apis: ['setInterval', 'Date'] });
    try {
      store.putResponse('abandoned', CONV, A);
      assert.equal(store.getResponseStoreStats().size, 1, 'precondition: stored');
      mock.timers.tick(SWEEP_INTERVAL_MS + 1000);
      assert.equal(store.getResponseStoreStats().size, 0,
        `the sweep must drop an entry older than ${MAX_AGE}ms even though it is only `
        + '5 minutes idle against a 1 hour idle timeout');
      assert.equal(store.getResponseStoreStats().expires, 1, 'and count it as an expiry');
    } finally {
      mock.timers.reset();
    }
  });
});

describe('the absolute retention bound cannot be extended by reading', () => {
  it('continuous reads do not keep an entry alive past its absolute age', async () => {
    // The pre-fix behaviour reproduced exactly: read every 20ms and never stop. The
    // idle timeout is an hour here, so it cannot be what collects the entry.
    store.putResponse('polled', CONV, A);
    let reads = 0;
    let diedAfterMs = null;
    let deathReason = null;
    const t0 = Date.now();
    while (Date.now() - t0 < MAX_AGE * 5) {
      await sleep(20);
      const got = store.getResponse('polled', A);
      if (got.ok) { reads++; continue; }
      diedAfterMs = Date.now() - t0;
      // The reason from the read that FOUND it dead. A later read reports
      // 'not_found', because this one already reaped the entry.
      deathReason = got.reason;
      break;
    }
    assert.ok(reads > 0,
      'precondition: the entry must have been readable at first, and each read must have '
      + 'refreshed lastAccess — otherwise this proves nothing about the refresh');
    assert.notEqual(diedAfterMs, null,
      `a continuously-read entry survived ${MAX_AGE * 5}ms against a ${MAX_AGE}ms absolute `
      + 'bound — this is the defect: read-refresh made retention unbounded');
    assert.equal(deathReason, 'expired',
      'and it must be reported as expired, the same as an idle timeout');
    assert.equal(store.getResponseStoreStats().size, 0, 'the entry must actually be gone');
    assert.equal(store.getResponseStoreStats().expires, 1, 'and counted as an expiry');
  });

  it('the bound is reported to operators alongside the idle timeout', () => {
    // Two different answers to "how long is a conversation kept?", so the dashboard
    // must show both — the idle one alone tells an operator nothing about retention.
    const st = store.getResponseStoreStats();
    assert.equal(st.maxAgeMs, MAX_AGE, 'the env override must be honoured');
    assert.equal(st.ttlMs, 3600000, 'and the idle timeout reported separately');
  });

  it('a same-id refresh does not restart the absolute clock', async () => {
    // createdAt survives an overwrite (a later turn re-storing the same id keeps the
    // original creation time), so re-writing an id cannot be used to reset its age.
    store.putResponse('rewritten', CONV, A);
    await sleep(MAX_AGE / 2);
    store.putResponse('rewritten', [...CONV, { role: 'user', content: 'turn 2' }], A);
    assert.equal(store.getResponse('rewritten', A).ok, true,
      'precondition: still inside the bound after the rewrite');
    await sleep(MAX_AGE);
    assert.equal(store.getResponse('rewritten', A).ok, false,
      'the absolute age is measured from first creation, so a rewrite must not extend it');
  });

  it('a NEW id starts its own retention window — a real chain is unaffected', async () => {
    // Why the 24h default does not break long agent sessions: each turn mints a new
    // response id, so a chain never runs into the bound however long it lasts. What
    // the bound kills is the entry that is read but never superseded.
    store.putResponse('turn1', CONV, A);
    await sleep(MAX_AGE * 0.75);
    store.putResponse('turn2', [...CONV, { role: 'user', content: 'turn 2' }], A);
    await sleep(MAX_AGE * 0.5);
    assert.equal(store.getResponse('turn1', A).ok, false,
      'the first turn has aged out');
    assert.equal(store.getResponse('turn2', A).ok, true,
      'but the newer turn is still well inside its own window — the chain continues');
  });
});

describe('NEGATIVE CONTROL: an entry younger than the bound behaves normally', () => {
  it('a fresh entry resolves, with its conversation intact', () => {
    store.putResponse('young', CONV, A);
    const got = store.getResponse('young', A);
    assert.equal(got.ok, true);
    assert.deepEqual(got.messages, CONV,
      'the bound must not touch anything inside its window');
  });

  it('repeated reads inside the window all succeed', async () => {
    // The refresh behaviour itself is intact: the bound adds a ceiling, it does not
    // replace the idle timeout with an absolute-only rule.
    store.putResponse('inside', CONV, A);
    for (let i = 0; i < 5; i++) {
      await sleep(MAX_AGE / 10);
      assert.equal(store.getResponse('inside', A).ok, true,
        `read ${i + 1} inside the window must succeed`);
    }
    assert.equal(store.getResponseStoreStats().hits, 5);
  });

  it('deletion and stats still work unchanged', () => {
    store.putResponse('d', CONV, A);
    assert.equal(store.deleteResponse('d', A), true);
    assert.equal(store.getResponseStoreStats().size, 0);
  });
});
