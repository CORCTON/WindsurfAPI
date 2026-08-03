// Two asymmetries in the per-account cloud-catalog confirmation (#232), both of
// which restore #231's own symptom — the deployment advertising and routing models
// the account cannot reach.
//
// The confirmation guard exists so ONE degenerate upstream response cannot shrink
// an account's catalog: a snapshot smaller than half the last accepted one is
// quarantined until the same UID set comes back. Two shapes escaped it in opposite
// directions.
//
// 1. TOO LENIENT — an empty or malformed response was applied INSTANTLY. A 1-UID
//    snapshot needed two rounds; a 0-UID snapshot needed none, and a non-array
//    body went straight to applyCloudModels([]) which DELETES the account's
//    snapshot. Measured: an accepted 101-UID catalog (filter 106/163) went back to
//    163/163 after a single empty response, with no confirmation round and no
//    retry armed. A truncated, throttled or auth-blipped GetCascadeModelConfigs is
//    the most likely degenerate shape there is, so the one path with no sanity
//    gate was the one most likely to be taken. This is the project's recurring
//    "treat 'I don't know' as 'it's fine'" mode: an absent answer was read as the
//    authoritative answer "no filter".
//
//    Zero UIDs is genuinely ambiguous, and the two readings need opposite
//    handling, so the fix splits them: with no snapshot accepted yet it still
//    means "this deployment has no cloud filter" (the documented fail-open, kept
//    immediate); once a snapshot HAS been accepted it is simply the maximal
//    shrink, and goes through the same confirmation as any other shrink.
//
// 2. TOO STRICT — a shrunken-but-VARYING catalog wedged forever. Confirmation
//    requires an IDENTICAL UID set, so an upstream returning a small set that
//    differs by even one UID each round never repeats itself, was re-quarantined
//    indefinitely, and the stale LARGER last-known-good stayed authoritative with
//    nothing scheduled to correct it (auth.js armed the retry only on the first
//    round). That is exactly the case that matters: a plan downgrade or
//    entitlement revocation genuinely shrinks a catalog by more than half.
//    Measured: after a downgrade plus four sync cycles the proxy still allowed a
//    model the account had lost. The fix caps the quarantine at
//    CLOUD_CATALOG_CONFIRM_MAX_ROUNDS rounds and then accepts the newest snapshot —
//    "the upstream has said it is small several times running" is better evidence
//    than an old snapshot nothing has confirmed since.
//
// The stable-repeat path (same small set twice) must keep confirming in exactly
// two rounds; that behaviour is #232's and is pinned here so neither fix loosens it.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODELS,
  mergeCloudCatalogSnapshot,
  filterModelKeysByCloudCatalog,
  clearCloudModelCatalogs,
  removeCloudModelCatalog,
  forgetCloudModelCatalog,
  setActiveCloudCatalogAccounts,
} from '../src/models.js';

const ACCOUNT = 'catalog-degenerate-acct';
const ALL_UIDS = Object.values(MODELS).map((m) => m.modelUid).filter(Boolean);
const TOTAL_KEYS = Object.keys(MODELS).length;

// The filter is a MODELS-namespace (Cascade) mechanism: models.js exempts the
// connect transport outright, so these assertions are only meaningful with the
// switch off. Stated explicitly rather than inherited from ambient env — a sibling
// suite was found silently testing nothing because a shard had DEVIN_CONNECT set.
const CASCADE_ENV = { ...process.env, DEVIN_CONNECT: '0' };

const configs = (uids) => uids.map((modelUid) => ({ modelUid }));
const visible = () => filterModelKeysByCloudCatalog(undefined, CASCADE_ENV, ACCOUNT).length;

beforeEach(() => {
  clearCloudModelCatalogs();
  setActiveCloudCatalogAccounts([ACCOUNT]);
});

