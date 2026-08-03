// stickyNoFallback could wedge a caller permanently.
//
// The flag means "do not rotate to another account" — refusing is the point, because
// rotating rewrites the whole per-account prompt cache. But the refusal was not
// recoverable: getApiKey returned null while LEAVING the binding in place, so every later
// request re-resolved the same dead binding and refused again, forever.
//
// Measured before the fix: bind a caller, disable the bound account, then four consecutive
// acquisitions all return null with the binding still present.
//
// The handoff recorded this as needing BOTH stickyBindByUserOnly and stickyNoFallback.
// Measured otherwise, and the exposure is therefore larger than recorded:
//
//   no flags                  → self-heals
//   stickyNoFallback ALONE    → WEDGES
//   stickyBindByUserOnly ALONE→ self-heals
//   both                      → wedges
//
// So one documented flag is enough. stickyBindByUserOnly is irrelevant to the wedge.
//
// The fix splits the two reasons an account can be unusable. Both halves are pinned here,
// because fixing only the first would silently turn the flag into a no-op.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Env before the first import: sticky-session reads STICKY_SESSION_* into module-load
// consts, and it must be the SAME instance auth.js imports statically — a fresh
// `import(...?query)` gets a separate binding table that getApiKey never reads.
process.env.STICKY_SESSION_ENABLED = '1';
process.env.STICKY_SESSION_TTL_MS = '60000';

const {
  addAccountByKey, removeAccount, getAccountInternal, getApiKey,
  setAccountStatus, markRateLimited,
} = await import('../src/auth.js');
const sticky = await import('../src/account/sticky-session.js');
const { setExperimental, isExperimentalEnabled } = await import('../src/runtime-config.js');

const CALLER = 'caller-wedge';
const SELECTOR = 'swe-1-6-slow';
const created = [];

function seedPool(n = 3) {
  for (let i = 0; i < n; i++) {
    const a = addAccountByKey('sk-wedge-' + i + '-' + Math.random().toString(36).slice(2, 10), 'w' + i);
    const acct = getAccountInternal(a.id);
    acct.status = 'active';
    acct.tier = 'pro';
    created.push(a.id);
  }
}

/** Bind CALLER to a freshly acquired account and return it. */
function bindFirst() {
  const first = getApiKey([], null, CALLER, SELECTOR);
  assert.ok(first, 'precondition: the pool must yield an account to bind');
  sticky.setStickyBinding(CALLER, null, first.id, first.apiKey, SELECTOR);
  return first;
}

beforeEach(() => {
  // setExperimental takes a PATCH OBJECT, not (key, value). Called with two args it
  // returns early and silently changes nothing — which made an earlier version of this
  // reproduction show all four flag combinations behaving identically.
  setExperimental({ stickyNoFallback: false, stickyBindByUserOnly: false });
  sticky.resetAllBindings();
  seedPool();
});

afterEach(() => {
  while (created.length) removeAccount(created.pop());
  sticky.resetAllBindings();
  setExperimental({ stickyNoFallback: false, stickyBindByUserOnly: false });
});

describe('stickyNoFallback: a structurally dead pin must not wedge', () => {
  it('clears the pin when the bound account is disabled', () => {
    setExperimental({ stickyNoFallback: true });
    assert.equal(isExperimentalEnabled('stickyNoFallback'), true, 'precondition: flag is on');

    const first = bindFirst();
    setAccountStatus(first.id, 'disabled');

    const next = getApiKey([], null, CALLER, SELECTOR);

    assert.ok(next, 'a caller must not be permanently unservable by a dead pin');
    assert.notEqual(next.id, first.id, 'and must be served by a different account');
    assert.equal(sticky.getStickyBinding(CALLER, null, SELECTOR), null,
      'the unresolvable binding must be cleared, not left to refuse again');
  });

  it('stays recoverable across repeated attempts', () => {
    // The wedge showed up as "every subsequent call refuses". Four attempts, because one
    // lucky success would not prove the loop is gone.
    setExperimental({ stickyNoFallback: true });
    const first = bindFirst();
    setAccountStatus(first.id, 'disabled');

    const results = [];
    for (let i = 0; i < 4; i++) results.push(getApiKey([], null, CALLER, SELECTOR));

    assert.equal(results.filter((r) => r === null).length, 0,
      `no attempt may return null; got ${results.filter((r) => r === null).length}/4 refusals`);
  });
});

describe('stickyNoFallback: a TRANSIENTLY unavailable pin must still refuse', () => {
  it('refuses and keeps the pin when the bound account is only rate-limited', () => {
    // The other half. If the fix cleared the pin here too, the flag would become a no-op
    // and every cooldown would rotate the caller — exactly the prompt-cache rewrite the
    // flag exists to prevent.
    setExperimental({ stickyNoFallback: true });
    const first = bindFirst();
    markRateLimited(first.apiKey, 60_000);

    const next = getApiKey([], null, CALLER, SELECTOR);

    assert.equal(next, null,
      'a temporarily cooling pin must be refused, not rotated — the caller should retry');
    assert.ok(sticky.getStickyBinding(CALLER, null, SELECTOR),
      'and the binding must survive, because it is still meaningful');
  });
});

describe('stickyNoFallback OFF keeps the original rotate-on-failure behaviour', () => {
  it('rotates and clears when the bound account dies', () => {
    const first = bindFirst();
    setAccountStatus(first.id, 'disabled');

    const next = getApiKey([], null, CALLER, SELECTOR);

    assert.ok(next, 'default behaviour serves the request');
    assert.equal(sticky.getStickyBinding(CALLER, null, SELECTOR), null, 'and clears the stale pin');
  });

  it('rotates rather than refusing when the bound account is merely cooling', () => {
    const first = bindFirst();
    markRateLimited(first.apiKey, 60_000);

    const next = getApiKey([], null, CALLER, SELECTOR);

    assert.ok(next, 'with the flag off a cooldown rotates instead of refusing');
    assert.notEqual(next.id, first.id);
  });
});

describe('stickyBindByUserOnly alone does not wedge', () => {
  it('self-heals when the bound account dies', () => {
    // Pins the handoff correction: this flag is irrelevant to the wedge, so a future
    // reader does not go looking for a two-flag precondition that never existed.
    setExperimental({ stickyBindByUserOnly: true });
    const first = bindFirst();
    setAccountStatus(first.id, 'disabled');

    const next = getApiKey([], null, CALLER, SELECTOR);

    assert.ok(next, 'stickyBindByUserOnly on its own must not be able to wedge');
  });
});
