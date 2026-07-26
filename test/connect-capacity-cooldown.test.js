// CAPACITY cooldown must actually gate DEVIN_CONNECT selection.
//
// Third occurrence of the structural trap #224 fixed for RATE_LIMITED: connect
// selection calls getApiKey(triedKeys, modelKey=null, callerKey, selector), and
// isRateLimitedForModel only consults _modelRateLimits when modelKey is truthy —
// so ANY model-scoped cooldown was invisible to the connect path and the pool
// re-picked the throttled account for the throttled model on the very next turn.
//
// Unlike #224 the fix is NOT to go account-wide (that benches a healthy account
// for every other model, which the CAPACITY branch explicitly avoids): the
// cooldown is written under the connect SELECTOR and selection checks that
// dimension too.

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey, removeAccount, getAccountInternal,
  getApiKey, releaseAccountById, markRateLimited,
} from '../src/auth.js';

const created = [];
function seed(label) {
  const a = addAccountByKey(`devin-session-token$cap-${label}-${Math.random().toString(36).slice(2)}`, label);
  created.push(a.id);
  return getAccountInternal(a.id);
}
afterEach(() => { while (created.length) removeAccount(created.pop()); });

const SELECTOR = 'swe-1-6-slow';

describe('CAPACITY cooldown visibility on the connect path', () => {
  it('a selector-scoped cooldown removes the account from connect selection', () => {
    const hot = seed('overloaded');
    // Exactly what finalizeConnectAccount's CAPACITY branch now writes.
    markRateLimited(hot.apiKey, 60 * 1000, SELECTOR, 'c');

    // Connect selection shape: modelKey=null + the resolved selector.
    const picked = getApiKey([], null, null, SELECTOR);
    assert.equal(picked, null,
      'the only account is cooled for this selector — connect must not re-pick it');
  });

  it('the cooled account is still served for a DIFFERENT selector (model dimension kept)', () => {
    const hot = seed('overloaded-2');
    markRateLimited(hot.apiKey, 60 * 1000, SELECTOR, 'c');

    const picked = getApiKey([], null, null, 'some-other-selector');
    assert.ok(picked, 'a cooldown for one selector must not bench the account globally');
    assert.equal(picked.id, hot.id);
    releaseAccountById(picked.id);
  });

  it('connect selection prefers the healthy peer over the cooled one', () => {
    const hot = seed('cooled');
    const healthy = seed('healthy');
    markRateLimited(hot.apiKey, 60 * 1000, SELECTOR, 'c');

    const picked = getApiKey([], null, null, SELECTOR);
    assert.ok(picked, 'the healthy peer must serve');
    assert.equal(picked.id, healthy.id, 'must not hand back the capacity-throttled account');
    releaseAccountById(picked.id);
  });

  it('a sticky-bound account that is capacity-cooled falls through instead of being re-pinned', async () => {
    // The sticky fast path must honor the selector dimension too — otherwise a
    // binding deterministically re-pins the exact overloaded account for the exact
    // overloaded selector, making the 60s window a guaranteed no-op.
    process.env.STICKY_SESSION_ENABLED = '1';
    const sticky = await import('../src/account/sticky-session.js');
    if (!sticky.isStickyEnabled()) return; // module-load const already false in this process

    sticky.resetAllBindings();
    const hot = seed('sticky-cooled');
    const healthy = seed('sticky-healthy');
    const caller = 'api:capacitycapacitycapacitycapacity:user:u1';
    sticky.setStickyBinding(caller, null, hot.id, hot.apiKey);
    markRateLimited(hot.apiKey, 60 * 1000, SELECTOR, 'c');

    const picked = getApiKey([], null, caller, SELECTOR);
    assert.ok(picked, 'must still serve via normal selection');
    assert.equal(picked.id, healthy.id, 'binding must not survive a selector cooldown');
    releaseAccountById(picked.id);
  });
});