// Establish an accepted snapshot so later rounds are measured against a real
// last-known-good rather than the static baseline.
function seedAcceptedCatalog() {
  const r = mergeCloudCatalogSnapshot(configs(ALL_UIDS), { accountId: ACCOUNT });
  assert.equal(r.accepted, true, 'precondition: the seed snapshot must be accepted');
  const seeded = visible();
  assert.ok(seeded < TOTAL_KEYS, `precondition: the seed must actually narrow the view (got ${seeded}/${TOTAL_KEYS})`);
  return seeded;
}

describe('a degenerate catalog response does not wipe the last-known-good', () => {
  for (const [label, payload] of [['empty array', []], ['null', null], ['non-array object', {}]]) {
    it(`preserves the accepted snapshot when the upstream returns ${label}`, () => {
      const seeded = seedAcceptedCatalog();
      const r = mergeCloudCatalogSnapshot(payload, { accountId: ACCOUNT });

      assert.equal(r.accepted, false, `${label} must not be accepted over an existing snapshot`);
      assert.equal(r.preservedLastKnownGood, true);
      assert.equal(
        visible(), seeded,
        `${label} widened the catalog back out — the account is being advertised models it may not `
        + `have (this is #231's symptom restored)`,
      );
      assert.ok(
        visible() < TOTAL_KEYS,
        'the view must stay narrowed, not fail open to the full catalog',
      );
    });
  }

  it('still fails open when an empty response arrives with no snapshot yet', () => {
    // The other reading of zero UIDs, and the documented one: this deployment has
    // no cloud filter at all. Must stay immediate — no confirmation round.
    const r = mergeCloudCatalogSnapshot([], { accountId: ACCOUNT });
    assert.equal(r.accepted, true, 'an empty first response is the documented no-filter case');
    assert.equal(r.reason, 'no_filter');
    assert.equal(visible(), TOTAL_KEYS, 'a no-filter account sees the full catalog');
  });

  it('never adopts an empty response over an existing snapshot, however many arrive', () => {
    // An earlier version of this fix routed the empty case through the same
    // confirmation as any other shrink, on the theory that empty is just the
    // maximal shrink. Adversarial review measured why that is wrong: the accept
    // path calls applyCloudModels with no UIDs, which DELETES the snapshot — so a
    // confirmed empty response produced a FULL fail-open (148/163 -> 163/163),
    // which is #231's own symptom, merely delayed by one retry interval. And
    // confirmation is the wrong instrument anyway: a throttled upstream returns
    // empty repeatedly, so a second identical empty body is the same non-answer
    // twice, not evidence.
    const seeded = seedAcceptedCatalog();
    for (let round = 1; round <= 5; round++) {
      const r = mergeCloudCatalogSnapshot([], { accountId: ACCOUNT });
      assert.equal(r.accepted, false, `empty round ${round} must not be accepted`);
      assert.equal(r.reason, 'empty_over_snapshot');
      assert.equal(r.preservedLastKnownGood, true);
      assert.equal(
        visible(), seeded,
        `empty round ${round} changed the catalog view (${visible()} vs ${seeded}) — an empty body `
        + 'must never delete the filter, or the account re-advertises models it may not have',
      );
    }
  });

  it('an account that ever had a filter keeps the guard across a lifecycle event', () => {
    // The guard used to key on the live snapshot alone, and the snapshot is dropped
    // by every routine re-fetch event (key rotation, status flip, leaving the active
    // set). Measured: one disable/enable cycle plus one empty body took an account
    // from 148/163 to 163/163 with ZERO confirmation rounds, because the empty
    // response then read as "this deployment has no cloud filter".
    seedAcceptedCatalog();
    removeCloudModelCatalog(ACCOUNT);   // what a key rotation / status flip does

    const r = mergeCloudCatalogSnapshot([], { accountId: ACCOUNT });
    assert.equal(r.accepted, false,
      'after a lifecycle event the account is still the same account under the same upstream '
      + 'restriction, so an empty response must not be adopted as "no filter"');
    assert.equal(r.reason, 'empty_over_snapshot');
  });

  it('forgetting the account does clear the marker (a genuinely new account fails open)', () => {
    // The counterpart: a brand-new account with no history must still get the
    // documented immediate fail-open, or a recycled id would inherit a stranger's
    // restriction.
    seedAcceptedCatalog();
    forgetCloudModelCatalog(ACCOUNT);

    const r = mergeCloudCatalogSnapshot([], { accountId: ACCOUNT });
    assert.equal(r.accepted, true, 'a forgotten account starts clean');
    assert.equal(r.reason, 'no_filter');
  });
});

