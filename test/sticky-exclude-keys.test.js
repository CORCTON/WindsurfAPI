// Sticky fast path vs. excludeKeys (failover regression).
//
// getApiKey's sticky fast path used to return the bound account WITHOUT
// consulting excludeKeys. The hole was dead code while nothing wrote bindings
// on the DEVIN_CONNECT path, but the moment a binding exists it traps every
// failover hop: acquireConnectFailover passes triedKeys (the keys already
// burned this request), the fast path hands the same dead account back on
// every hop, the loop exhausts maxHops on one account and surfaces 401 while
// healthy accounts sit idle — and the repeated reportError calls disable the
// bound account as collateral.
//
// Dead tokens are the one failure class that hits this: QUOTA_EXHAUSTED writes
// quotaResetAt and RATE_LIMITED writes rateLimitedUntil (both visible to the
// fast path's health checks), but a first UNAUTHORIZED only records a health
// event — the account stays 'active' with no cooldown, so only excludeKeys can
// keep it out.
//
// ⚠️ sticky-session.js reads STICKY_SESSION_ENABLED into a module-load const,
// so the env must be set before the first import. node:test runs each file in
// its own process, so setting it at the top of this file is enough.

process.env.STICKY_SESSION_ENABLED = '1';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const auth = await import('../src/auth.js');
const sticky = await import('../src/account/sticky-session.js');

const CALLER = 'api:deadbeefdeadbeefdeadbeefdeadbeef:user:abc123';
const created = [];

function seed(label) {
  const a = auth.addAccountByKey(`devin-session-token$xk-${label}-${Math.random().toString(36).slice(2)}`, label);
  created.push(a.id);
  return auth.getAccountInternal(a.id);
}

describe('sticky fast path honors excludeKeys', () => {
  before(() => sticky.resetAllBindings());
  beforeEach(() => sticky.resetAllBindings());
  after(() => { while (created.length) auth.removeAccount(created.pop()); });

  it('failover lookup must not re-hand the bound account already in triedKeys', () => {
    const A = seed('bound');
    const B = seed('healthy-b');
    const C = seed('healthy-c');

    // Connect-path shape: binding written with modelKey=null (caller\0* slot).
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey);

    // First acquire of the turn — sticky HIT is the intended behavior.
    const first = auth.getApiKey([], null, CALLER, null);
    assert.equal(first.id, A.id, 'clean acquire must honor the binding');
    auth.releaseAccountById(first.id);

    // A's token turns out dead. One dead token leaves the account 'active'
    // with zero cooldown (reportDeadToken = health event; reportError needs a
    // 3-streak) — precisely the state where only excludeKeys can exclude it.
    auth.reportDeadToken(A.apiKey);
    auth.reportError(A.apiKey);
    assert.equal(auth.getAccountInternal(A.id).status, 'active',
      'precondition: one dead token must not disable the account');

    // The failover hop passes the burned key. Pre-fix this returned A again.
    const hop = auth.getApiKey([A.apiKey], null, CALLER, null);
    assert.ok(hop, 'failover must find a fresh account');
    assert.notEqual(hop.id, A.id, 'must not re-hand the excluded bound account');
    assert.ok([B.id, C.id].includes(hop.id), 'must hop to a healthy pool member');
    auth.releaseAccountById(hop.id);

    // The stale binding must be gone so the NEXT turn doesn't loop either.
    assert.equal(sticky.getStickyBinding(CALLER, null), null,
      'excluded binding must be cleared, not preserved');
  });

  it('a binding excluded mid-request does not block normal selection re-binding later', () => {
    const A = seed('bound-2');
    const B = seed('healthy-2');

    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey);
    const hop = auth.getApiKey([A.apiKey], null, CALLER, null);
    assert.ok(hop && hop.id !== A.id, 'hop must land on some non-excluded account');
    auth.releaseAccountById(hop.id);

    // Success-path rebind (what bindConnectSticky does) → next turn pins the
    // account that actually served, regardless of what the pool sort preferred.
    sticky.setStickyBinding(CALLER, null, B.id, B.apiKey);
    const next = auth.getApiKey([], null, CALLER, null);
    assert.equal(next.id, B.id, 'rebound account owns the next turn');
    assert.equal(next._sticky, true, 'and it is a sticky hit, not a sort coincidence');
    auth.releaseAccountById(next.id);
  });
});
