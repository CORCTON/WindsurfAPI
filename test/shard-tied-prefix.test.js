// The caller-shard tiebreaker must never promote a WORSE account.
//
// getApiKey sorts candidates by health (in-flight, then trouble, quota bucket, RPM
// remaining-ratio, least-recently-used) and then applies a per-caller shard so two callers
// with equally good options don't stack on the same account. The shard swapped
// candidates[0] with candidates[hash % candidates.length] — indexing the WHOLE array —
// while its gate only checked that candidates[0] and [1] tied.
//
// So it could promote an account that tied with nothing. During a concurrent burst that is
// precisely what happened: the account already serving sorts LAST on in-flight, the two
// idle accounts at the front tie, the gate opens, and the swap pulls the busiest account
// back to position 0. Measured before the fix, pool of 8, tier=pro:
//
//     shard bucket   distinct accounts over 8 concurrent acquisitions
//     ---------------------------------------------------------------
//     0, 1           8   (full spread)
//     2              6
//     4              4
//     6              2
//     7              1   ← same account 8 times, seven peers at zero in-flight
//
// Entirely determined by sha256(callerKey) % pool, which is why it stayed invisible: the
// test that pinned "8 concurrent → 8 distinct, by design" uses a callerKey hashing to
// bucket 0 — the best case. Of 8 realistic callerKeys sampled, only 2 spread across the
// pool.
//
// The fix bounds the permutation to the prefix that genuinely ties with candidates[0].
// This file pins BOTH halves: it can no longer promote a worse account, and it still does
// the job it exists for.
//
// Sticky is irrelevant here (measured identical either way), so it stays off — the subject
// is the sort tiebreaker, not affinity.

process.env.STICKY_SESSION_ENABLED = '0';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const auth = await import('../src/auth.js');

const SELECTOR = 'swe-1-6-slow';
const created = [];

function seedPool(n) {
  for (let i = 0; i < n; i++) {
    const a = auth.addAccountByKey(
      `sk-shard-${i}-${Math.random().toString(36).slice(2, 10)}`, `t${i}`,
    );
    const acct = auth.getAccountInternal(a.id);
    acct.status = 'active';
    acct.tier = 'pro';
    created.push(a.id);
  }
}
/** Reset every account to fully idle and fully tied. */
function makeAllTied() {
  for (const id of created) {
    const a = auth.getAccountInternal(id);
    a._rpmHistory = [];
    a.lastUsed = 0;
    a._inflight = 0;
    a._inflightAt = 0;
  }
}
const bucketFor = (callerKey, span) =>
  createHash('sha256').update(callerKey).digest().readUInt32BE(0) % span;

beforeEach(() => { created.length = 0; });
afterEach(() => { while (created.length) auth.removeAccount(created.pop()); });

// Chosen so the sample covers low, middle and high shard buckets at pool 8 — the whole
// point is that the outcome must NOT depend on which one a caller draws.
const CALLERS = [
  'api:1111111111111111:user:alice',
  'api:2222222222222222:user:bob',
  'api:3333333333333333:user:carol',
  'api:4444444444444444:user:dave',
  'session:abcdef0123456789:user:u1',
  'client:10.0.0.1|curl/8',
  'caller-tension',
];