// The POOL dimension. Every test above runs with one active account, but the reason
// the empty case matters is the union rule: applicableCloudCatalogUids returns null
// the moment ANY active account lacks a catalog, so deleting ONE account's snapshot
// un-filters the listing for EVERY account. A single-account suite cannot see that,
// and the file's own rationale names it.
describe('one account\'s degenerate response does not un-filter the whole pool', () => {
  const A = 'pool-acct-a';
  const B = 'pool-acct-b';
  const poolVisible = () => filterModelKeysByCloudCatalog(undefined, CASCADE_ENV).length;

  it('an empty response for one account leaves the pool filter intact', () => {
    clearCloudModelCatalogs();
    setActiveCloudCatalogAccounts([A, B]);
    // Both accounts get an accepted catalog, so the pool is genuinely filtered.
    const half = ALL_UIDS.slice(0, Math.floor(ALL_UIDS.length * 0.8));
    assert.equal(mergeCloudCatalogSnapshot(configs(half), { accountId: A }).accepted, true);
    assert.equal(mergeCloudCatalogSnapshot(configs(half), { accountId: B }).accepted, true);
    const filtered = poolVisible();
    assert.ok(filtered < TOTAL_KEYS, `precondition: the pool must be filtered (got ${filtered})`);

    // Account A's upstream goes empty, repeatedly.
    for (let i = 0; i < 3; i++) {
      const r = mergeCloudCatalogSnapshot([], { accountId: A });
      assert.equal(r.accepted, false, 'an empty response must not be adopted');
    }

    assert.equal(
      poolVisible(), filtered,
      `one account's empty response un-filtered the POOL listing (${poolVisible()} vs ${filtered}). `
      + 'The union rule means a single deleted snapshot drops the filter for every account, so this '
      + 'is the blast radius that makes the empty case matter.',
    );
  });

  it('a malformed response for one account leaves the pool filter intact', () => {
    clearCloudModelCatalogs();
    setActiveCloudCatalogAccounts([A, B]);
    const half = ALL_UIDS.slice(0, Math.floor(ALL_UIDS.length * 0.8));
    mergeCloudCatalogSnapshot(configs(half), { accountId: A });
    mergeCloudCatalogSnapshot(configs(half), { accountId: B });
    const filtered = poolVisible();

    mergeCloudCatalogSnapshot(null, { accountId: A });
    assert.equal(poolVisible(), filtered, 'a malformed body must not widen the pool listing either');
  });

  it('an unconfirmed shrink for one account leaves the pool filter intact', () => {
    clearCloudModelCatalogs();
    setActiveCloudCatalogAccounts([A, B]);
    const half = ALL_UIDS.slice(0, Math.floor(ALL_UIDS.length * 0.8));
    mergeCloudCatalogSnapshot(configs(half), { accountId: A });
    mergeCloudCatalogSnapshot(configs(half), { accountId: B });
    const filtered = poolVisible();

    for (let i = 1; i <= 5; i++) {
      mergeCloudCatalogSnapshot(configs([ALL_UIDS[0], ALL_UIDS[i]]), { accountId: A });
    }
    assert.equal(poolVisible(), filtered,
      'an unconfirmed candidate must not reach the pool listing at any round count');
  });
});

