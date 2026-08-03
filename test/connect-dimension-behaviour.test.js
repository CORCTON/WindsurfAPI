// The dimension guard checks SOURCE SHAPE, and shape is escapable.
//
// connect-dimension-guard.test.js slices chat.js between `finalizeConnectAccount`
// and `waitForAccount` and inspects the third argument of every mark* call in that
// text. Two ways past it, neither of which a source guard can see:
//   1. write the cooldown from a helper declared outside the slice;
//   2. move it into another module entirely.
// Either one leaves that suite green while the pool re-picks the throttled account.
//
// Its behavioural half does not close the gap either: every one of those tests (and
// connect-capacity-cooldown.test.js) writes the cooldown BY HAND via markRateLimited
// and then asserts auth.js honours it. That proves the auth-side dimension logic
// works. It says nothing about which dimension chat.js chooses — the thing that was
// actually wrong all three times (#224, #230, v3.8.0 CAPACITY).
//
// These tests drive the real `finalizeConnectAccount` with the production argument
// shape and assert the POOL OUTCOME. The cooldown may be written from anywhere, in
// any dimension, by any helper; what must hold is that a connect lookup stops
// handing back the account that just failed.
//
// The load-bearing detail is that `model` and `selector` DIFFER here. Production
// passes `{ model: reqModelName, selector }` — a client-facing alias ("gpt-5.5")
// and a resolved connect selector ("gpt-5-5-sol"). The existing tests pass the same
// string for both, so a cooldown written under `model` looks identical to one
// written under `selector` and the defect is unobservable. Splitting them is what
// makes the assertion able to fail.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey, removeAccount, getAccountInternal,
  getApiKey, releaseAccountById,
} from '../src/auth.js';
import { finalizeConnectAccount } from '../src/handlers/chat.js';

// A client-facing alias and the selector it resolves to. Deliberately different.
const CLIENT_MODEL = 'gpt-5.5';
const SELECTOR = 'gpt-5-5-sol';

const created = [];
function seed(label) {
  const a = addAccountByKey(
    `devin-session-token$dimb-${label}-${Math.random().toString(36).slice(2)}`, label,
  );
  created.push(a.id);
  return getAccountInternal(a.id);
}

beforeEach(() => { created.length = 0; });
afterEach(() => { while (created.length) removeAccount(created.pop()); });

/**
 * Fail a request through the real finalize path, exactly as chat.js calls it:
 * an acquire-time snapshot ({id, apiKey}) plus the client model and resolved
 * selector as separate fields.
 */
function failConnectRequest(acct, code, extra = {}) {
  const err = Object.assign(new Error(`simulated ${code}`), { code, ...extra });
  finalizeConnectAccount(
    { id: acct.id, apiKey: acct.apiKey },
    { model: CLIENT_MODEL, selector: SELECTOR, startTime: Date.now(), err },
  );
}

/** The lookup shape connect always uses: modelKey=null + the resolved selector. */
const connectLookup = (excludeKeys = []) => getApiKey(excludeKeys, null, null, SELECTOR);

/**
 * A cooled account may still come back as an explicitly-flagged DEGRADED serve
 * when the entire pool is throttled (auth.js pickDegradedFallback — the deliberate
 * alternative to a blanket 429). That is opt-in and visible. What must never happen
 * is NORMAL selection handing it back as if healthy.
 */
function assertNotNormallySelected(picked, what) {
  if (picked === null) return;
  assert.ok(picked._degraded,
    `${what} was handed back by normal connect selection — the cooldown landed in a `
    + 'dimension the connect lookup (modelKey=null, selector set) cannot see. '
    + 'See #224 / #230 / v3.8.0 CAPACITY.');
  releaseAccountById(picked.id);
}

/**
 * Guards against passing for the wrong reason. An account that got EVICTED
 * (status='error') is also absent from selection, so "not selected" alone would
 * pass even if the cooldown were never written. Each code under test is
 * explicitly non-punitive, so the account must still be healthy.
 */
function assertStillHealthy(acct, code) {
  const after = getAccountInternal(acct.id);
  assert.notEqual(after.status, 'error',
    `${code} evicted the account instead of cooling it. This test would then pass for `
    + 'the wrong reason: an evicted account is also unselectable.');
  return after;
}

