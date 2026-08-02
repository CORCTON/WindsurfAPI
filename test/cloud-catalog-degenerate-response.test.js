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

  it('treats an empty response over an existing snapshot as the maximal shrink', () => {
    seedAcceptedCatalog();
    const r = mergeCloudCatalogSnapshot([], { accountId: ACCOUNT });
    assert.equal(r.reason, 'confirmation_required',
      'zero UIDs over an accepted snapshot must go through the same confirmation as any shrink');
  });
});

describe('a shrunken catalog converges instead of wedging on a stale snapshot', () => {
  it('accepts the newest snapshot after a bounded number of varying rounds', () => {
    const seeded = seedAcceptedCatalog();

    // The upstream keeps reporting a small catalog, but never the same one twice —
    // so the repeat check can never be satisfied.
    const rounds = [];
    let accepted = null;
    for (let i = 1; i <= 8; i++) {
      const r = mergeCloudCatalogSnapshot(
        configs([ALL_UIDS[0], ALL_UIDS[5 + i]]), { accountId: ACCOUNT },
      );
      rounds.push(r);
      if (r.accepted) { accepted = r; break; }
    }

    assert.ok(accepted, `a small-and-varying catalog never converged in ${rounds.length} rounds — the `
      + 'stale larger snapshot stays authoritative forever, so the proxy keeps routing models the '
      + 'account has lost');
    assert.equal(accepted.reason, 'converged_small');
    assert.ok(
      visible() < seeded,
      `expected the view to narrow to the new catalog, got ${visible()} vs the stale ${seeded}`,
    );
    // Bounded, and not on the first round either — one degenerate response still
    // must not shrink the catalog.
    assert.ok(rounds.length >= 2, 'a single small response must NOT be accepted immediately');
    assert.ok(rounds.length <= 4, `convergence took ${rounds.length} rounds, expected a small bound`);
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

  it('the quarantine is bounded by an explicit round cap', () => {
    assert.match(
      SRC, /CLOUD_CATALOG_CONFIRM_MAX_ROUNDS\s*=\s*\d+/,
      'the quarantine needs an explicit ceiling, or a small-and-varying upstream wedges the '
      + 'stale last-known-good in place forever',
    );
    assert.match(body, /CLOUD_CATALOG_CONFIRM_MAX_ROUNDS/, 'the merge path must consult the ceiling');
  });

  it('a quarantined round always leaves a re-check armed', () => {
    // models.js can only converge if auth.js keeps re-checking, and there is NO
    // periodic catalog refresh to fall back on (trySyncModelCatalog fires on
    // account-lifecycle events only). Arming the delayed confirmation on the first
    // round only is what let the wedge persist.
    const AUTH = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
    const start = AUTH.indexOf('const snapshot = mergeCloudCatalogSnapshot');
    assert.ok(start !== -1, 'the merge call site must exist');
    // The quarantine branch is the one after the malformed early-return.
    const malformedEnd = AUTH.indexOf('return false;', AUTH.indexOf("snapshot.reason === 'malformed'", start));
    const region = AUTH.slice(malformedEnd, AUTH.indexOf('return false;', malformedEnd + 20) + 20);
    assert.doesNotMatch(
      region, /if \(!confirmationAttempt\) scheduleModelCatalogRetry/,
      'the delayed confirmation is armed only on the first round, so a quarantined candidate stops '
      + 'being re-checked and the stale snapshot stays authoritative — with no periodic refresh to '
      + 'recover it',
    );
    assert.match(region, /scheduleModelCatalogRetry\(accountId, apiKey\)/,
      'every quarantined round must arm the next re-check');
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
