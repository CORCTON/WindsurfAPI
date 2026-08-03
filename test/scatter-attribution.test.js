// Why an UNBOUND caller's sequential turns move between accounts.
//
// The ledger carried "散射的确切成因" open for several rounds, with the note that two
// ordering mechanisms had been removed and it still scattered, therefore the cause "must be
// in candidate filtering". That was wrong on both counts, and the method is why: removing
// two terms at once cannot attribute, and the removal was done by CLEARING ACCOUNT STATE
// (_rpmHistory / lastUsed) between turns — which is not isolating a mechanism, it IS the
// mechanism. Measured that way the answer came out as 4 distinct accounts; the true
// baseline is 2.
//
// Re-measured by disabling one comparator term at a time in source, leaving all account
// state alone (8 sequential turns, pool of 4):
//
//     disabled terms            distinct   sequence
//     ------------------------------------------------------------------
//     none (baseline)              2       A,B,A,B,A,B,A,B
//     inflight                     2       A,B,A,B,A,B,A,B    ← no effect at all
//     LRU                          2       A,B,A,B,A,B,A,B
//     RPM-ratio                    2       A,B,A,A,A,A,A,A    ← one swap, then converges
//     inflight + LRU               2       A,B,A,B,A,B,A,B
//     inflight + RPM-ratio         2       A,B,A,A,A,A,A,A
//     RPM-ratio + LRU              1       A,A,A,A,A,A,A,A    ← pinned
//     all three                    1       A,A,A,A,A,A,A,A
//
// Conclusions, none of which were on record:
//
//   1. `inflight` contributes NOTHING to sequential rotation. The request is released
//      before the next acquire, so every account ties at 0. Its comment explains it as
//      "so a burst of concurrent calls spreads (issue #37)" — correct, and about a
//      different scenario than the one the scatter investigation was chasing. Two
//      phenomena had been filed as one.
//   2. RPM-remaining-ratio and LRU are each independently sufficient to move the caller;
//      BOTH must be disabled before it pins. So there was never a single "cause" to find.
//   3. RPM-ratio is what SUSTAINS the alternation (serving pushes a reservation, lowering
//      that account's ratio, so it sorts last next turn). LRU alone yields one swap and
//      then converges, because after both candidates have been served their lastUsed ties
//      at millisecond resolution.
//   4. Before the shard fix it alternated between exactly TWO accounts rather than
//      round-robinning the pool, because the caller-hash shard swapped candidates[0] with
//      candidates[bucket] for a CONSTANT bucket, overriding the health ordering on every
//      call. Bounding the shard to the tied prefix (see test/shard-tied-prefix.test.js)
//      let the ordering through, and sequential turns now walk the whole pool. The tables
//      above were measured BEFORE that fix; they are kept because they are what made the
//      shard defect visible, and because they are the attribution the ledger was missing.
//
// Nothing here is a defect — rotating an unbound caller is what a load balancer is for.
// This file exists so the attribution stops being re-derived from scratch, and so a change
// to any of these terms has to confront which one it is actually moving.

process.env.STICKY_SESSION_ENABLED = '0';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const auth = await import('../src/auth.js');

const CALLER = 'api:deadbeefcafedeadbeefcafedeadbeef:user:attribution';
const POOL = 4;
const TURNS = 8;

const created = [];
beforeEach(() => { created.length = 0; });
afterEach(() => { while (created.length) auth.removeAccount(created.pop()); });

function seedPool(n = POOL) {
  for (let i = 0; i < n; i++) {
    const a = auth.addAccountByKey(
      `devin-session-token$attr-${i}-${Math.random().toString(36).slice(2)}`, `acct${i}`,
    );
    created.push(a.id);
  }
}

/** TURNS sequential acquire/release cycles. No state is touched between turns. */
function serveSequential(turns = TURNS) {
  const served = [];
  for (let t = 0; t < turns; t++) {
    const acct = auth.getApiKey([], null, CALLER, null);
    assert.ok(acct, `turn ${t} must be served — the pool is healthy`);
    served.push(acct.id);
    auth.releaseAccountById(acct.id);
  }
  return served;
}

