import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isConnectSelectorAllowedForAccount } from '../src/auth.js';
import { FREE_REACHABLE_SELECTORS } from '../src/devin-connect-models.js';

// A paid connect selector (e.g. a fable) routed to a free-tier account gets an
// upstream permission_denied (surfaced to the client as an opaque 529). The
// connect path historically selected accounts with modelKey=null (no filter),
// because the Cascade catalog filter (isModelAllowedForAccount) is a different
// namespace and would wrongly exclude EVERY account (even pro) for a connect
// selector. isConnectSelectorAllowedForAccount is the connect-namespace filter
// that keeps a paid selector off a free account without breaking pro.

describe('isConnectSelectorAllowedForAccount — connect-namespace entitlement', () => {
  const free = { tier: 'free' };
  const pro = { tier: 'pro' };
  const unknown = { tier: '' };        // unprobed new account
  const expired = { tier: 'expired' };

  it('free-reachable selector (swe-1-6-slow) is allowed on any account', () => {
    for (const sel of FREE_REACHABLE_SELECTORS) {
      assert.equal(isConnectSelectorAllowedForAccount(free, sel), true, `free ${sel}`);
      assert.equal(isConnectSelectorAllowedForAccount(pro, sel), true, `pro ${sel}`);
    }
  });

  it('#258 drought-safe selectors stay blocked on a free account', () => {
    // Drought allowlist must not leak into entitlement. swe-1-7 is weekly-
    // quota-exempt on Pro; unpaid accounts still get /upgrade.
    assert.equal(isConnectSelectorAllowedForAccount(free, 'swe-1-7'), false);
    assert.equal(isConnectSelectorAllowedForAccount(free, 'swe-1-7-medium'), false);
    assert.equal(isConnectSelectorAllowedForAccount(free, 'glm-5-2'), false);
    assert.equal(isConnectSelectorAllowedForAccount(pro, 'swe-1-7'), true);
  });

  it('paid selector (fable) is BLOCKED on a free account', () => {
    assert.equal(isConnectSelectorAllowedForAccount(free, 'claude-5-fable-medium'), false);
    assert.equal(isConnectSelectorAllowedForAccount(free, 'claude-opus-4-8-medium'), false);
  });

  it('paid selector is ALLOWED on a pro account', () => {
    assert.equal(isConnectSelectorAllowedForAccount(pro, 'claude-5-fable-medium'), true);
    assert.equal(isConnectSelectorAllowedForAccount(pro, 'claude-opus-4-8-medium'), true);
  });

  it('unprobed (unknown tier) account is optimistically allowed a paid selector', () => {
    // Self-heals: after a probe it becomes 'free' and then gets blocked. This
    // preserves pre-GetUserStatus behaviour (no false-negative on new accounts).
    assert.equal(isConnectSelectorAllowedForAccount(unknown, 'claude-5-fable-medium'), true);
  });

  it('expired account is blocked from a paid selector', () => {
    assert.equal(isConnectSelectorAllowedForAccount(expired, 'claude-5-fable-medium'), false);
  });

  it('operator blocklist excludes the selector even on a pro account', () => {
    const proBlocked = { tier: 'pro', blockedModels: ['claude-5-fable-medium'] };
    assert.equal(isConnectSelectorAllowedForAccount(proBlocked, 'claude-5-fable-medium'), false);
    // a different selector is still allowed
    assert.equal(isConnectSelectorAllowedForAccount(proBlocked, 'claude-opus-4-8-medium'), true);
  });

  it('no selector → no filter (back-compat)', () => {
    assert.equal(isConnectSelectorAllowedForAccount(free, null), true);
    assert.equal(isConnectSelectorAllowedForAccount(free, ''), true);
  });
});
