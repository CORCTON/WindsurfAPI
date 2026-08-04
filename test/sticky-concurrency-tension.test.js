// Sticky affinity and burst-spreading want opposite things. This pins which one wins.
//
// A caller firing N requests in parallel with no binding yet gets N DIFFERENT accounts.
// Measured: 8 concurrent first-round acquisitions for one caller land on 8 distinct
// accounts with 0 sticky hits.
//
// That is DESIGNED, not broken. getApiKey's candidate sort puts fewest-in-flight first so
// a burst spreads instead of piling onto one account that still has RPM headroom
// (issue #37). Sticky binding, meanwhile, exists to keep SEQUENTIAL turns on one account
// because the upstream prompt cache is per-account and a write costs several times a read
// (~5.6x, from devin-connect.js's 17.8%-of-miss calibration; the older ~10x figure that
// still appears in sticky-session.js has no derivation anywhere in the repo).
//
// For a parallel burst those goals conflict and the proxy cannot tell the cases apart:
// "8 parallel tool calls in one conversation" wants one account (1 cache write, not 8),
// "8 independent conversations" wants 8. Binding the first round would serialise the
// former against a single account's RPM ceiling.
//
// So this file does not assert a fix. It asserts the CURRENT choice, so that changing the
// balance is a deliberate act with a failing test to update rather than a silent drift.
// It also pins the part that is unambiguously right: once a binding EXISTS, sequential
// turns must honour it.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Env BEFORE the first import of auth.js: sticky-session reads STICKY_SESSION_* into
// module-load consts, and auth.js imports it statically at load.
//
// It must be the SAME module instance auth.js uses. A fresh `import(...?query)` — the
// pattern sticky-session.test.js uses for env permutations — creates a SEPARATE instance
// with its own binding table, so getApiKey would read a different map than the test
// writes. That produced 0 counted misses and a binding getApiKey never saw; the
// "guard the guard" assertion below is what surfaced it.
process.env.STICKY_SESSION_ENABLED = '1';
process.env.STICKY_SESSION_TTL_MS = '60000';

const {
  addAccountByKey, removeAccount, getAccountInternal, getApiKey,
} = await import('../src/auth.js');
const sticky = await import('../src/account/sticky-session.js');

const POOL_SIZE = 8;
const CALLER = 'caller-tension';
const SELECTOR = 'swe-1-6-slow';

const created = [];

function seedPool(n = POOL_SIZE) {
  for (let i = 0; i < n; i++) {
    const a = addAccountByKey('sk-tension-' + i + '-' + Math.random().toString(36).slice(2, 10), 't' + i);
    const acct = getAccountInternal(a.id);
    acct.status = 'active';
    acct.tier = 'pro';
    created.push(a.id);
  }
}

beforeEach(() => {
  sticky.resetAllBindings();
  seedPool();
});

afterEach(() => {
  while (created.length) removeAccount(created.pop());
  sticky.resetAllBindings();
});

describe('burst spreading wins over affinity on the FIRST round (issue #37)', () => {
  it('scatters a caller\'s unbound parallel acquisitions across accounts', () => {
    // getApiKey is synchronous and reserves as it goes (_inflight++ / lastUsed), so
    // consecutive calls in one tick model a parallel burst: each sees the previous
    // reservation. Distinct accounts is the DESIGNED outcome.
    const picked = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const r = getApiKey([], null, CALLER, SELECTOR);
      assert.ok(r, `acquisition ${i} must succeed against a pool of ${POOL_SIZE}`);
      picked.push(r.id);
    }

    const distinct = new Set(picked).size;
    assert.equal(distinct, POOL_SIZE,
      `expected the burst to spread across all ${POOL_SIZE} accounts; got ${distinct} `
      + 'distinct. If this now concentrates, someone changed the balance between burst '
      + 'spreading and sticky affinity — read the CONCURRENCY note in sticky-session.js '
      + 'before deciding which behaviour is wanted.');

    // Scope note — REWRITTEN 2026-08-05. The previous version of this comment was wrong in
    // three ways, and the way it was wrong is worth keeping:
    //
    //   1. It said the remaining cause was in candidate FILTERING. It is not. Attribution
    //      by disabling one comparator term at a time in source (rather than by clearing
    //      account state between turns, which IS the mechanism and so cannot isolate it):
    //      the RPM remaining-ratio and lastUsed terms are each independently sufficient,
    //      and in-flight contributes NOTHING to sequential rotation because the request is
    //      released before the next acquire. See test/scatter-attribution.test.js.
    //   2. It said the behaviour was specific to the sticky-enabled path. It is not —
    //      measured identical with STICKY_SESSION_ENABLED=0 and =1.
    //   3. It presented 8→8 as the designed outcome. Until the fix below it was the BEST
    //      CASE, reachable only because this file's callerKey happens to hash to shard
    //      bucket 0. The caller-shard tiebreaker indexed `hash % candidates.length` across
    //      the whole array while only checking that the top TWO tied, so a high bucket
    //      pulled the BUSIEST account back to position 0 — the exact pile-up issue #37
    //      exists to prevent. Of 8 realistic callerKeys, only 2 spread across the pool;
    //      one served the same account 8 times with seven peers idle.
    //
    // That is fixed (auth.js: the shard now permutes only within the tied prefix), so this
    // assertion now holds for the RIGHT reason and for any callerKey, not just this one.
    // A failure here still means "the balance moved" — but check
    // test/shard-tied-prefix.test.js first, which pins the narrower invariant.
  });

  it('records misses, not hits, for that first round', () => {
    const before = sticky.getStickyStats();
    for (let i = 0; i < POOL_SIZE; i++) getApiKey([], null, CALLER, SELECTOR);
    const after = sticky.getStickyStats();

    assert.equal(after.hits - before.hits, 0,
      'no binding exists yet, so none of the burst can be a sticky hit');
    assert.ok(after.misses - before.misses > 0,
      'the lookups must be counted as misses — if they are not counted at all, the sticky '
      + 'fast path is not even being consulted and this whole test measures nothing');
  });
});

describe('affinity wins once a binding exists (the unambiguous half)', () => {
  it('sends sequential turns of a bound caller back to the same account', () => {
    const first = getApiKey([], null, CALLER, SELECTOR);
    assert.ok(first);
    sticky.setStickyBinding(CALLER, null, first.id, first.apiKey, SELECTOR);

    const repeats = [];
    for (let i = 0; i < 5; i++) {
      const r = getApiKey([], null, CALLER, SELECTOR);
      assert.ok(r, `sequential turn ${i} must resolve`);
      repeats.push(r.id);
    }

    assert.deepEqual([...new Set(repeats)], [first.id],
      'every subsequent turn must land on the bound account — this is the prompt-cache '
      + 'affinity sticky exists for, and it must not regress while #37 governs bursts');
  });

  it('keeps a different caller independent of that binding', () => {
    const first = getApiKey([], null, CALLER, SELECTOR);
    sticky.setStickyBinding(CALLER, null, first.id, first.apiKey, SELECTOR);

    const other = getApiKey([], null, 'caller-unrelated', SELECTOR);

    assert.ok(other, 'a different caller must still get an account');
    // Not asserted as "must differ": with a small pool the sort can legitimately return
    // the same account. What must hold is that the OTHER caller was not given a binding.
    assert.equal(sticky.getStickyBinding('caller-unrelated', null, SELECTOR), null,
      'one caller\'s binding must not create a binding for another');
  });
});