describe('a cooldown finalizeConnectAccount writes is visible to connect selection', () => {
  // CAPACITY is the discriminating case: it is the one branch that writes a
  // MODEL-SCOPED cooldown, so it is the only one where `model` vs `selector`
  // changes the outcome. Writing it under CLIENT_MODEL lands it in a slot the
  // connect lookup never asks about — the v3.8.0 defect.
  it('CAPACITY cools the account against the SELECTOR, not the client-facing name', () => {
    const hot = seed('cap');
    failConnectRequest(hot, 'CAPACITY');
    assertStillHealthy(hot, 'CAPACITY');
    assertNotNormallySelected(connectLookup(), 'a capacity-throttled account');
  });

  it('CAPACITY prefers a healthy peer over the throttled account', () => {
    // The strongest form: with a healthy peer present there is no degraded-serve
    // ambiguity to hide behind.
    const hot = seed('cap-hot');
    const healthy = seed('cap-healthy');
    failConnectRequest(hot, 'CAPACITY');
    assertStillHealthy(hot, 'CAPACITY');

    const picked = connectLookup();
    assert.ok(picked, 'the healthy peer must serve');
    assert.equal(picked.id, healthy.id,
      'connect selection re-picked the capacity-throttled account while a healthy peer '
      + 'existed — the 60s window is a no-op');
    assert.ok(!picked._degraded, 'and it must be a normal serve, not a degraded one');
    releaseAccountById(picked.id);
  });

  it('CAPACITY leaves the account serving OTHER selectors (it is not benched pool-wide)', () => {
    // The counterpart assertion. Over-correcting to an account-wide cooldown would
    // satisfy every test above while benching a healthy account for every other
    // model — which the CAPACITY branch explicitly exists to avoid.
    const hot = seed('cap-scope');
    failConnectRequest(hot, 'CAPACITY');

    const picked = getApiKey([], null, null, 'some-unrelated-selector');
    assert.ok(picked, 'a selector-scoped cooldown must not bench the account globally');
    assert.equal(picked.id, hot.id);
    assert.ok(!picked._degraded, 'and for an unaffected selector it is a normal serve');
    releaseAccountById(picked.id);
  });

  it('RATE_LIMITED with an upstream reset window gates the connect lookup', () => {
    const hot = seed('rl-window');
    failConnectRequest(hot, 'RATE_LIMITED', { resetMs: 3 * 60 * 60 * 1000 });
    assertStillHealthy(hot, 'RATE_LIMITED');
    assertNotNormallySelected(connectLookup(), 'an account with an upstream reset window');
  });

  it('RATE_LIMITED without a reset window still gates the connect lookup (burst cooldown)', () => {
    const hot = seed('rl-burst');
    failConnectRequest(hot, 'RATE_LIMITED');
    assertStillHealthy(hot, 'RATE_LIMITED');
    assertNotNormallySelected(connectLookup(), 'a burst-cooled account');
  });

  it('QUOTA_EXHAUSTED gates the connect lookup', () => {
    const hot = seed('quota');
    failConnectRequest(hot, 'QUOTA_EXHAUSTED');
    assertStillHealthy(hot, 'QUOTA_EXHAUSTED');
    assertNotNormallySelected(connectLookup(), 'a quota-dry account');
  });

  it('a cooling code does not bench a healthy peer along with it', () => {
    // Cheap check that the cooldown is account-scoped, not a pool-wide flag.
    const hot = seed('scope-hot');
    const peer = seed('scope-peer');
    failConnectRequest(hot, 'RATE_LIMITED', { resetMs: 60_000 });

    const picked = connectLookup();
    assert.ok(picked, 'the peer must still serve');
    assert.equal(picked.id, peer.id);
    releaseAccountById(picked.id);
  });
});

describe('the harness actually drives the branch (meta-check)', () => {
  // Per the repro-attribution rule: a behavioural test that silently exercises
  // nothing passes forever. If finalizeConnectAccount no-opped — wrong id, changed
  // signature, snapshot key that resolves to no account — the assertions above
  // would fail rather than pass, so the direction is safe. This pins the mechanism
  // anyway, so a future failure says WHICH half broke.
  it('a non-cooling code leaves the account normally selectable', () => {
    // MODEL_BLOCKED is a tier wall: explicitly no cooldown, no penalty. If this
    // account were unselectable, the tests above would be measuring something
    // other than the cooldown.
    const a = seed('blocked');
    failConnectRequest(a, 'MODEL_BLOCKED');

    const picked = connectLookup();
    assert.ok(picked, 'a tier wall must not cool the account');
    assert.equal(picked.id, a.id);
    assert.ok(!picked._degraded,
      'MODEL_BLOCKED produced a degraded serve — something wrote a cooldown it should not');
    releaseAccountById(picked.id);
  });

  it('CAPACITY writes its cooldown under the selector dimension specifically', () => {
    // Diagnostic companion to the behavioural assertions: names the dimension so a
    // failure above points at the cause instead of just the symptom. Reads pool
    // state, not source text, so relocating the write does not fool it.
    const hot = seed('dim');
    failConnectRequest(hot, 'CAPACITY');
    const after = getAccountInternal(hot.id);
    const dims = Object.keys(after._modelRateLimits || {});

    assert.deepEqual(dims, [SELECTOR],
      `expected the cooldown under the resolved selector "${SELECTOR}", found `
      + `${JSON.stringify(dims)}. A cooldown under "${CLIENT_MODEL}" is the v3.8.0 defect: `
      + 'connect selection never asks about the client-facing name.');
    assert.ok(!after.rateLimitedUntil || after.rateLimitedUntil <= Date.now(),
      'CAPACITY must not set an account-wide cooldown — that benches the account for '
      + 'every other model, which this branch exists to avoid');
  });
});