describe('a shrunken catalog converges instead of wedging on a stale snapshot', () => {
  it('never adopts a candidate that changed on every round, but stops re-checking', () => {
    // An earlier version of this fix adopted the newest candidate once a round
    // budget ran out ("the upstream has said it is small several times"). Two
    // measured reasons that was worse than the wedge it replaced:
    //
    //   - the counter is per-ACCOUNT, not per-candidate, so two unrelated rounds
    //     paid for a third candidate that was then adopted the first time it was
    //     ever seen — including an empty body, i.e. a full fail-open from a single
    //     never-confirmed observation;
    //   - once adopted, auth.js records the account as synced and stops
    //     re-fetching, so a 90-second upstream wobble permanently pinned an account
    //     to a never-confirmed model list (measured 6/163) with no self-healing.
    //
    // An upstream that keeps changing its answer has no stable answer to adopt.
    // Refusing to adopt one is correct; the budget now bounds only the polling.
    const seeded = seedAcceptedCatalog();

    const rounds = [];
    for (let i = 1; i <= 8; i++) {
      const r = mergeCloudCatalogSnapshot(
        configs([ALL_UIDS[0], ALL_UIDS[5 + i]]), { accountId: ACCOUNT },
      );
      rounds.push(r);
      assert.equal(r.accepted, false,
        `round ${i} adopted a candidate that has never been confirmed (reason=${r.reason})`);
    }

    assert.equal(
      visible(), seeded,
      'the last-known-good view must be preserved throughout — nothing unconfirmed is adopted',
    );
    // The polling is bounded: the caller is told to stop after the cap.
    const exhausted = rounds.filter((r) => r.recheckExhausted);
    assert.ok(exhausted.length > 0,
      'after the cap the caller must be told to stop re-checking, or a permanently flapping '
      + 'upstream polls forever');
    assert.equal(rounds[0].recheckExhausted, false, 'the cap must not fire on the first round');
  });

  it('accepts a genuine downgrade in two rounds — the case the ceiling was meant to serve', () => {
    // The wedge that motivated the ceiling is handled by the ordinary path: a REAL
    // downgrade is stable, so it repeats and confirms. This is the assertion that
    // proves removing the ceiling did not restore the wedge.
    const seeded = seedAcceptedCatalog();
    const downgraded = configs([ALL_UIDS[0], ALL_UIDS[1]]);

    const first = mergeCloudCatalogSnapshot(downgraded, { accountId: ACCOUNT });
    assert.equal(first.accepted, false, 'round 1 of any shrink is quarantined');
    assert.equal(visible(), seeded, 'and the old view is kept meanwhile');

    const second = mergeCloudCatalogSnapshot(downgraded, { accountId: ACCOUNT });
    assert.equal(second.accepted, true, 'an identical repeat confirms — this is how a real downgrade lands');
    assert.equal(second.reason, 'confirmed_small');
    assert.ok(visible() < seeded, `expected the view to narrow, got ${visible()} vs ${seeded}`);
  });

  it('still confirms a stable small catalog in exactly two rounds', () => {
    seedAcceptedCatalog();
    const small = configs([ALL_UIDS[0], ALL_UIDS[1]]);

    const first = mergeCloudCatalogSnapshot(small, { accountId: ACCOUNT });
    assert.equal(first.accepted, false, 'round 1 of a shrink must be quarantined');
    assert.equal(first.reason, 'confirmation_required');

    const second = mergeCloudCatalogSnapshot(small, { accountId: ACCOUNT });
    assert.equal(second.accepted, true, 'an identical repeat must confirm on round 2');
    assert.equal(second.reason, 'confirmed_small',
      'the repeat path must stay distinguishable from the converged-by-timeout path');
  });

  it('resets the quarantine counter once a snapshot is accepted', () => {
    seedAcceptedCatalog();
    // Burn one quarantined round, then send a normal-sized snapshot.
    mergeCloudCatalogSnapshot(configs([ALL_UIDS[0], ALL_UIDS[2]]), { accountId: ACCOUNT });
    const ok = mergeCloudCatalogSnapshot(configs(ALL_UIDS), { accountId: ACCOUNT });
    assert.equal(ok.accepted, true);

    // A fresh shrink must get the full quarantine budget again, not the residue.
    const r = mergeCloudCatalogSnapshot(configs([ALL_UIDS[0], ALL_UIDS[3]]), { accountId: ACCOUNT });
    assert.equal(r.accepted, false, 'the counter must reset, or one stale round shortens every later guard');
    assert.equal(r.quarantineRounds, 1);
  });
});

