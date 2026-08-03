// A 60-second blip must not migrate a conversation permanently.
//
// getApiKey's sticky fast path rejects a bound account for several unrelated reasons in
// ONE conjunction (src/auth.js): RPM ceiling, cooling, maintenance, structurally gone,
// burned-this-request. v3.9.11 split those into "transient" vs "structural" — but only
// inside the isExperimentalEnabled('stickyNoFallback') branch. The DEFAULT path, which is
// what every deployment runs, still cleared the pin for all of them. Fifth occurrence of
// "the fix covered only some of the paths" in this repo.
//
// Clearing is not a cheap mistake, because there is no return-home mechanism: the success
// path re-pins whatever account served the substitute turn, so ONE blip migrates the
// conversation for good. Measured before the fix: six successive blips walked a caller
// A→D→C→D→C→D→C and never came back to A, each hop paying a fresh per-account prompt-cache
// WRITE (~10x a read). It is self-reinforcing too — the sticky fast path pushes a
// reservation on every hit, so a pinned caller's own traffic is what drives its account
// toward the ceiling, and the ceilings are low (pro 60/min, unknown-tier 20/min).
//
// The fix has two halves and BOTH are load-bearing:
//   1. keep the pin when the bound account is only transiently unavailable;
//   2. suppress the success-path rebind for that turn, via _stickyRotated.
// Without (2), the substitute account is written over the preserved pin and (1) is a
// no-op — setStickyBinding overwrites unconditionally, with no log line and no stat, so
// the failure would be invisible. Each half is pinned separately below.
//
// The classification of excludeKeys is deliberate and tested here as well: it expires
// with the request, yet it belongs with STRUCTURAL. A key is in triedKeys because it
// FAILED this request, and the failure class that reaches here is the dead token —
// reportDeadToken records only a health event, so the account stays 'active' with no
// cooldown and excludeKeys is the only thing excluding it. Keeping that pin would
// re-resolve a known-bad account next turn (test/sticky-exclude-keys.test.js).
//
// STICKY_SESSION_ENABLED is read into a module-load const, so it must be set before the
// first import. node:test gives each file its own process, so setting it here is enough.

process.env.STICKY_SESSION_ENABLED = '1';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const auth = await import('../src/auth.js');
const sticky = await import('../src/account/sticky-session.js');
const chat = await import('../src/handlers/chat.js');

// hasPerUserScope requires a `:user:` segment — a bare api:<hash> is N end users behind
// one key and bindConnectSticky deliberately refuses to bind it.
const CALLER = 'api:cafebabecafebabecafebabecafebabe:user:transient-1';
const SELECTOR = 'swe-1-6-slow';

const created = [];
function seed(label) {
  const a = auth.addAccountByKey(
    `devin-session-token$tp-${label}-${Math.random().toString(36).slice(2)}`, label,
  );
  created.push(a.id);
  return auth.getAccountInternal(a.id);
}

/**
 * Drive the account to its RPM ceiling without touching status or cooldowns.
 *
 * rpmLimitFor is NOT exported from auth.js, so the limit cannot be read directly and
 * must not be guessed either: a hardcoded count that silently falls SHORT of the real
 * ceiling would leave the account usable, the sticky hit would succeed, and every
 * "the pin survived" assertion below would pass without the transient arm ever running.
 * TIER_RPM tops out at 60 (pro), so filling past that covers every tier — and the
 * fill is then VERIFIED by observation rather than trusted.
 */
const RPM_CEILING_UPPER_BOUND = 60;
function fillRpm(acct) {
  const now = Date.now();
  acct._rpmHistory = [];
  for (let i = 0; i < RPM_CEILING_UPPER_BOUND + 1; i++) acct._rpmHistory.push(now - 1000 + i);

  // Prove the account really is unusable now. Asked WITHOUT a callerKey, so this probe
  // takes no sticky path and cannot disturb the binding under test.
  const probe = auth.getApiKey([], null, null, SELECTOR);
  if (probe) auth.releaseAccountById(probe.id);
  assert.notEqual(probe?.id, acct.id,
    'harness precondition failed: the account is still selectable after filling its RPM '
    + 'window, so the transient arm would never be reached and the assertions that follow '
    + 'would pass vacuously');
  return acct._rpmHistory.length;
}

