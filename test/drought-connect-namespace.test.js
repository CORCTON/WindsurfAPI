// #234 — the drought gate must judge Connect selectors in the Connect namespace.
//
// isModelBlockedByDrought answers from getTierModels('free'), which is MODELS
// space. The Connect backend routes by selector, and the two sets have zero
// overlap. Measured on a drought-active pool before this split existed:
//
//   isModelBlockedByDrought('swe-1-6-slow')     = true   ← the ONE free-reachable
//                                                          connect selector
//   isModelBlockedByDrought('gemini-2.5-flash') = false  ← connect can't route to it
//   isModelBlockedByDrought('TOTAL-GARBAGE')    = true   ← "absent from the free
//                                                          table", not "is premium"
//
// So wiring the gate while reusing the old predicate would block the only model
// that still works during a drought and admit one that cannot run at all.
//
// These tests assert the two predicates stay DISJOINT and that each is right for
// its own namespace. Selector names are written literally rather than imported
// from FREE_REACHABLE_SELECTORS — importing the set the implementation reads
// would make the assertions pass regardless of its contents.

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey, removeAccount, getAccountInternal,
  isDroughtMode, isModelBlockedByDrought, isConnectSelectorBlockedByDrought,
  getDroughtSummary,
} from '../src/auth.js';

const CONNECT_FREE_SELECTOR = 'swe-1-6-slow';
const CASCADE_FREE_KEY = 'gemini-2.5-flash';
const PREMIUM_SELECTOR = 'claude-opus-4-9-medium';

const created = [];
const ORIGINAL_RESTRICT = process.env.DROUGHT_RESTRICT_PREMIUM;
const ORIGINAL_CONNECT = process.env.DEVIN_CONNECT;

function mkDryPool(n = 3) {
  for (let i = 0; i < n; i++) {
    const a = addAccountByKey('sk-ns-' + Math.random().toString(36).slice(2, 12), 'ns');
    const acct = getAccountInternal(a.id);
    acct.status = 'active';
    acct.credits = { weeklyPercent: 1, dailyPercent: 0 };
    created.push(a.id);
  }
}

afterEach(() => {
  while (created.length) removeAccount(created.pop());
  if (ORIGINAL_RESTRICT === undefined) delete process.env.DROUGHT_RESTRICT_PREMIUM;
  else process.env.DROUGHT_RESTRICT_PREMIUM = ORIGINAL_RESTRICT;
  if (ORIGINAL_CONNECT === undefined) delete process.env.DEVIN_CONNECT;
  else process.env.DEVIN_CONNECT = ORIGINAL_CONNECT;
});

describe('drought gate — Connect selector namespace (#234)', () => {
  it('lets the free-reachable Connect selector through during a drought', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    mkDryPool();
    assert.equal(isDroughtMode(), true, 'precondition: pool is in drought');

    assert.equal(isConnectSelectorBlockedByDrought(CONNECT_FREE_SELECTOR), false,
      'blocking swe-1-6-slow would kill the only model that still runs in a drought');
  });

  it('blocks a premium Connect selector during a drought', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    mkDryPool();
    assert.equal(isConnectSelectorBlockedByDrought(PREMIUM_SELECTOR), true);
  });

  it('blocks a Cascade free model, which Connect cannot route to', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    mkDryPool();
    // Admitting this would send the client at a model the connect backend has no
    // route for — an error instead of a working fallback.
    assert.equal(isConnectSelectorBlockedByDrought(CASCADE_FREE_KEY), true);
  });

  it('answers the OPPOSITE of the MODELS-space predicate on both namespace anchors', () => {
    // The regression this whole split exists to prevent. If someone "simplifies"
    // isConnectSelectorBlockedByDrought back into isModelBlockedByDrought, these
    // two pairs collapse and this test fails.
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    mkDryPool();

    assert.equal(isModelBlockedByDrought(CONNECT_FREE_SELECTOR), true,
      'MODELS space wrongly considers the connect free selector premium');
    assert.equal(isConnectSelectorBlockedByDrought(CONNECT_FREE_SELECTOR), false);

    assert.equal(isModelBlockedByDrought(CASCADE_FREE_KEY), false);
    assert.equal(isConnectSelectorBlockedByDrought(CASCADE_FREE_KEY), true);
  });

  it('respects the restriction toggle', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '0';
    mkDryPool();
    assert.equal(isDroughtMode(), true, 'still a drought, just not enforcing');
    assert.equal(isConnectSelectorBlockedByDrought(PREMIUM_SELECTOR), false);
  });

  it('blocks nothing when the pool is not in drought', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    for (let i = 0; i < 3; i++) {
      const a = addAccountByKey('sk-ns-ok-' + Math.random().toString(36).slice(2, 12), 'ns');
      const acct = getAccountInternal(a.id);
      acct.status = 'active';
      acct.credits = { weeklyPercent: 80, dailyPercent: 80 };
      created.push(a.id);
    }
    assert.equal(isDroughtMode(), false);
    assert.equal(isConnectSelectorBlockedByDrought(PREMIUM_SELECTOR), false);
  });

  it('treats an empty selector as not blocked', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    mkDryPool();
    assert.equal(isConnectSelectorBlockedByDrought(''), false);
    assert.equal(isConnectSelectorBlockedByDrought(null), false);
    assert.equal(isConnectSelectorBlockedByDrought(undefined), false);
  });
});

describe('getDroughtSummary free list resolves per backend (#234)', () => {
  it('reports Connect selectors when the connect backend is active', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    mkDryPool();

    const summary = getDroughtSummary({ env: { ...process.env, DEVIN_CONNECT: '1' } });
    assert.ok(summary.freeTierModels.includes(CONNECT_FREE_SELECTOR),
      'the drought error message must offer a model connect can actually route to');
    assert.ok(!summary.freeTierModels.includes(CASCADE_FREE_KEY));
  });

  it('reports Cascade models when the connect backend is off', () => {
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    mkDryPool();

    const summary = getDroughtSummary({ env: { ...process.env, DEVIN_CONNECT: '0' } });
    assert.ok(summary.freeTierModels.includes(CASCADE_FREE_KEY));
    assert.ok(!summary.freeTierModels.includes(CONNECT_FREE_SELECTOR));
  });

  it('reads the backend through the runtime switch, not process.env directly', () => {
    // The Dashboard can hot-switch devinConnect while DEVIN_CONNECT is unset.
    // Reading process.env directly reports the wrong namespace in exactly that
    // case, so the per-request env argument has to win over the ambient one.
    process.env.DROUGHT_RESTRICT_PREMIUM = '1';
    delete process.env.DEVIN_CONNECT;
    mkDryPool();

    const ambient = getDroughtSummary();
    assert.ok(ambient.freeTierModels.includes(CASCADE_FREE_KEY),
      'with the switch off the Cascade list applies');

    const perRequest = getDroughtSummary({ env: { DEVIN_CONNECT: '1' } });
    assert.ok(perRequest.freeTierModels.includes(CONNECT_FREE_SELECTOR),
      'a per-request env with connect on must resolve the Connect list');
  });
});
