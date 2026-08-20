// #234 — the connect live catalog must keep syncing as the pool changes.
//
// It used to be one module-level boolean: the first active account to sync set it,
// nothing ever cleared it, so adding a paid account to a free-only pool never
// refreshed the selector set. The pool-wide union was therefore unobtainable.
//
// De-latching alone would have been WORSE than the latch, which is what these
// tests pin: setLiveCatalogSelectors clears and repopulates, so a second account
// syncing after the first would SHRINK the live set to just its own selectors.
// Hence per-account rows unioned before every write.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetModelCatalogState, __setModelCatalogDeps, __waitForModelCatalogSync,
  addAccountByKey, removeAccount, getAccountInternal, setAccountStatus, setAccountTokens,
  isConnectSelectorAllowedForAccount, trySyncModelCatalog,
} from '../src/auth.js';
import {
  setLiveCatalogSelectors as applyLiveCatalog,
  resolveConnectSelector,
} from '../src/devin-connect-models.js';

const created = [];
let liveWrites = [];
let fetchCalls = [];
// Mutable so a test can change what an account answers on a LATER sync — needed to
// prove an empty answer leaves the account eligible rather than latched.
let perAccountRows = {};
const SAVED_CONNECT = process.env.DEVIN_CONNECT;
const SAVED_CATALOG_TTL = process.env.DEVIN_CONNECT_CATALOG_TTL_MS;
const SAVED_CONNECT_TOKEN = process.env.DEVIN_CONNECT_TOKEN;
const SAVED_WINDSURF_API_KEY = process.env.WINDSURF_API_KEY;
const RETRY_BASE_MS = 30_000;

/** Install seams: record every fetch and every write to the resolver. */
function installDeps({
  perAccount = {},
  now,
  fetchConnectCatalog,
  retryJitterBasisPoints = () => 10_000,
}) {
  liveWrites = [];
  fetchCalls = [];
  perAccountRows = { ...perAccount };
  __setModelCatalogDeps({
    // Cascade sync is irrelevant here and would make assertions noisy.
    getCascadeModelConfigs: async () => ({ configs: [] }),
    scheduleCatalogRetry: () => () => {},
    fetchConnectCatalog: async ({ token }) => {
      fetchCalls.push(token);
      if (fetchConnectCatalog) return fetchConnectCatalog({ token });
      return perAccountRows[token] || [];
    },
    ...(retryJitterBasisPoints
      ? { connectCatalogRetryJitterBasisPoints: retryJitterBasisPoints }
      : {}),
    ...(now ? { now } : {}),
    setLiveCatalogSelectors: (rows, options) => {
      liveWrites.push((rows || []).map((r) => (typeof r === 'string' ? r : r.selector)));
      applyLiveCatalog(rows, options);
    },
  });
}

function mk(apiKey, tier = 'free') {
  const a = addAccountByKey(apiKey, 'delatch');
  const acct = getAccountInternal(a.id);
  acct.status = 'active';
  acct.tier = tier;
  created.push(a.id);
  return acct;
}

/** The union the resolver was last told about. */
function lastUnion() {
  return liveWrites.length ? [...liveWrites[liveWrites.length - 1]].sort() : [];
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  process.env.DEVIN_CONNECT = '1';
  delete process.env.DEVIN_CONNECT_CATALOG_TTL_MS;
  delete process.env.DEVIN_CONNECT_TOKEN;
  delete process.env.WINDSURF_API_KEY;
  __resetModelCatalogState();
});

afterEach(async () => {
  while (created.length) removeAccount(created.pop());
  __setModelCatalogDeps(null);
  __resetModelCatalogState();
  if (SAVED_CONNECT === undefined) delete process.env.DEVIN_CONNECT;
  else process.env.DEVIN_CONNECT = SAVED_CONNECT;
  if (SAVED_CATALOG_TTL === undefined) delete process.env.DEVIN_CONNECT_CATALOG_TTL_MS;
  else process.env.DEVIN_CONNECT_CATALOG_TTL_MS = SAVED_CATALOG_TTL;
  if (SAVED_CONNECT_TOKEN === undefined) delete process.env.DEVIN_CONNECT_TOKEN;
  else process.env.DEVIN_CONNECT_TOKEN = SAVED_CONNECT_TOKEN;
  if (SAVED_WINDSURF_API_KEY === undefined) delete process.env.WINDSURF_API_KEY;
  else process.env.WINDSURF_API_KEY = SAVED_WINDSURF_API_KEY;
});

