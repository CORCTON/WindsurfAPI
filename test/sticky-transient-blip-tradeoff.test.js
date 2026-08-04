// What a transient blip does to a pinned conversation — and why the obvious fix is wrong.
//
// When a sticky-bound account is momentarily unusable (RPM ceiling, cooling, maintenance),
// getApiKey CLEARS the pin and rotates. The success path then re-pins whatever served, so
// the conversation MIGRATES. That looks like a defect, and the backlog carried it as one
// ("RPM 满即清绑定") for several rounds.
//
// It was implemented as a fix — keep the pin on transient unavailability, suppress the
// rebind for the substitute turn — and then MEASURED, and it was net-negative in the very
// regime it targeted. Reverted. The numbers, full-prefix cache writes over 6 blocked turns:
//
//                              pool=4    pool=8
//     keep the pin              4         3      distinct accounts touched
//     clear it (today)          2         2
//
// The mechanism is structural, not incidental. Clearing CONVERGES: the substitute becomes
// the new pin, so every later turn reads its cache back. Keeping SCATTERS: each blocked turn
// re-enters normal selection, and the candidate sort ends on `lastUsed` ASCENDING, so the
// substitute that just served is pushed to the back and the next turn picks a different cold
// account. Measured sequence at pool=4: d→a→b→d→a→b.
//
// Keeping the pin only pays when the blip is shorter than the gap between turns, so the
// caller returns to the account holding the longest prefix. RPM windows are 60s and agentic
// turns are seconds apart, so a blocked caller normally stays blocked for MANY consecutive
// turns — the regime where keeping loses.
//
// The answer that does win is queue-on-pin: wait briefly for the pinned account instead of
// rotating at all (measured: 1 account touched). It needs the hook in an ASYNC caller since
// getApiKey is synchronous, and it caps a caller's throughput at one account's RPM — a
// latency-for-cache-cost tradeoff, i.e. a product decision. See docs/AUDIT-LEDGER.md.
//
// This file pins the CURRENT choice so that changing it is deliberate rather than accidental,
// the same way test/sticky-concurrency-tension.test.js pins the issue #37 spread. It is a
// record of a measured tradeoff, NOT a claim that today's behaviour is ideal.
//
// STICKY_SESSION_ENABLED is a module-load const, so it must be set before the first import.

process.env.STICKY_SESSION_ENABLED = '1';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const auth = await import('../src/auth.js');
const sticky = await import('../src/account/sticky-session.js');
const chat = await import('../src/handlers/chat.js');

const CALLER = 'api:cafebabecafebabecafebabecafebabe:user:blip-1';
const SELECTOR = 'swe-1-6-slow';

const created = [];
function seed(label) {
  const a = auth.addAccountByKey(
    `devin-session-token$bl-${label}-${Math.random().toString(36).slice(2)}`, label,
  );
  created.push(a.id);
  return auth.getAccountInternal(a.id);
}

/**
 * Put the account at its RPM ceiling, then PROVE it. rpmLimitFor is not exported, so the
 * count cannot be read; a fill that fell short would leave the account selectable, the
 * sticky hit would succeed, and every assertion below would pass without the blip path ever
 * running. TIER_RPM tops out at 60 (pro), so filling past that covers every tier.
 */
const RPM_CEILING_UPPER_BOUND = 60;
function blockOnRpm(acct) {
  const now = Date.now();
  acct._rpmHistory = [];
  for (let i = 0; i < RPM_CEILING_UPPER_BOUND + 1; i++) acct._rpmHistory.push(now - 1000 + i);
  // Probe without a callerKey so it takes no sticky path and cannot disturb the binding.
  const probe = auth.getApiKey([], null, null, SELECTOR);
  if (probe) auth.releaseAccountById(probe.id);
  assert.notEqual(probe?.id, acct.id,
    'harness precondition failed: the account is still selectable after filling its RPM '
    + 'window, so the blip path was never reached and these assertions would be vacuous');
}