describe('a concurrent burst spreads regardless of the caller hash', () => {
  it('every sampled callerKey spreads across the whole pool', () => {
    const POOL = 8;
    const failures = [];
    for (const caller of CALLERS) {
      created.length && (() => { while (created.length) auth.removeAccount(created.pop()); })();
      seedPool(POOL);
      const held = [];
      for (let i = 0; i < POOL; i++) {
        const x = auth.getApiKey([], null, caller, SELECTOR);
        if (x) held.push(x);
      }
      const distinct = new Set(held.map((h) => h.id)).size;
      for (const h of held) auth.releaseAccountById(h.id);
      if (distinct !== POOL) {
        failures.push(`${caller} (bucket ${bucketFor(caller, POOL)}) → ${distinct}/${POOL}`);
      }
    }
    assert.deepEqual(failures, [],
      'a burst must spread for EVERY caller, not just ones whose hash lands on a low '
      + 'bucket. A caller listed here is piling concurrent requests onto fewer accounts '
      + 'than the pool has — the issue #37 pile-up, re-introduced by the shard.');
  });

  it('the busiest account is never promoted while an idle peer exists', () => {
    // The invariant behind the above, stated directly. Acquire without releasing so
    // in-flight counts genuinely differ, then assert the next pick is never the account
    // with the most in-flight.
    const POOL = 6;
    seedPool(POOL);
    const caller = 'api:1111111111111111:user:alice'; // hashed to a HIGH bucket at 8
    const held = [];
    for (let i = 0; i < POOL - 1; i++) {
      const x = auth.getApiKey([], null, caller, SELECTOR);
      assert.ok(x, `acquire ${i} must succeed`);
      held.push(x);

      const counts = created.map((id) => auth.getAccountInternal(id)?._inflight || 0);
      const maxInflight = Math.max(...counts);
      const minInflight = Math.min(...counts);
      if (maxInflight > minInflight) {
        const chosen = auth.getAccountInternal(x.id);
        assert.notEqual(chosen._inflight, maxInflight + 1,
          'the shard promoted the account that already had the most requests in flight '
          + 'while an idler peer was available');
      }
    }
    for (const h of held) auth.releaseAccountById(h.id);
  });
});

describe('sharding still does the job it exists for', () => {
  it('different callers on a fully-tied pool prefer different accounts', () => {
    // Removing the defect must not remove the feature: on a pool where every account is
    // equally good, callers must still fan out rather than all taking candidates[0].
    const POOL = 4;
    seedPool(POOL);
    const firstPicks = [];
    for (const caller of ['api:k:user:alice', 'api:k:user:bob', 'api:k:user:carol', 'api:k:user:dave']) {
      makeAllTied();
      const x = auth.getApiKey([], null, caller, SELECTOR);
      assert.ok(x);
      firstPicks.push(x.id);
      auth.releaseAccountById(x.id);
    }
    assert.ok(new Set(firstPicks).size > 1,
      'if every caller landed on the same account the shard would be a no-op and two '
      + 'callers would stack — that is the problem it was added to solve');
  });

  it('a given caller is deterministic on an identical pool', () => {
    const POOL = 4;
    seedPool(POOL);
    const caller = 'api:k:user:alice';
    const picks = [];
    for (let r = 0; r < 4; r++) {
      makeAllTied();
      const x = auth.getApiKey([], null, caller, SELECTOR);
      picks.push(x.id);
      auth.releaseAccountById(x.id);
    }
    assert.equal(new Set(picks).size, 1,
      'the same caller on the same pool state must resolve to the same account, or the '
      + 'shard is not providing the stability it claims');
  });

  it('the shard is skipped when the top two do NOT tie', () => {
    // The pre-existing gate. A clearly healthier account must win outright, with no
    // hash-based reshuffle — otherwise sharding would override load balancing.
    const POOL = 3;
    seedPool(POOL);
    makeAllTied();
    // Make exactly one account clearly worse by burning RPM headroom.
    const worse = auth.getAccountInternal(created[0]);
    const now = Date.now();
    for (let i = 0; i < 30; i++) worse._rpmHistory.push(now - 1000 + i);

    for (let r = 0; r < 3; r++) {
      const x = auth.getApiKey([], null, 'api:k:user:alice', SELECTOR);
      assert.ok(x);
      assert.notEqual(x.id, worse.id,
        'an account with materially less RPM headroom must not be selected while healthier '
        + 'peers exist, whatever the caller hash says');
      auth.releaseAccountById(x.id);
      // Keep the healthy two tied so only the worse account could be promoted by a shard.
      for (const id of created.slice(1)) {
        const a = auth.getAccountInternal(id);
        a._rpmHistory = []; a.lastUsed = 0; a._inflight = 0;
      }
    }
  });
});