describe('connect catalog de-latch (#234)', () => {
  it('coalesces per account, not globally, when two accounts need their first sync together', async () => {
    installDeps({
      perAccount: {
        'sk-concurrent-a': [{ selector: 'swe-1-6-slow' }],
        'sk-concurrent-b': [{ selector: 'claude-opus-4-8-medium' }],
      },
    });

    mk('sk-concurrent-a', 'free');
    mk('sk-concurrent-b', 'pro');
    await __waitForModelCatalogSync();

    assert.deepEqual(new Set(fetchCalls), new Set(['sk-concurrent-a', 'sk-concurrent-b']));
  });

  it('refreshes a successful Connect catalog after the five-minute TTL', async () => {
    let now = 1_000_000;
    installDeps({
      perAccount: { 'sk-ttl': [{ selector: 'swe-1-6-slow' }] },
      now: () => now,
    });

    mk('sk-ttl', 'free');
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 1);

    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 1, 'fresh catalog is reused inside the TTL');

    now += 5 * 60 * 1000 + 1;
    perAccountRows['sk-ttl'] = [{ selector: 'swe-1-6-slow' }, { selector: 'swe-1-7' }];
    trySyncModelCatalog();
    await __waitForModelCatalogSync();

    assert.equal(fetchCalls.length, 2, 'expired catalog is fetched again');
    assert.ok(lastUnion().includes('swe-1-7'));
  });

  it('syncs a second account instead of latching after the first', async () => {
    installDeps({
      perAccount: {
        'sk-free-acct': [{ selector: 'swe-1-6-slow' }],
        'sk-paid-acct': [{ selector: 'claude-opus-4-8-medium' }],
      },
    });

    mk('sk-free-acct', 'free');
    await __waitForModelCatalogSync();
    mk('sk-paid-acct', 'pro');
    await __waitForModelCatalogSync();

    assert.ok(fetchCalls.includes('sk-paid-acct'),
      'the newly added account must be fetched; a module-level latch skipped it entirely');
  });

  it('unions selectors across accounts rather than replacing them', async () => {
    // The regression that makes a naive de-latch worse than the latch:
    // setLiveCatalogSelectors clears and repopulates, so the second sync would
    // otherwise drop the first account's selectors.
    installDeps({
      perAccount: {
        'sk-free-acct': [{ selector: 'swe-1-6-slow' }],
        'sk-paid-acct': [{ selector: 'claude-opus-4-8-medium' }],
      },
    });

    mk('sk-free-acct', 'free');
    await __waitForModelCatalogSync();
    mk('sk-paid-acct', 'pro');
    await __waitForModelCatalogSync();

    assert.deepEqual(lastUnion(), ['claude-opus-4-8-medium', 'swe-1-6-slow'],
      'the resolver must hold the union of both accounts, not just the last one');
  });

  it('keeps paid-account routing inside each account own live catalog', async () => {
    installDeps({
      perAccount: {
        'sk-opus-acct': [{ selector: 'claude-opus-4-8-medium' }],
        'sk-gpt-acct': [{ selector: 'gpt-5-5-low' }],
      },
    });

    const opus = mk('sk-opus-acct', 'pro');
    await __waitForModelCatalogSync();
    const gpt = mk('sk-gpt-acct', 'pro');
    await __waitForModelCatalogSync();

    assert.equal(isConnectSelectorAllowedForAccount(opus, 'claude-opus-4-8-medium'), true);
    assert.equal(isConnectSelectorAllowedForAccount(opus, 'gpt-5-5-low'), false,
      'a paid tier is not permission to route a selector absent from this account catalog');
    assert.equal(isConnectSelectorAllowedForAccount(gpt, 'gpt-5-5-low'), true);
    assert.equal(isConnectSelectorAllowedForAccount(gpt, 'claude-opus-4-8-medium'), false,
      'mixed-pool union must not erase per-account routing boundaries');
  });

  it('keeps snapshot resolution for a paid account whose catalog has no LKG', async () => {
    installDeps({
      perAccount: {
        'sk-restricted-live': [{ selector: 'claude-opus-4-8-medium' }],
        'sk-empty-fallback': [],
      },
    });

    const restricted = mk('sk-restricted-live', 'pro');
    await __waitForModelCatalogSync();
    const fallback = mk('sk-empty-fallback', 'pro');
    await __waitForModelCatalogSync();

    assert.deepEqual(
      resolveConnectSelector('gpt-5.5', { warnOnFallback: false }),
      { selector: 'gpt-5-5-low', mapped: true },
      'one successful account must not globally disable a failed account snapshot fallback',
    );
    assert.equal(isConnectSelectorAllowedForAccount(restricted, 'gpt-5-5-low'), false,
      'the restricted account remains bound to its own live rows');
    assert.equal(isConnectSelectorAllowedForAccount(fallback, 'gpt-5-5-low'), true,
      'the account with no LKG keeps its tier-controlled snapshot fallback');

    created.splice(created.indexOf(fallback.id), 1);
    removeAccount(fallback.id);
    assert.equal(resolveConnectSelector('gpt-5.5', { warnOnFallback: false }).mapped, false,
      'removing the last fallback contributor makes the remaining live catalog authoritative');
  });

  it('keeps a catalog-independent synthetic selector behind the paid tier gate', async () => {
    installDeps({
      perAccount: {
        'sk-synthetic-pro': [{ selector: 'claude-opus-4-8-medium' }],
        'sk-synthetic-free': [{ selector: 'swe-1-6-slow' }],
      },
    });

    const pro = mk('sk-synthetic-pro', 'pro');
    const free = mk('sk-synthetic-free', 'free');
    await __waitForModelCatalogSync();

    assert.equal(isConnectSelectorAllowedForAccount(pro, 'subagent-default'), true,
      'synthetic selectors cannot be required to appear in GetCliModelConfigs');
    assert.equal(isConnectSelectorAllowedForAccount(free, 'subagent-default'), false,
      'catalog independence must not bypass the existing paid tier requirement');
  });

  it('does not let an empty response shrink the union', async () => {
    // Same asymmetry as the Cascade empty-catalog guard: an empty response is no
    // data, not "this account reaches nothing".
    let now = 2_000_000;
    installDeps({
      perAccount: {
        'sk-good-acct': [{ selector: 'swe-1-6-slow' }, { selector: 'claude-opus-4-8-medium' }],
        'sk-empty-acct': [],
      },
      now: () => now,
    });

    mk('sk-good-acct', 'pro');
    await __waitForModelCatalogSync();
    const afterGood = lastUnion();

    const emptyAcct = mk('sk-empty-acct', 'free');
    await __waitForModelCatalogSync();

    assert.deepEqual(lastUnion(), afterGood,
      'an empty catalog response must leave the existing union in place');
    assert.ok(afterGood.length === 2);

    // The union staying intact is NOT the interesting part — a union with an empty
    // contributor is unchanged arithmetically, so that assertion alone passes even
    // if the empty response was accepted and stored.
    //
    // The real damage of accepting it is that the account gets recorded as SYNCED
    // with nothing to contribute, and the per-key check then skips it forever — so
    // it never picks up selectors it genuinely gains later. Assert that instead:
    // the account must remain eligible, and a later non-empty response must land.
    const beforeRetry = fetchCalls.filter((k) => k === 'sk-empty-acct').length;
    setAccountStatus(emptyAcct.id, 'active');
    await __waitForModelCatalogSync();

    assert.equal(
      fetchCalls.filter((k) => k === 'sk-empty-acct').length,
      beforeRetry,
      'an empty response must not hot-loop when another lifecycle trigger fires inside backoff',
    );

    now += RETRY_BASE_MS;
    setAccountStatus(emptyAcct.id, 'active');
    await __waitForModelCatalogSync();
    const afterSecondEmpty = fetchCalls.filter((k) => k === 'sk-empty-acct').length;

    assert.equal(afterSecondEmpty, beforeRetry + 1,
      'an account that answered empty must stay eligible for re-sync, not be latched as synced');
    assert.deepEqual(lastUnion(), afterGood, 'a second empty answer still preserves the union');

    perAccountRows['sk-empty-acct'] = [{ selector: 'glm-5-2-none' }];
    now += (RETRY_BASE_MS * 2) - 1;
    setAccountStatus(emptyAcct.id, 'active');
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.filter((k) => k === 'sk-empty-acct').length, afterSecondEmpty,
      'consecutive empty responses use the doubled 60s delay');

    now += 1;
    setAccountStatus(emptyAcct.id, 'active');
    await __waitForModelCatalogSync();
    assert.ok(lastUnion().includes('glm-5-2-none'),
      'once it answers non-empty, its selectors must reach the union');
  });

  it('uses deterministic exponential backoff for failures and a success resets the ladder', async () => {
    let now = 3_000_000;
    let attemptNo = 0;
    installDeps({
      now: () => now,
      fetchConnectCatalog: async () => {
        attemptNo += 1;
        if (attemptNo === 1 || attemptNo === 2 || attemptNo === 4) {
          throw new Error(`catalog failure ${attemptNo}`);
        }
        return [{ selector: `recovered-${attemptNo}` }];
      },
    });

    mk('sk-backoff-failure', 'pro');
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 1, 'precondition: the initial request failed once');

    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 1, 'a trigger at the same timestamp stays inside 30s backoff');

    now += RETRY_BASE_MS - 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 1, 'the first retry is not eligible one millisecond early');

    now += 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 2, 'the first retry is eligible at exactly 30s');

    now += (RETRY_BASE_MS * 2) - 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 2, 'the second failure doubles the deterministic delay to 60s');

    now += 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 3, 'the second retry is eligible at exactly 60s');
    assert.deepEqual(lastUnion(), ['recovered-3']);

    // Expire the successful snapshot, fail once more, and prove the success above
    // cleared the streak: the next delay is 30s again, not the old ladder's 120s.
    now += (5 * 60 * 1000) + 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 4, 'the stale successful snapshot refreshes and fails');

    now += RETRY_BASE_MS - 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 4, 'the reset ladder still observes its fresh 30s delay');

    now += 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 5, 'success reset the ladder to the 30s base');
    assert.deepEqual(lastUnion(), ['recovered-5']);
  });

  it('stably staggers account retries instead of releasing a fleet-wide failure at once', async () => {
    let now = 3_250_000;
    const attempts = new Map();
    installDeps({
      now: () => now,
      retryJitterBasisPoints: ({ apiKey }) => (
        apiKey === 'sk-jitter-early' ? 8_000 : 10_000
      ),
      fetchConnectCatalog: async ({ token }) => {
        attempts.set(token, (attempts.get(token) || 0) + 1);
        throw new Error('shared upstream outage');
      },
    });

    mk('sk-jitter-early', 'pro');
    mk('sk-jitter-late', 'pro');
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-early'), 1);
    assert.equal(attempts.get('sk-jitter-late'), 1);

    now += 24_000 - 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-early'), 1, '80% account must not retry before 24s');
    assert.equal(attempts.get('sk-jitter-late'), 1);

    now += 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-early'), 2, '80% account retries at 24s');
    assert.equal(attempts.get('sk-jitter-late'), 1, '100% account remains held until 30s');

    now += 6_000;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-early'), 2,
      'the early account starts its doubled delay from its own retry time');
    assert.equal(attempts.get('sk-jitter-late'), 2, 'the late account retries at 30s');
  });

  it('derives stable retry jitter from the actual credential identity', async () => {
    let now = 3_400_000;
    const attempts = new Map();
    installDeps({
      now: () => now,
      // Deliberately omit the injected jitter seam. These fixed credentials pin
      // the production FNV-1a path and its 80%-100% basis-point mapping.
      retryJitterBasisPoints: null,
      fetchConnectCatalog: async ({ token }) => {
        attempts.set(token, (attempts.get(token) || 0) + 1);
        throw new Error('shared upstream outage');
      },
    });

    mk('sk-jitter-stable-a', 'pro'); // basis=9993, first delay=29_979ms
    mk('sk-jitter-stable-b', 'pro'); // basis=8758, first delay=26_274ms
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-stable-a'), 1);
    assert.equal(attempts.get('sk-jitter-stable-b'), 1);

    now += 26_273;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-stable-a'), 1);
    assert.equal(attempts.get('sk-jitter-stable-b'), 1,
      'the 8758-basis credential must remain held one millisecond before its boundary');

    now += 1;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-stable-a'), 1,
      'the 9993-basis credential remains held until its own deterministic boundary');
    assert.equal(attempts.get('sk-jitter-stable-b'), 2,
      'the 8758-basis credential retries at exactly 26_274ms');

    now += 3_705;
    trySyncModelCatalog();
    await __waitForModelCatalogSync();
    assert.equal(attempts.get('sk-jitter-stable-a'), 2,
      'the 9993-basis credential retries at exactly 29_979ms');
    assert.equal(attempts.get('sk-jitter-stable-b'), 2,
      'the earlier credential is already on its doubled per-credential delay');
  });

  it('caps a permanently failing catalog at five minutes', async () => {
    let now = 3_500_000;
    installDeps({
      now: () => now,
      fetchConnectCatalog: async () => { throw new Error('still unavailable'); },
    });

    mk('sk-backoff-cap', 'pro');
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 1);

    // failure 1..6 schedule 30, 60, 120, 240, 300, 300 seconds.
    // The repeated 300 proves the cap is stable instead of merely crossing it once.
    const delays = [30, 60, 120, 240, 300, 300].map((seconds) => seconds * 1000);
    for (const [index, delay] of delays.entries()) {
      now += delay - 1;
      trySyncModelCatalog();
      await __waitForModelCatalogSync();
      assert.equal(fetchCalls.length, index + 1,
        `failure ${index + 1} retried before its ${delay}ms delay elapsed`);

      now += 1;
      trySyncModelCatalog();
      await __waitForModelCatalogSync();
      assert.equal(fetchCalls.length, index + 2,
        `failure ${index + 1} did not retry at its exact ${delay}ms boundary`);
    }
  });

  it('clears empty-response backoff when the account is disabled and re-enabled', async () => {
    let now = 4_000_000;
    let attemptNo = 0;
    installDeps({
      now: () => now,
      fetchConnectCatalog: async () => {
        attemptNo += 1;
        return attemptNo === 1 ? [] : [{ selector: 'fresh-lifecycle-selector' }];
      },
    });

    const acct = mk('sk-backoff-lifecycle', 'free');
    await __waitForModelCatalogSync();
    assert.equal(fetchCalls.length, 1, 'precondition: the empty response armed backoff');

    setAccountStatus(acct.id, 'disabled');
    setAccountStatus(acct.id, 'active');
    await __waitForModelCatalogSync();

    assert.equal(fetchCalls.length, 2,
      'a new active lifecycle must fetch immediately instead of inheriting old backoff');
    assert.deepEqual(lastUnion(), ['fresh-lifecycle-selector']);
  });

  it('discards an in-flight response after the account is disabled', async () => {
    const pending = deferred();
    installDeps({ fetchConnectCatalog: () => pending.promise });

    const acct = mk('sk-disable-inflight', 'pro');
    assert.equal(fetchCalls.length, 1);
    setAccountStatus(acct.id, 'disabled');

    pending.resolve([{ selector: 'stale-after-disable' }]);
    await flushAsync();

    assert.deepEqual(liveWrites, [], 'a disabled account cannot commit its old response');
  });

  it('discards an in-flight response after the account is removed', async () => {
    const pending = deferred();
    installDeps({ fetchConnectCatalog: () => pending.promise });

    const acct = mk('sk-remove-inflight', 'pro');
    assert.equal(fetchCalls.length, 1);
    created.splice(created.indexOf(acct.id), 1);
    removeAccount(acct.id);

    pending.resolve([{ selector: 'stale-after-remove' }]);
    await flushAsync();

    assert.deepEqual(liveWrites, [], 'a removed account cannot commit its old response');
  });

  it('discards an in-flight response after the account key changes', async () => {
    const pending = new Map();
    installDeps({
      fetchConnectCatalog: ({ token }) => {
        const request = deferred();
        pending.set(token, request);
        return request.promise;
      },
    });

    const acct = mk('sk-key-before', 'pro');
    setAccountTokens(acct.id, { apiKey: 'sk-key-after' });
    assert.deepEqual(fetchCalls, ['sk-key-before', 'sk-key-after']);

    pending.get('sk-key-after').resolve([{ selector: 'current-key-selector' }]);
    await __waitForModelCatalogSync();
    pending.get('sk-key-before').resolve([{ selector: 'stale-key-selector' }]);
    await flushAsync();

    assert.deepEqual(lastUnion(), ['current-key-selector']);
    assert.ok(!liveWrites.flat().includes('stale-key-selector'),
      'the retired key must never write, even when it resolves last');
  });

  it('withdraws already-accepted rows immediately when an account key rotates', async () => {
    installDeps({
      perAccount: {
        'sk-stable-baseline': [{ selector: 'baseline-selector' }],
        'sk-accepted-before': [{ selector: 'paid-selector-from-retired-key' }],
        'sk-empty-after': [],
      },
    });

    mk('sk-stable-baseline', 'free');
    await __waitForModelCatalogSync();
    const acct = mk('sk-accepted-before', 'pro');
    await __waitForModelCatalogSync();
    assert.deepEqual(lastUnion(), ['baseline-selector', 'paid-selector-from-retired-key']);

    setAccountTokens(acct.id, { apiKey: 'sk-empty-after' });
    assert.deepEqual(lastUnion(), ['baseline-selector'],
      'key invalidation must synchronously withdraw rows accepted under the retired credential');
    await __waitForModelCatalogSync();
    assert.deepEqual(lastUnion(), ['baseline-selector'],
      'an empty replacement catalog must not resurrect selectors from the old key');
  });

  it('ignores a retired lifecycle rejection instead of extending the replacement backoff', async () => {
    let now = 4_500_000;
    const pending = [];
    installDeps({
      now: () => now,
      fetchConnectCatalog: () => {
        const request = deferred();
        pending.push(request);
        return request.promise;
      },
    });

    const acct = mk('sk-reject-aba', 'pro');
    setAccountStatus(acct.id, 'disabled');
    setAccountStatus(acct.id, 'active');
    assert.equal(pending.length, 2);

    pending[0].reject(new Error('retired lifecycle failure'));
    await flushAsync();
    pending[1].resolve([]);
    await __waitForModelCatalogSync();

    now += RETRY_BASE_MS;
    trySyncModelCatalog();
    assert.equal(pending.length, 3,
      'only lifecycle B\'s empty response may arm backoff; lifecycle A rejection must be ignored');
    pending[2].resolve([{ selector: 'replacement-after-one-delay' }]);
    await __waitForModelCatalogSync();
    assert.deepEqual(lastUnion(), ['replacement-after-one-delay']);
  });

  it('uses request identity to defeat same-key disable-enable ABA', async () => {
    const pending = [];
    installDeps({
      fetchConnectCatalog: () => {
        const request = deferred();
        pending.push(request);
        return request.promise;
      },
    });

    const acct = mk('sk-same-key-aba', 'pro');
    assert.equal(pending.length, 1, 'precondition: lifecycle A has one pending request');

    setAccountStatus(acct.id, 'disabled');
    setAccountStatus(acct.id, 'active');
    assert.equal(pending.length, 2,
      'lifecycle B must start a fresh request even though the key string is unchanged');

    pending[0].resolve([{ selector: 'stale-lifecycle-a' }]);
    await flushAsync();
    assert.deepEqual(liveWrites, [],
      'matching active status and key are insufficient: lifecycle A must still be rejected');

    pending[1].resolve([{ selector: 'current-lifecycle-b' }]);
    await __waitForModelCatalogSync();
    assert.deepEqual(lastUnion(), ['current-lifecycle-b']);
  });

  it('withdraws a removed account\'s contribution from the union', async () => {
    installDeps({
      perAccount: {
        'sk-stay-acct': [{ selector: 'swe-1-6-slow' }],
        'sk-go-acct': [{ selector: 'claude-opus-4-8-medium' }],
      },
    });

    const stay = mk('sk-stay-acct', 'free');
    await __waitForModelCatalogSync();
    const go = mk('sk-go-acct', 'pro');
    await __waitForModelCatalogSync();
    assert.equal(lastUnion().length, 2, 'precondition: both contributed');

    // Remove the paid account directly (not via the shared cleanup list).
    const goIndex = created.indexOf(go.id);
    if (goIndex >= 0) created.splice(goIndex, 1);
    removeAccount(go.id);
    await __waitForModelCatalogSync();

    assert.ok(!lastUnion().includes('claude-opus-4-8-medium'),
      'a departed account must stop widening pool-wide discovery');
    assert.ok(stay.id, 'the remaining account is untouched');
  });

  it('does not re-fetch an account whose key has not changed', async () => {
    // The de-latch must not turn into a per-request fetch storm: the recorded value
    // is the apiKey, so an unchanged key stays satisfied and is skipped.
    installDeps({
      perAccount: { 'sk-stable-acct': [{ selector: 'swe-1-6-slow' }] },
    });

    const acct = mk('sk-stable-acct', 'pro');
    await __waitForModelCatalogSync();
    const firstCount = fetchCalls.filter((k) => k === 'sk-stable-acct').length;
    assert.equal(firstCount, 1, 'precondition: synced exactly once');

    // Drive the same trigger again with nothing changed.
    setAccountStatus(acct.id, 'active');
    await __waitForModelCatalogSync();

    assert.equal(
      fetchCalls.filter((k) => k === 'sk-stable-acct').length,
      firstCount,
      'an unchanged key must not be re-fetched — the de-latch is per key, not per call',
    );
  });
});