beforeEach(() => { sticky.resetAllBindings(); created.length = 0; });
afterEach(() => { while (created.length) auth.removeAccount(created.pop()); });

/** One full turn: acquire as the connect path does, then run its success-path rebind. */
function turn() {
  const acct = auth.getApiKey([], null, CALLER, SELECTOR);
  if (!acct) return null;
  chat.bindConnectSticky(CALLER, acct, SELECTOR);
  auth.releaseAccountById(acct.id);
  return acct.id;
}

describe('a transient blip migrates the conversation, and the migration CONVERGES', () => {
  it('the pin is cleared and re-pointed at whatever served', () => {
    const A = seed('a');
    const B = seed('b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    blockOnRpm(A);

    const served = turn();
    assert.equal(served, B.id, 'the substitute serves this turn');
    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin, 'a pin must exist afterwards — the success path re-pins');
    assert.equal(pin.accountId, B.id,
      'today the pin follows the substitute. Changing this is a deliberate tradeoff, not a '
      + 'bug fix — keeping the pin instead was measured at 2x the cold accounts touched.');
  });

  it('later blocked turns REUSE that substitute instead of scattering', () => {
    // The load-bearing property. Convergence is what makes clearing cheaper than keeping:
    // one cache write, then reads. If this ever regresses to a different account per turn,
    // the cost model in this file's header no longer holds.
    const A = seed('conv-a');
    seed('conv-b');
    seed('conv-c');
    seed('conv-d');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);

    const servedBy = [];
    for (let t = 0; t < 6; t++) {
      blockOnRpm(A); // A stays blocked for the whole run
      const id = turn();
      assert.ok(id, `turn ${t} must be served`);
      servedBy.push(id);
    }

    const distinct = new Set(servedBy);
    assert.equal(distinct.size, 1,
      `6 blocked turns were served by ${distinct.size} different accounts (${[...distinct].join(', ')}). `
      + 'Each distinct account is a full-prefix cache WRITE (~5.6x a read, from the '
      + '17.8%-of-miss calibration in devin-connect.js), so convergence on '
      + 'ONE substitute is the property that makes clearing the pin the cheaper choice.');
    assert.notEqual(servedBy[0], A.id, 'and none of them is the blocked account');
  });

  it('the caller does NOT return to the original account after the window passes', () => {
    // Recorded, not endorsed. There is no return-home mechanism: the pin now points at the
    // substitute, and getStickyBinding refreshes lastAccess on every hit so it never ages
    // out while the conversation is active. This is the real cost of clearing, and the
    // reason the backlog item existed at all.
    const A = seed('home-a');
    seed('home-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    blockOnRpm(A);

    const away = turn();
    assert.notEqual(away, A.id, 'precondition: the blip diverted the turn');

    A._rpmHistory = []; // the window passes; nothing else about A changed
    const next = turn();
    assert.notEqual(next, A.id,
      'documented consequence: the conversation stays on the substitute. Queue-on-pin is '
      + 'what fixes this without the scatter — see this file\'s header.');
    assert.equal(next, away, 'and it stays on the SAME substitute, which is the convergence');
  });

  it('a structurally gone account also loses its pin (unchanged, and correct)', () => {
    // Included so a future change to the blip path cannot quietly alter this one: a pin that
    // can never resolve again must be cleared, or stickyNoFallback wedges (v3.9.11).
    const A = seed('gone-a');
    seed('gone-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    auth.setAccountStatus(A.id, 'disabled');

    const served = turn();
    assert.ok(served && served !== A.id, 'a disabled account cannot serve');
    const pin = sticky.getStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin && pin.accountId !== A.id, 'the dead pin must not survive');
  });

  it('the rotation is counted, so an operator can see it happening', () => {
    const A = seed('stat-a');
    seed('stat-b');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    blockOnRpm(A);

    const before = sticky.getStickyStats().fallbacks;
    turn();
    assert.equal(sticky.getStickyStats().fallbacks, before + 1,
      'a migration that no counter records is invisible in production — this is the only '
      + 'signal that a conversation just paid a cache rewrite');
  });
});