// Structural guard. Both defects were about which code path a degenerate response
// takes, and the dangerous direction is a future edit routing "no data" back into
// applyCloudModels — which deletes the snapshot. Assert it by set difference over
// the call sites rather than by matching any single spelling.
describe('mergeCloudCatalogSnapshot never applies a snapshot it did not accept', () => {
  const SRC = readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');

  // Strip comments before reading structure. Without this the checks below match
  // their own explanatory prose — this file's first draft was satisfied by a
  // comment quoting `applyCloudModels([])`, which is the same "a comment satisfies
  // the assertion" flaw a recent review found in a sibling guard.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const body = (() => {
    const start = SRC.indexOf('export function mergeCloudCatalogSnapshot');
    assert.ok(start !== -1, 'mergeCloudCatalogSnapshot must exist');
    const open = SRC.indexOf('{', SRC.indexOf(')', start));
    let depth = 0;
    let end = -1;
    for (let i = open; i < SRC.length; i++) {
      if (SRC[i] === '{') depth++;
      else if (SRC[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    assert.ok(end !== -1, 'could not delimit the function body');
    return stripComments(SRC.slice(start, end));
  })();

  it('every applyCloudModels call in the merge path is on an accepted result', () => {
    // Each call must sit inside a `return { accepted: true, ... }` literal. A call
    // reached from a not-accepted branch is the wipe defect.
    const calls = [...body.matchAll(/applyCloudModels\([^)]*\)/g)];
    assert.ok(calls.length >= 3, `expected the accept paths to be present, found ${calls.length}`);

    const orphaned = calls.filter((m) => {
      const before = body.slice(0, m.index);
      const lastAccepted = before.lastIndexOf('accepted:');
      const nearestReturn = before.lastIndexOf('return {');
      return !(nearestReturn !== -1 && lastAccepted > nearestReturn
        && before.slice(lastAccepted).startsWith('accepted: true'));
    });
    assert.deepEqual(
      orphaned.map((m) => m[0]), [],
      'an applyCloudModels call is reachable from a branch that did not accept the snapshot. '
      + 'applyCloudModels with an empty list DELETES the account snapshot, so a malformed or '
      + 'unconfirmed response would wipe the last-known-good and re-advertise every model.',
    );
  });

  it('the malformed branch does not mutate catalog state', () => {
    const at = body.indexOf("reason: 'malformed'");
    assert.ok(at !== -1, 'the malformed branch must exist');
    // Everything from the function start down to the malformed return: the branch
    // has no data, so nothing in that path may touch catalog state.
    const region = body.slice(0, at);
    assert.doesNotMatch(
      region, /applyCloudModels/,
      'the malformed branch must not touch the catalog — it has no data to apply, and applying '
      + 'an empty list deletes the account snapshot',
    );
  });

  it('the round budget bounds re-checking, never the acceptance bar', () => {
    assert.match(
      SRC, /CLOUD_CATALOG_RECHECK_MAX_ROUNDS\s*=\s*\d+/,
      'a bound on re-checking is needed, or a permanently flapping upstream polls forever',
    );
    assert.match(body, /CLOUD_CATALOG_RECHECK_MAX_ROUNDS/, 'the merge path must consult the bound');
    // The load-bearing part: the bound must NOT appear in any accept decision. An
    // earlier version used it to adopt the newest candidate on exhaustion, which
    // promoted a single never-confirmed observation to authoritative policy.
    const acceptRegions = [...body.matchAll(/accepted: true[\s\S]{0,400}?\}/g)].map((m) => m[0]);
    const contaminated = acceptRegions.filter((r) => /RECHECK_MAX_ROUNDS|exhausted/.test(r));
    assert.deepEqual(
      contaminated, [],
      'an accept path consults the round budget. The budget may only decide whether to keep '
      + 'POLLING; adopting an unconfirmed candidate because the budget ran out is how a flapping '
      + 'upstream permanently pinned an account to a wrong model list.',
    );
  });

  it('an unconfirmed round leaves a re-check armed until the bound is reached', () => {
    // models.js can only converge if auth.js keeps re-checking, and there is NO
    // periodic catalog refresh to fall back on (trySyncModelCatalog fires on
    // account-lifecycle events only). Arming the delayed confirmation on the first
    // round only is what let the wedge persist.
    const AUTH = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
    const start = AUTH.indexOf('const snapshot = mergeCloudCatalogSnapshot');
    assert.ok(start !== -1, 'the merge call site must exist');
    // The unconfirmed branch is the one after the two early-returns (malformed and
    // empty-over-snapshot).
    const emptyBranch = AUTH.indexOf("snapshot.reason === 'empty_over_snapshot'", start);
    assert.ok(emptyBranch !== -1, 'the empty-over-snapshot branch must exist');
    const afterEmpty = AUTH.indexOf('return false;', emptyBranch);
    const region = AUTH.slice(afterEmpty, AUTH.indexOf('return false;', afterEmpty + 20) + 20);

    assert.doesNotMatch(
      region, /if \(!confirmationAttempt\) scheduleModelCatalogRetry/,
      'the delayed confirmation is armed only on the first round, so an unconfirmed candidate stops '
      + 'being re-checked and the stale snapshot stays authoritative — with no periodic refresh to '
      + 'recover it',
    );
    assert.match(region, /scheduleModelCatalogRetry\(accountId, apiKey\)/,
      'an unconfirmed round must arm the next re-check');
    // ...and must stop once the bound is reached, or a permanently flapping upstream
    // polls every retry interval for the lifetime of the process.
    assert.match(region, /recheckExhausted/,
      'the re-check must stop once models.js reports the round bound reached');
  });

  it('an empty response over a snapshot is handled like no data, not like a shrink', () => {
    const AUTH = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
    const at = AUTH.indexOf("snapshot.reason === 'empty_over_snapshot'");
    assert.ok(at !== -1,
      'auth.js must handle the empty-over-snapshot verdict explicitly — otherwise it falls into the '
      + 'shrink branch and arms a confirmation timer for something that can never be confirmed');
    const region = AUTH.slice(at, AUTH.indexOf('return false;', at));
    assert.match(region, /cancelModelCatalogRetry/,
      'nothing to confirm, so leave the account re-fetchable rather than timer-gated');
    assert.match(region, /WINDSURFAPI_IGNORE_CLOUD_FILTER/,
      'the log must point the operator at the documented escape hatch, since the consequence of this '
      + 'verdict is that a stale filter keeps over-restricting');
  });

  it('a malformed response leaves the account re-fetchable rather than timer-gated', () => {
    // Deliberately NOT symmetric with the quarantine branch: there is nothing to
    // confirm, and trySyncModelCatalog skips any account with a pending retry
    // timer, so arming one here would DELAY the re-fetch instead of helping.
    const AUTH = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
    const at = AUTH.indexOf("snapshot.reason === 'malformed'");
    assert.ok(at !== -1, 'the malformed branch must exist');
    const region = AUTH.slice(at, AUTH.indexOf('return false;', at));
    assert.doesNotMatch(
      region, /scheduleModelCatalogRetry/,
      'arming a delayed confirmation for a malformed body makes trySyncModelCatalog skip the '
      + 'account while the timer is pending, delaying recovery',
    );
  });
});
