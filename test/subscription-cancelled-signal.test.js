// A cancelled subscription was invisible to the pool.
//
// Measured on a real account (2026-08-03): GetUserStatus returned
// 403 permission_denied "Your subscription has been canceled. Resubscribe to continue."
// while the catalog RPC — which does not check entitlement — still returned 167
// selectors, and chat failed with a GENERIC upstream "an internal error occurred".
//
// Chat's failure is classified UPSTREAM_INTERNAL and deliberately NOT charged to the
// account (one upstream wobble must not disable the pool), so the account sat at
// status='active', errorCount=0, advertising 163 models, failing 100% of chat requests,
// and would never be deprioritised. The only RPC that knew the real reason wrote it to
// credits.lastError and nothing read it.
//
// The mechanism to act on this already existed — looksLikeBanSignal matches the message
// and reportBanSignal needs two hits in 30 minutes before disabling. It simply was not
// wired to the refresh path. These tests pin the wiring AND the discrimination, because
// wiring it too eagerly is the opposite failure: a deploy-time blip must not disable a
// healthy account.

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey, removeAccount, getAccountInternal,
  looksLikeBanSignal, reportBanSignal,
} from '../src/auth.js';

/** The exact string the real upstream produced, error envelope included. */
const REAL_403 = 'GetUserStatus server.self-serve.windsurf.com → 403: '
  + '{"code":"permission_denied","message":"Your subscription has been canceled. '
  + 'Resubscribe to continue. (trace ID: 6b5aef2577127a7e45c99b2261c5ad94)"}';

/** What chat returns for the SAME underlying cause — deliberately uninformative. */
const CHAT_GENERIC = 'an internal error occurred (trace ID: d46e096d14a9b7bde97616a81517f02b)';

const created = [];

function mkActive(label = 'sub') {
  const a = addAccountByKey('sk-sub-' + Math.random().toString(36).slice(2, 12), label);
  const acct = getAccountInternal(a.id);
  acct.status = 'active';
  created.push(a.id);
  return acct;
}

afterEach(() => {
  while (created.length) removeAccount(created.pop());
});

describe('cancelled-subscription signal is recognised', () => {
  it('matches the real 403 message, envelope and all', () => {
    // Pinned against the verbatim upstream string rather than a hand-written excerpt:
    // the detector runs on the wrapped message refreshCredits actually catches, not on
    // the bare `message` field.
    assert.equal(looksLikeBanSignal(REAL_403), true);
  });

  it('does NOT match the generic upstream error chat receives', () => {
    // The discrimination that makes wiring this safe. If this ever returns true, every
    // transient upstream fault starts disabling accounts.
    assert.equal(looksLikeBanSignal(CHAT_GENERIC), false);
    assert.equal(looksLikeBanSignal('an internal error occurred'), false);
    assert.equal(looksLikeBanSignal('CAPACITY'), false);
    assert.equal(looksLikeBanSignal('DEADLINE_EXCEEDED'), false);
  });
});

describe('cancelled-subscription signal reaches account state', () => {
  it('does not disable on a single hit', () => {
    // Windsurf returns transient auth-shaped errors during deploys, so one hit must be
    // tolerated. refreshAllCredits runs every 15 min; a real cancellation trips again on
    // the next round, inside the 30-minute window.
    const acct = mkActive();

    const flipped = reportBanSignal(acct.apiKey, REAL_403);

    assert.equal(flipped, false, 'one ban-shaped refresh failure must not disable');
    assert.equal(acct.status, 'active');
  });

  it('disables after a second hit inside the window', () => {
    const acct = mkActive();

    reportBanSignal(acct.apiKey, REAL_403);
    const flipped = reportBanSignal(acct.apiKey, REAL_403);

    assert.equal(flipped, true);
    assert.equal(acct.status, 'banned',
      'a persistently cancelled subscription must stop being handed out');
  });

  it('does not disable when the two hits are far apart', () => {
    // The window is what separates "persistent" from "twice in a month". Driven through
    // the public windowMs argument rather than by manipulating clocks.
    //
    // windowMs must be 0, not 1: the check is `now - last < windowMs`, and two calls in
    // the same millisecond give `0 < 1` — inside a 1ms window, so the account flips and
    // the test fails for a timing reason that has nothing to do with the contract. Zero
    // makes it deterministic (`0 < 0` is never true), so the counter resets every call.
    const acct = mkActive();

    reportBanSignal(acct.apiKey, REAL_403, { windowMs: 0 });
    const flipped = reportBanSignal(acct.apiKey, REAL_403, { windowMs: 0 });

    assert.equal(flipped, false, 'hits outside the window must not accumulate');
    assert.equal(acct.status, 'active');
  });

  it('leaves an account alone when the failure is not ban-shaped', () => {
    // The regression that matters most: a network blip or capacity fault must never
    // reach reportBanSignal at all. Asserts the guard, not just the detector.
    const acct = mkActive();

    if (looksLikeBanSignal(CHAT_GENERIC)) reportBanSignal(acct.apiKey, CHAT_GENERIC);
    if (looksLikeBanSignal(CHAT_GENERIC)) reportBanSignal(acct.apiKey, CHAT_GENERIC);

    assert.equal(acct.status, 'active',
      'transient upstream faults must not disable an account, however many times they recur');
  });
});

describe('refreshCredits wiring (source contract)', () => {
  it('routes a ban-shaped refresh failure into the ban detector', async () => {
    // Structural, and deliberately so: refreshCredits performs a real network call, so
    // reaching its catch block behaviourally needs either an injected transport or a live
    // 403. What this pins is that the catch block CONSULTS the detector — the exact wiring
    // that was missing while the signal existed and was thrown away.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');

    // Comments stripped: a guard satisfied by prose in its own explanation is an
    // antipattern this repo has already been bitten by.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

    const fnStart = code.indexOf('export async function refreshCredits');
    assert.ok(fnStart > 0, 'refreshCredits must be findable');
    // Bound the slice at the next top-level export so this cannot accidentally read
    // wiring that belongs to a different function.
    const next = code.indexOf('\nexport ', fnStart + 10);
    const body = code.slice(fnStart, next > 0 ? next : undefined);

    assert.match(body, /looksLikeBanSignal\s*\(/,
      'refreshCredits must consult looksLikeBanSignal on failure');
    assert.match(body, /reportBanSignal\s*\(/,
      'and must report a ban-shaped failure so two rounds can disable the account');
  });
});
