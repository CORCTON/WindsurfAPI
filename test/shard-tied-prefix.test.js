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

  it('in-flight alone bounds the shard when every other metric ties', () => {
    // Isolates the in-flight term of the tie test. Without this case the term reads as
    // redundant: measured, deleting it from tiedWithFirst left the rest of this file green,
    // because lastUsed happened to discriminate in every other fixture.
    //
    // It is NOT redundant. A burst completing inside one millisecond gives every account
    // the same lastUsed, and if the RPM window is also even, in-flight is the only thing
    // left that can tell a busy account from an idle one. Reproduced here by erasing every
    // other discriminator between acquisitions.
    const POOL = 8;
    seedPool(POOL);
    const caller = 'api:1111111111111111:user:alice'; // hashes to a HIGH bucket at pool 8
    const held = [];
    for (let i = 0; i < POOL; i++) {
      const x = auth.getApiKey([], null, caller, SELECTOR);
      assert.ok(x, `acquire ${i} must succeed`);
      held.push(x);
      // Flatten lastUsed and the RPM trace, leaving in-flight as the sole signal.
      for (const id of created) {
        const a = auth.getAccountInternal(id);
        a.lastUsed = 0;
        a._rpmHistory = [];
      }
    }
    const distinct = new Set(held.map((h) => h.id)).size;
    for (const h of held) auth.releaseAccountById(h.id);
    assert.equal(distinct, POOL,
      `with lastUsed and the RPM ratio flattened, in-flight is the only discriminator left; `
      + `the burst still had to spread across all ${POOL} accounts, got ${distinct}. A lower `
      + 'number means the shard is treating a busy account as tied with an idle one.');
  });

  it('an account the sort demoted for RECENT TROUBLE is never promoted', () => {
    // Isolates the recent-trouble term, which the first version of tiedWithFirst omitted
    // even though the sort compares it — and it is the sort's SECOND-most significant key,
    // so the omission also broke the scan's contiguity assumption (a genuinely-tied account
    // could sit after a non-tied one, stopping the scan early). Measured before the fix: an
    // account with two hard failures was still selected for 2 of 6 sampled callerKeys.
    const POOL = 4;
    seedPool(POOL);
    const wobbly = auth.getAccountInternal(created[0]);
    const now = Date.now();

    let promoted = 0;
    const sampled = ['api:k:user:alice', 'api:k:user:bob', 'api:k:user:carol',
      'api:k:user:dave', 'api:1111111111111111:user:alice', 'caller-tension'];
    for (const caller of sampled) {
      makeAllTied();
      // A real trouble cluster: two hard failures → score 6 → bucket 2. Everything else
      // (in-flight, reservations, lastUsed) stays identical across the pool, so the trouble
      // term is the ONLY thing separating this account from its peers.
      wobbly._health = [{ t: now - 1000, k: 'e' }, { t: now - 500, k: 'e' }];
      const x = auth.getApiKey([], null, caller, SELECTOR);
      assert.ok(x, `${caller} must be served`);
      if (x.id === wobbly.id) promoted++;
      auth.releaseAccountById(x.id);
    }

    assert.equal(promoted, 0,
      `the account with a recent failure cluster was selected for ${promoted} of `
      + `${sampled.length} callers. The sort demotes it on the trouble term; if the shard's `
      + 'tie predicate does not mirror that term, it promotes it back to slot 0.');
  });

  it('an account low on QUOTA is never promoted into the shard', () => {
    // Isolates the quota term. It read as unguarded for a subtle reason: seeded accounts
    // have no `credits` object at all, so quotaScore returns the same 100 for every one of
    // them and the term cannot discriminate in any other fixture in this file. Deleting it
    // therefore left everything green.
    //
    // It IS load-bearing. Measured with credits set: an account at 10% quota against peers
    // at 90% went from never selected to selected for 2 of 6 sampled callerKeys.
    const POOL = 4;
    seedPool(POOL);
    for (const id of created) {
      auth.getAccountInternal(id).credits = { dailyPercent: 90, weeklyPercent: 90 };
    }
    const drained = auth.getAccountInternal(created[0]);
    drained.credits = { dailyPercent: 10, weeklyPercent: 10 };
    assert.equal(auth.quotaScore(drained), 10, 'precondition: the drained account scores 10');

    let promoted = 0;
    const sampled = ['api:k:user:alice', 'api:k:user:bob', 'api:k:user:carol',
      'api:k:user:dave', 'api:1111111111111111:user:alice', 'caller-tension'];
    for (const caller of sampled) {
      makeAllTied();
      const x = auth.getApiKey([], null, caller, SELECTOR);
      assert.ok(x, `${caller} must be served`);
      if (x.id === drained.id) promoted++;
      auth.releaseAccountById(x.id);
    }
    assert.equal(promoted, 0,
      `the account at 10% quota was selected for ${promoted} of ${sampled.length} callers `
      + 'while peers sat at 90%. The sort demotes it on the quota bucket; if the tie '
      + 'predicate omits that term, the shard promotes it back.');
  });

  it('an account loaded by OTHER callers is never promoted into the shard', () => {
    // Isolates the RPM-ratio term of the tie test, which also read as redundant until this
    // case existed: measured, deleting it left the rest of this file green, and yet the
    // account sitting at 50/60 RPM was then selected on every single request.
    //
    // The scenario is ordinary on a shared pool: one account has absorbed a lot of traffic
    // from OTHER callers, so its RPM window is nearly full — but those requests have
    // finished, so its in-flight is 0, and lastUsed can easily match its peers. Only the
    // remaining-ratio distinguishes it. Promoting it wastes the headroom of three idle
    // peers and pushes it toward its ceiling.
    const POOL = 4;
    seedPool(POOL);
    makeAllTied();
    const loaded = auth.getAccountInternal(created[0]);
    const now = Date.now();
    loaded._rpmHistory = [];
    for (let i = 0; i < 50; i++) loaded._rpmHistory.push(now - 1000 + i); // 50 of 60 (pro)

    const picks = [];
    for (let r = 0; r < 6; r++) {
      const x = auth.getApiKey([], null, 'api:1111111111111111:user:alice', SELECTOR);
      assert.ok(x);
      picks.push(x.id);
      auth.releaseAccountById(x.id);
      // Re-flatten in-flight and lastUsed but PRESERVE the RPM asymmetry, so the ratio is
      // the only signal separating the loaded account from its peers.
      for (const id of created) {
        const a = auth.getAccountInternal(id);
        a.lastUsed = 0;
        a._inflight = 0;
        if (id !== loaded.id) a._rpmHistory = [];
      }
      loaded._rpmHistory = loaded._rpmHistory.slice(0, 50);
    }

    assert.ok(!picks.includes(loaded.id),
      `the account at 50/60 RPM was selected ${picks.filter((p) => p === loaded.id).length} `
      + `of ${picks.length} times while three peers sat at 0. The shard is treating it as `
      + 'tied with them, so it can be promoted despite materially less headroom.');
  });

  it('the busiest account is never promoted while an idle peer exists', () => {
    // The invariant behind the above, stated directly. Acquire without releasing so
    // in-flight counts genuinely differ, then assert the next pick is never the account
    // with the most in-flight.
    const POOL = 6;
    seedPool(POOL);
    const caller = 'api:1111111111111111:user:alice'; // hashes to a HIGH bucket
    const held = [];
    for (let i = 0; i < POOL - 1; i++) {
      // Snapshot BEFORE the acquire. An earlier version of this test took the snapshot
      // after, so the chosen account's own increment was already inside `maxInflight` and
      // the comparison `chosen._inflight !== maxInflight + 1` could not fail for any input
      // — a tautology, and the exact antipattern this round was auditing others for.
      const before = new Map(created.map((id) => [id, auth.getAccountInternal(id)?._inflight || 0]));
      const maxBefore = Math.max(...before.values());
      const minBefore = Math.min(...before.values());

      const x = auth.getApiKey([], null, caller, SELECTOR);
      assert.ok(x, `acquire ${i} must succeed`);
      held.push(x);

      if (maxBefore > minBefore) {
        assert.notEqual(before.get(x.id), maxBefore,
          `acquire ${i} selected the account that ALREADY had the most requests in flight `
          + `(${maxBefore}) while a peer sat at ${minBefore}. In-flight counts before this `
          + `pick: ${[...before.values()].join(',')}`);
      }
    }
    for (const h of held) auth.releaseAccountById(h.id);
  });
});