describe('sequential rotation: what it actually looks like', () => {
  it('round-robins the WHOLE pool', () => {
    // Before the shard fix this was 2, not POOL: the tiebreaker yanked a constant bucket
    // index to position 0 on every call, overriding the health ordering and collapsing the
    // rotation to a two-cycle. With the shard bounded to the tied prefix, a just-served
    // account is demoted and no longer ties, so the RPM-ratio and LRU terms come through
    // and the caller walks the pool.
    seedPool();
    const served = serveSequential();
    assert.equal(new Set(served).size, POOL,
      `expected all ${POOL} accounts over ${TURNS} turns, got `
      + `${new Set(served).size} (${served.map((s) => s.slice(0, 4)).join(',')})`);
  });

  it('no account is starved and none is over-served', () => {
    // Deliberately NOT asserting a strict period-POOL cycle. That assertion was written
    // first and is FLAKY: lastUsed has millisecond resolution, so two turns landing in the
    // same millisecond tie, the tiebreak order shifts, and the exact permutation changes.
    // It passed 8 runs in a row and had already failed once — the worst kind, since it
    // would surface in CI under load rather than here.
    //
    // Fair balancing is the property that actually matters, and it holds regardless of
    // which permutation a run produces: over TURNS turns each account gets its share
    // ±1. That is checkable without depending on sub-millisecond timing.
    seedPool();
    const served = serveSequential();
    const counts = new Map();
    for (const id of served) counts.set(id, (counts.get(id) || 0) + 1);
    assert.equal(counts.size, POOL, 'every account must be used at least once');
    const share = TURNS / POOL;
    for (const [id, n] of counts) {
      assert.ok(Math.abs(n - share) <= 1,
        `${id.slice(0, 4)} served ${n} of ${TURNS} turns; fair share is ${share} ±1. `
        + `Sequence: ${served.map((s) => s.slice(0, 4)).join(',')}`);
    }
  });

  it('a single-account pool obviously cannot rotate (control)', () => {
    // Guards against the above passing for a trivial reason.
    seedPool(1);
    const served = serveSequential(4);
    assert.equal(new Set(served).size, 1);
  });
});

describe('inflight is not the cause of SEQUENTIAL rotation', () => {
  it('every account ties at 0 in-flight at selection time', () => {
    // This is the mechanical reason disabling the inflight comparator changes nothing:
    // sequential turns release before the next acquire, so the term never discriminates.
    // Asserted on observable state rather than by patching the comparator, so it survives
    // as a normal test.
    seedPool();
    for (let t = 0; t < 4; t++) {
      for (const id of created) {
        const a = auth.getAccountInternal(id);
        assert.equal(a._inflight || 0, 0,
          'before each sequential acquire every account must be idle — if this ever fails, '
          + 'in-flight counts start discriminating and the attribution in this file changes');
      }
      const acct = auth.getApiKey([], null, CALLER, null);
      auth.releaseAccountById(acct.id);
    }
  });

  it('but it DOES discriminate for a concurrent burst (issue #37)', () => {
    // The other half: inflight is not dead weight, it answers a different question. Acquire
    // without releasing, which is what genuine parallelism looks like.
    seedPool();
    const held = [];
    for (let i = 0; i < POOL; i++) {
      const acct = auth.getApiKey([], null, CALLER, null);
      assert.ok(acct, `concurrent acquire ${i} must succeed`);
      held.push(acct);
    }
    const distinct = new Set(held.map((h) => h.id)).size;
    for (const h of held) auth.releaseAccountById(h.id);
    assert.ok(distinct > 2,
      `a concurrent burst must spread wider than the sequential two-cycle; got ${distinct}. `
      + 'This is the behaviour issue #37 asks for, and it is why the inflight term exists '
      + 'even though it is irrelevant to sequential turns.');
  });
});

describe('serving an account demotes it — the sustained driver', () => {
  it('a served account carries an RPM reservation the others do not', () => {
    // The mechanism behind the alternation: (limit - used)/limit descending. One serve is
    // enough to put that account behind its idle peers on the very next selection.
    seedPool();
    const first = auth.getApiKey([], null, CALLER, null);
    auth.releaseAccountById(first.id);

    const servedAcct = auth.getAccountInternal(first.id);
    assert.equal((servedAcct._rpmHistory || []).length, 1,
      'the serve must leave exactly one reservation');
    for (const id of created) {
      if (id === first.id) continue;
      assert.equal((auth.getAccountInternal(id)._rpmHistory || []).length, 0,
        'peers must still be at zero, which is what makes the ratio term discriminate');
    }

    const second = auth.getApiKey([], null, CALLER, null);
    auth.releaseAccountById(second.id);
    assert.notEqual(second.id, first.id,
      'so the next turn must land elsewhere — this single fact is the whole alternation');
  });

  it('LRU also moves it, independently', () => {
    // Both terms are individually sufficient, which is why no single "cause" was ever
    // findable. Demonstrated through lastUsed alone: clear the RPM trace so only LRU can
    // discriminate, and it still moves.
    seedPool(2);
    const a0 = auth.getAccountInternal(created[0]);
    const a1 = auth.getAccountInternal(created[1]);
    const first = auth.getApiKey([], null, CALLER, null);
    auth.releaseAccountById(first.id);
    // Neutralise the ratio term only — both accounts back to zero reservations, but
    // lastUsed still differs.
    a0._rpmHistory = [];
    a1._rpmHistory = [];
    assert.notEqual(a0.lastUsed || 0, a1.lastUsed || 0,
      'precondition: exactly one account has been served, so lastUsed must differ');

    const second = auth.getApiKey([], null, CALLER, null);
    auth.releaseAccountById(second.id);
    assert.notEqual(second.id, first.id,
      'with the ratio tied, least-recently-used alone still rotates the caller');
  });
});
