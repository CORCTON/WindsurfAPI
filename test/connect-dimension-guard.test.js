// Structural guard: the `modelKey=null` trap on the DEVIN_CONNECT path.
//
// Connect selection always calls getApiKey(triedKeys, null, callerKey, selector)
// — modelKey is null because connect selectors live in a different namespace from
// the Cascade catalog. isRateLimitedForModel only consults _modelRateLimits when
// modelKey is truthy, so ANY per-model state written under the client-facing model
// name is structurally invisible to connect selection.
//
// This has now bitten three times:
//   #224  RATE_LIMITED wrote a model-scoped cooldown → pool re-picked the 429'd
//         account seconds later, hammering the upstream velocity limiter.
//   #230  the sticky binding had to be WRITTEN with modelKey=null or the lookup
//         (which asks for `caller\0*`) would silently never resolve.
//   v3.8.0 CAPACITY wrote its 60s cooldown under reqModelName → invisible, so the
//         window never applied and sticky re-pinned the overloaded account.
//
// These tests are the tripwire for a fourth occurrence: they assert the INVARIANT
// (a cooldown a connect request causes must gate a connect lookup), not the
// specific line that happened to be wrong.

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addAccountByKey, removeAccount, getAccountInternal,
  getApiKey, releaseAccountById, markRateLimited, markQuotaExhausted,
} from '../src/auth.js';

const created = [];
function seed(label) {
  const a = addAccountByKey(`devin-session-token$dim-${label}-${Math.random().toString(36).slice(2)}`, label);
  created.push(a.id);
  return getAccountInternal(a.id);
}
afterEach(() => { while (created.length) removeAccount(created.pop()); });

const SELECTOR = 'swe-1-6-slow';

describe('connect selection sees every cooldown a connect request can cause', () => {
  // The shape connect always uses. If a cooldown does not gate THIS call, the
  // pool will re-pick the account that just failed.
  const connectLookup = (excludeKeys = []) => getApiKey(excludeKeys, null, null, SELECTOR);

  // A cooled account may still come back as a DEGRADED serve when the whole pool
  // is throttled (auth.js pickDegradedFallback — the deliberate alternative to a
  // blanket 429). That is opt-in and clearly flagged. What must NEVER happen is a
  // NORMAL selection handing the cooled account back as if it were healthy.
  const assertNotNormallySelected = (picked, what) => {
    if (picked === null) return;
    assert.ok(picked._degraded,
      `${what} was handed back by normal selection — the cooldown is invisible to `
      + 'the connect lookup (modelKey=null). See #224 / v3.8.0 CAPACITY.');
    releaseAccountById(picked.id);
  };

  it('account-wide cooldown (RATE_LIMITED, #224) gates the connect lookup', () => {
    const a = seed('rl');
    markRateLimited(a.apiKey, 60_000, null, 'r');
    assertNotNormallySelected(connectLookup(), 'an account-wide cooldown');
  });

  it('selector-scoped cooldown (CAPACITY, v3.8.0) gates the connect lookup', () => {
    const a = seed('cap');
    markRateLimited(a.apiKey, 60_000, SELECTOR, 'c');
    assertNotNormallySelected(connectLookup(), 'a selector-scoped cooldown');
  });

  it('quota cooldown (QUOTA_EXHAUSTED) gates the connect lookup', () => {
    const a = seed('quota');
    markQuotaExhausted(a.apiKey, 60_000);
    assertNotNormallySelected(connectLookup(), 'a quota dry-well');
  });

  it('a healthy peer is preferred over any cooled account (no degraded serve needed)', () => {
    const cooled = seed('cooled');
    const healthy = seed('healthy');
    markRateLimited(cooled.apiKey, 60_000, SELECTOR, 'c');
    const picked = connectLookup();
    assert.ok(picked, 'the healthy peer must serve');
    assert.equal(picked.id, healthy.id, 'must not pick the cooled account while a healthy one exists');
    assert.ok(!picked._degraded, 'and it must be a normal serve, not a degraded one');
    releaseAccountById(picked.id);
  });

  it('a cooldown under the CLIENT-FACING model name is the trap — it must not be how connect state is written', () => {
    // This documents the failure mode rather than asserting it is fixed: writing
    // under a name connect never queries produces a cooldown that does nothing.
    // The guard below (source-level) is what prevents new code from doing this.
    const a = seed('trap');
    markRateLimited(a.apiKey, 60_000, 'gpt-5.5', 'c'); // a client-facing alias
    const picked = connectLookup();
    assert.ok(picked, 'demonstrates the trap: connect cannot see this dimension');
    releaseAccountById(picked.id);
  });
});

describe('source guard: finalizeConnectAccount never writes a client-facing model dimension', () => {
  const src = readFileSync(new URL('../src/handlers/chat.js', import.meta.url), 'utf8');
  const body = src.slice(
    src.indexOf('export function finalizeConnectAccount'),
    src.indexOf('async function waitForAccount'),
  );

  it('was located', () => assert.ok(body.length > 200, 'finalizeConnectAccount body not found'));

  it('every cooldown it writes uses null (account-wide) or the resolved selector', () => {
    const calls = body.match(/mark(?:RateLimited|QuotaExhausted)\([^)]*\)/g) || [];
    assert.ok(calls.length >= 3, `expected the cooldown calls, found ${calls.length}`);
    for (const call of calls) {
      // markQuotaExhausted has no model dimension at all — always fine.
      if (call.startsWith('markQuotaExhausted')) continue;
      const args = call.slice(call.indexOf('(') + 1, -1).split(',').map(s => s.trim());
      const dimension = args[2] ?? 'null';
      const ok = dimension === 'null'
        || dimension === 'undefined'
        || dimension.includes('selector');
      assert.ok(ok,
        `${call}\n  → writes cooldown dimension \`${dimension}\`, which connect selection `
        + '(modelKey=null) cannot see. Use null for account-wide, or the resolved '
        + 'connect selector. See #224 / v3.8.0 CAPACITY.');
    }
  });
});

describe('source guard: connect account acquisition keeps modelKey=null', () => {
  const src = readFileSync(new URL('../src/handlers/chat.js', import.meta.url), 'utf8');

  it('acquireConnectFailover passes null as modelKey', () => {
    const fn = src.slice(src.indexOf('function acquireConnectFailover'), src.indexOf('function connectFailoverMax'));
    assert.match(fn, /getApiKey\(triedKeys,\s*null,/,
      'connect failover must keep modelKey=null — the sticky binding and every '
      + 'cooldown dimension are written to match this lookup shape');
  });

  it('bindConnectSticky writes the binding with modelKey=null to match', () => {
    const fn = src.slice(src.indexOf('export function bindConnectSticky'), src.indexOf('// How many times a single DEVIN_CONNECT'));
    assert.match(fn, /setStickyBinding\(callerKey,\s*null,/,
      'a model-scoped write would land in a slot the connect lookup never asks for '
      + '(bindingKey is callerKey\\0(modelKey||"*")) — silently no-op, i.e. #230 regressed');
  });
});