describe('strictPin requires sticky to actually be on', () => {
  // strictPin exempts the shard from the tied-prefix bound entirely (span = pool), on the
  // premise that the operator asked for per-user pinning regardless of account health. That
  // premise only holds when sticky is ON — the binding and no-rotate behaviour that make a
  // pin meaningful live in the sticky path.
  //
  // The two flags are DASHBOARD-settable at runtime while sticky itself is an env-only
  // module-load const, so the mismatch was reachable in production: flip both switches on a
  // deploy without STICKY_SESSION_ENABLED=1 and the shard permutes the whole pool with none
  // of the pinning that justifies it. This file runs with sticky OFF, which is exactly the
  // state that used to be broken.
  it('both flags on with sticky OFF must not exempt the shard', async () => {
    const rc = await import('../src/runtime-config.js');
    const sticky = await import('../src/account/sticky-session.js');
    assert.equal(sticky.isStickyEnabled(), false,
      'precondition: this file runs with sticky off, which is the vulnerable state');

    // setExperimental takes a PATCH OBJECT — two positional args is a silent no-op that
    // would make this test pass without the flags ever being on.
    rc.setExperimental({ stickyBindByUserOnly: true, stickyNoFallback: true });
    try {
      assert.equal(rc.isExperimentalEnabled('stickyBindByUserOnly'), true, 'flag 1 must be on');
      assert.equal(rc.isExperimentalEnabled('stickyNoFallback'), true, 'flag 2 must be on');

      const POOL = 4;
      seedPool(POOL);
      const worst = auth.getAccountInternal(created[0]);
      const now = Date.now();

      let promoted = 0;
      const sampled = ['api:k:user:alice', 'api:k:user:bob', 'api:k:user:carol',
        'api:k:user:dave', 'api:1111111111111111:user:alice', 'caller-tension'];
      for (const caller of sampled) {
        makeAllTied();
        // Make one account unambiguously the worst on TWO independent dimensions.
        worst._rpmHistory = [];
        for (let i = 0; i < 55; i++) worst._rpmHistory.push(now - 1000 + i);
        worst._health = [{ t: now - 1000, k: 'e' }, { t: now - 500, k: 'e' }];

        const x = auth.getApiKey([], null, caller, SELECTOR);
        assert.ok(x, `${caller} must be served`);
        if (x.id === worst.id) promoted++;
        auth.releaseAccountById(x.id);
      }

      assert.equal(promoted, 0,
        `with sticky OFF the worst account in the pool (55/60 RPM + a trouble cluster) was `
        + `selected for ${promoted} of ${sampled.length} callers. strictPin exempted the `
        + 'shard from the tied-prefix bound without the pinning that exemption exists for.');
    } finally {
      rc.setExperimental({ stickyBindByUserOnly: false, stickyNoFallback: false });
    }
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
