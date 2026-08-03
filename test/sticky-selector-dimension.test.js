// Sticky bindings need a SELECTOR dimension, not just (caller, modelKey).
//
// The connect path acquires accounts with modelKey=null, so the binding has to be
// written with null in the model dimension too or the lookup never resolves. With only
// two dimensions that meant every connect selector of one caller shared the single slot
// `callerKey\0*`: a caller alternating between a free-reachable and a paid selector
// cleared and re-created that one slot on every request and got ZERO affinity — the
// exact prompt-cache rewrite cost sticky binding exists to prevent.
//
// These tests pin that the two namespaces stay separate. Cascade uses the model
// dimension with selector=null; connect uses the selector dimension with modelKey=null.
// Collapsing them into one dimension makes those collide.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// sticky-session.js reads STICKY_SESSION_ENABLED / _TTL_MS into module-load `const`s,
// so the env has to be set BEFORE the import — hence a fresh import per test on a
// busted module cache. Same pattern as sticky-session.test.js. A static import with
// env set in beforeEach yields ENABLED=false and every mutator is inert, which makes
// all of these fail for a reason unrelated to what they assert.
async function loadFresh() {
  process.env.STICKY_SESSION_ENABLED = '1';
  process.env.STICKY_SESSION_TTL_MS = '60000';
  const stamp = Date.now() + ':' + Math.random();
  return import(`../src/account/sticky-session.js?fresh=${stamp}`);
}

const CALLER = 'caller-selector-dim';
const OTHER_CALLER = 'caller-other';
const FREE_SEL = 'swe-1-6-slow';
const PAID_SEL = 'claude-opus-4-8-medium';


describe('sticky binding selector dimension', () => {
  it('holds one binding per selector for the same caller', async () => {
    const m = await loadFresh();
    m.setStickyBinding(CALLER, null, 'acct-free', 'sk-free', FREE_SEL);
    m.setStickyBinding(CALLER, null, 'acct-paid', 'sk-paid', PAID_SEL);

    assert.equal(m.getStickyBinding(CALLER, null, FREE_SEL)?.accountId, 'acct-free');
    assert.equal(m.getStickyBinding(CALLER, null, PAID_SEL)?.accountId, 'acct-paid',
      'the second selector must not have evicted the first — that is the whole defect');
  });

  it('does not let a second selector overwrite the first', async () => {
    const m = await loadFresh();
    // Directly pins the eviction the two-dimension key caused: with one shared slot
    // the second write replaced the first and the caller lost its account.
    m.setStickyBinding(CALLER, null, 'acct-A', 'sk-A', FREE_SEL);
    const beforeAccount = m.getStickyBinding(CALLER, null, FREE_SEL)?.accountId;
    m.setStickyBinding(CALLER, null, 'acct-B', 'sk-B', PAID_SEL);

    assert.equal(beforeAccount, 'acct-A');
    assert.equal(m.getStickyBinding(CALLER, null, FREE_SEL)?.accountId, 'acct-A',
      'writing a different selector must leave the first selector\'s binding alone');
  });

  it('keeps the Cascade model dimension separate from the connect selector dimension', async () => {
    const m = await loadFresh();
    // Cascade writes a real modelKey with no selector; connect writes a real selector
    // with modelKey=null. If the two were folded into one dimension these would collide.
    m.setStickyBinding(CALLER, 'opus', 'acct-cascade', 'sk-cascade');
    m.setStickyBinding(CALLER, null, 'acct-connect', 'sk-connect', FREE_SEL);

    assert.equal(m.getStickyBinding(CALLER, 'opus')?.accountId, 'acct-cascade');
    assert.equal(m.getStickyBinding(CALLER, null, FREE_SEL)?.accountId, 'acct-connect');
  });

  it('a selector-scoped binding does NOT satisfy a bare two-arg lookup', async () => {
    const m = await loadFresh();
    // The API footgun this dimension introduces, pinned deliberately: a 2-arg lookup
    // reads `caller\0*\0*`, a DIFFERENT slot from what the connect path writes. Callers
    // must pass the selector — getApiKey does, which is why production resolves.
    m.setStickyBinding(CALLER, null, 'acct-connect', 'sk-connect', FREE_SEL);

    assert.equal(m.getStickyBinding(CALLER, null), null,
      'the wildcard slot must stay empty when a selector-scoped binding was written');
    assert.ok(m.getStickyBinding(CALLER, null, FREE_SEL));
  });

  it('clears only the selector it was asked to clear', async () => {
    const m = await loadFresh();
    m.setStickyBinding(CALLER, null, 'acct-free', 'sk-free', FREE_SEL);
    m.setStickyBinding(CALLER, null, 'acct-paid', 'sk-paid', PAID_SEL);

    m.clearStickyBinding(CALLER, null, FREE_SEL);

    assert.equal(m.getStickyBinding(CALLER, null, FREE_SEL), null);
    assert.equal(m.getStickyBinding(CALLER, null, PAID_SEL)?.accountId, 'acct-paid',
      'clearing one selector must not disturb another');
  });

  it('keeps different callers separate on the same selector', async () => {
    const m = await loadFresh();
    m.setStickyBinding(CALLER, null, 'acct-1', 'sk-1', FREE_SEL);
    m.setStickyBinding(OTHER_CALLER, null, 'acct-2', 'sk-2', FREE_SEL);

    assert.equal(m.getStickyBinding(CALLER, null, FREE_SEL)?.accountId, 'acct-1');
    assert.equal(m.getStickyBinding(OTHER_CALLER, null, FREE_SEL)?.accountId, 'acct-2');
  });

  it('re-binding the same selector replaces that slot rather than adding one', async () => {
    const m = await loadFresh();
    m.setStickyBinding(CALLER, null, 'acct-A', 'sk-A', FREE_SEL);
    const afterFirst = m.getStickyStats().size;
    m.setStickyBinding(CALLER, null, 'acct-B', 'sk-B', FREE_SEL);

    assert.equal(m.getStickyBinding(CALLER, null, FREE_SEL)?.accountId, 'acct-B',
      'the newest account for a selector wins');
    assert.equal(m.getStickyStats().size, afterFirst,
      'a re-bind must not grow the table — otherwise the selector dimension leaks slots');
  });
});