beforeEach(() => { sticky.resetAllBindings(); created.length = 0; });
afterEach(() => { while (created.length) auth.removeAccount(created.pop()); });

const lookup = (excludeKeys = []) => auth.getApiKey(excludeKeys, null, CALLER, SELECTOR);

describe('a transiently unavailable bound account keeps its pin', () => {
  it('RPM ceiling: this turn rotates, the pin survives', () => {
    const A = seed('rpm-a');
    const B = seed('rpm-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    fillRpm(A);

    const served = lookup();
    assert.ok(served, 'the pool must still serve the turn');
    assert.equal(served.id, B.id, 'the substitute serves while A is at its ceiling');
    auth.releaseAccountById(served.id);

    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin, 'the pin must NOT be cleared over a 60s RPM window');
    assert.equal(pin.accountId, A.id, 'and it must still point at A, not the substitute');
  });

  it('the caller RETURNS to its account once the window passes', () => {
    // The assertion that actually matters. Everything else is mechanism.
    const A = seed('home-a');
    seed('home-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    fillRpm(A);

    const away = lookup();
    assert.notEqual(away.id, A.id, 'precondition: the blip did divert this turn');
    auth.releaseAccountById(away.id);

    // The window passes: RPM history ages out. Nothing else about A changed.
    A._rpmHistory = [];
    const home = lookup();
    assert.equal(home.id, A.id, 'the conversation must come home to A');
    assert.equal(home._sticky, true, 'and via the binding, not a sort coincidence');
    auth.releaseAccountById(home.id);
  });

  it('cooling: the pin survives a selector-scoped cooldown', () => {
    const A = seed('cool-a');
    seed('cool-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    auth.markRateLimited(A.apiKey, 60_000, SELECTOR, 'c');

    const served = lookup();
    assert.ok(served && served.id !== A.id, 'the substitute serves while A cools');
    auth.releaseAccountById(served.id);
    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin && pin.accountId === A.id, 'a cooldown has an expiry — keep the pin');
  });

  it('cooling: the pin survives an account-wide cooldown', () => {
    const A = seed('coolw-a');
    seed('coolw-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    auth.markRateLimited(A.apiKey, 60_000, null, 'r');

    const served = lookup();
    assert.ok(served && served.id !== A.id, 'the substitute serves');
    auth.releaseAccountById(served.id);
    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin && pin.accountId === A.id, 'account-wide cooldowns expire too');
  });

  it('the fallback is still counted, so operators can see the rotation', () => {
    const A = seed('stat-a');
    seed('stat-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    fillRpm(A);

    const before = sticky.getStickyStats().fallbacks;
    const served = lookup();
    auth.releaseAccountById(served.id);
    assert.equal(sticky.getStickyStats().fallbacks, before + 1,
      'keeping the pin must not make the rotation invisible to monitoring');
  });
});

describe('a structurally unusable bound account still loses its pin', () => {
  // The counterpart. Over-correcting here recreates the v3.9.11 wedge: a pin that can
  // never resolve again, re-resolved and refused forever.
  it('removed from the pool: the pin is cleared', () => {
    const A = seed('gone-a');
    seed('gone-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    auth.removeAccount(A.id);
    created.splice(created.indexOf(A.id), 1);

    const served = lookup();
    assert.ok(served, 'the pool must serve');
    auth.releaseAccountById(served.id);
    assert.equal(sticky.getStickyBinding(CALLER, null, SELECTOR), null,
      'a binding that can never resolve again must be cleared, not preserved');
  });

  it('disabled: the pin is cleared', () => {
    const A = seed('dis-a');
    seed('dis-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    auth.setAccountStatus(A.id, 'disabled');

    const served = lookup();
    assert.ok(served, 'the pool must serve');
    auth.releaseAccountById(served.id);
    assert.equal(sticky.getStickyBinding(CALLER, null, SELECTOR), null,
      'a non-active account cannot be returned to — clear the pin');
  });

  it('burned this request (dead token in excludeKeys): the pin is cleared', () => {
    // excludeKeys expires with the request but is NOT transient in the sense that
    // matters: the account failed THIS request. A dead token leaves it 'active' with no
    // cooldown, so keeping the pin would re-resolve a known-bad account next turn.
    const A = seed('burn-a');
    seed('burn-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    auth.reportDeadToken(A.apiKey);
    assert.equal(auth.getAccountInternal(A.id).status, 'active',
      'precondition: one dead token leaves the account active with no cooldown');

    const served = lookup([A.apiKey]);
    assert.ok(served && served.id !== A.id, 'the hop must land elsewhere');
    auth.releaseAccountById(served.id);
    assert.equal(sticky.getStickyBinding(CALLER, null, SELECTOR), null,
      'a key burned this request must not stay pinned');
  });
});

describe('the rebind is suppressed for the substitute turn', () => {
  // Half 2. Without this the preserved pin is silently overwritten and half 1 is a no-op.
  it('bindConnectSticky refuses to write when the account is a substitute', () => {
    const A = seed('sub-a');
    const B = seed('sub-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    fillRpm(A);

    const served = lookup();
    assert.equal(served.id, B.id, 'precondition: B substituted for A');
    assert.equal(served._stickyRotated, true,
      'the returned account must carry the marker, or no write path can tell');

    // Exactly what the connect success path does.
    chat.bindConnectSticky(CALLER, served, SELECTOR);
    auth.releaseAccountById(served.id);

    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin, 'the pin must survive the success path');
    assert.equal(pin.accountId, A.id,
      'the substitute was written over the preserved pin — half 1 is a no-op without this');
  });

  it('an ordinary served account has no marker and DOES rebind', () => {
    // Guards against over-correction: suppressing every rebind would break affinity
    // entirely, and would do it silently.
    const A = seed('norm-a');
    sticky.resetAllBindings();

    const served = auth.getApiKey([], null, CALLER, SELECTOR);
    assert.ok(served, 'a first acquisition with no pin must succeed');
    assert.equal(served._stickyRotated, undefined,
      'no pin existed, so nothing was rotated off — the marker must be absent');

    chat.bindConnectSticky(CALLER, served, SELECTOR);
    auth.releaseAccountById(served.id);

    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin, 'the ordinary success path must still create the binding');
    assert.equal(pin.accountId, A.id, 'and it pins the account that served');
  });

  it('a normal sticky HIT still refreshes rather than being treated as a rotation', () => {
    const A = seed('hit-a');
    seed('hit-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);

    const served = lookup();
    assert.equal(served.id, A.id, 'precondition: a clean sticky hit');
    assert.equal(served._sticky, true);
    assert.equal(served._stickyRotated, undefined,
      'a hit is not a rotation — marking it would suppress every legitimate refresh');
    chat.bindConnectSticky(CALLER, served, SELECTOR);
    auth.releaseAccountById(served.id);

    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.equal(pin.accountId, A.id, 'still pinned to A');
  });
});

describe('stickyNoFallback keeps its own behaviour', () => {
  // The flag branch already had this split. Its semantics are different — it REFUSES
  // rather than rotating — and must not be collapsed into the default path.
  it('the transient arm of the flag still refuses instead of rotating', async () => {
    const rc = await import('../src/runtime-config.js');
    // setExperimental takes a PATCH OBJECT, not (key, value) — passing two args is a
    // silent no-op that would make this test pass without exercising the flag.
    rc.setExperimental({ stickyNoFallback: true });
    try {
      assert.equal(rc.isExperimentalEnabled('stickyNoFallback'), true,
        'precondition: the flag must actually be on, or this test proves nothing');
      const A = seed('nf-a');
      seed('nf-b');
      sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
      fillRpm(A);

      const served = lookup();
      assert.equal(served, null,
        'stickyNoFallback refuses rather than rotating — that is the point of the flag');
      assert.ok(sticky.getStickyBinding(CALLER, null, SELECTOR),
        'and the pin is kept so the caller can retry');
    } finally {
      rc.setExperimental({ stickyNoFallback: false });
    }
  });
});
