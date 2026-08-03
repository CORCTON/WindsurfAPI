// #234 prerequisite — a pool-wide drought must not be declared from a single
// measured account.
//
// isDroughtMode skips accounts with no numeric weeklyPercent, so
// `droughtCount === knownCount` meant "every account we happen to have data for
// is dry" while reading as "the pool is dry". refreshCredits writes
// `credits = { lastError, fetchedAt }` when GetUserStatus fails, which is exactly
// that shape — so one dry account plus 39 failed refreshes restricted a
// 40-account pool to free models.
//
// These tests drive the public API only (addAccountByKey / getAccountInternal /
// isDroughtMode / getDroughtSummary) so they keep working if the tally is
// refactored. They assert BOTH directions: the floor must suppress an
// unrepresentative sample AND must not suppress a genuine drought.

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey, removeAccount, getAccountInternal,
  isDroughtMode, getDroughtSummary,
} from '../src/auth.js';

const created = [];

function mk(credits, status = 'active') {
  const a = addAccountByKey('sk-cover-' + Math.random().toString(36).slice(2, 12), 'cover');
  const acct = getAccountInternal(a.id);
  acct.status = status;
  acct.credits = credits;
  created.push(a.id);
  return acct;
}

/** The exact credits shape refreshCredits persists when GetUserStatus fails. */
function refreshFailed() {
  return { lastError: 'subscription has been canceled', fetchedAt: Date.now() };
}

function dry() { return { weeklyPercent: 1, dailyPercent: 0 }; }
function healthy() { return { weeklyPercent: 80, dailyPercent: 80 }; }

afterEach(() => {
  while (created.length) removeAccount(created.pop());
});

describe('drought coverage floor (#234 prerequisite)', () => {
  it('does not declare drought from one measured account in a 40-account pool', () => {
    mk(dry());
    for (let i = 0; i < 39; i++) mk(refreshFailed());

    assert.equal(isDroughtMode(), false,
      'one dry account out of 40 must not restrict the whole pool to free models');

    const s = getDroughtSummary();
    assert.equal(s.coverageMet, false, 'coverage must be reported as unmet');
    assert.equal(s.quotaKnownAccounts, 1, 'exactly one account has a numeric weeklyPercent');
    assert.equal(s.activeAccounts, 40);
  });

  it('still declares drought when the whole pool is measured and dry', () => {
    for (let i = 0; i < 40; i++) mk(dry());

    assert.equal(isDroughtMode(), true,
      'the floor must not suppress a genuine pool-wide drought');
    const s = getDroughtSummary();
    assert.equal(s.coverageMet, true);
    assert.equal(s.quotaKnownAccounts, 40);
    assert.equal(s.droughtAccounts, 40);
  });

  it('declares drought on a single-account pool whose one account is dry', () => {
    // A 1-account deployment is fully measured, so the majority rule is satisfied.
    // Guards against expressing the floor in a way that needs >= 2 accounts.
    mk(dry());
    assert.equal(isDroughtMode(), true);
    assert.equal(getDroughtSummary().coverageMet, true);
  });

  it('declares drought once a strict majority is measured and all of them are dry', () => {
    for (let i = 0; i < 21; i++) mk(dry());
    for (let i = 0; i < 19; i++) mk(refreshFailed());

    assert.equal(isDroughtMode(), true, '21/40 measured is a strict majority');
    assert.equal(getDroughtSummary().coverageMet, true);
  });

  it('treats exactly half measured as insufficient coverage', () => {
    // Boundary: 20*2 > 40 is false, so half is NOT enough. Pinned explicitly
    // because an off-by-one here (>= instead of >) silently restores the old
    // behaviour for even-sized pools.
    for (let i = 0; i < 20; i++) mk(dry());
    for (let i = 0; i < 20; i++) mk(refreshFailed());

    assert.equal(isDroughtMode(), false);
    assert.equal(getDroughtSummary().coverageMet, false);
    assert.equal(getDroughtSummary().quotaKnownAccounts, 20);
  });

  it('one measured healthy account suppresses drought even with coverage met', () => {
    // Coverage is satisfied here, so this asserts the ORIGINAL rule still holds
    // on top of the floor rather than being replaced by it.
    for (let i = 0; i < 20; i++) mk(dry());
    mk(healthy());
    for (let i = 0; i < 19; i++) mk(refreshFailed());

    const s = getDroughtSummary();
    assert.equal(s.coverageMet, true, 'coverage is met in this scenario');
    assert.equal(s.droughtAccounts, 20);
    assert.equal(s.quotaKnownAccounts, 21);
    assert.equal(isDroughtMode(), false, 'a healthy measured account still means no drought');
  });

  it('reports zero quota-known accounts when every refresh failed', () => {
    for (let i = 0; i < 6; i++) mk(refreshFailed());

    assert.equal(isDroughtMode(), false);
    const s = getDroughtSummary();
    assert.equal(s.quotaKnownAccounts, 0);
    // knownAccounts counts any credits object, including the failed-refresh
    // shape. The two counts differing IS the point — they used to share a name.
    assert.equal(s.knownAccounts, 6);
    assert.notEqual(s.knownAccounts, s.quotaKnownAccounts);
  });

  it('excludes non-active accounts from the coverage denominator', () => {
    // A disabled account can neither be measured nor be restricted, so counting
    // it in the denominator would make coverage unreachable for pools with a few
    // disabled entries.
    mk(dry());
    mk(refreshFailed(), 'disabled');
    mk(refreshFailed(), 'disabled');

    const s = getDroughtSummary();
    assert.equal(s.activeAccounts, 1, 'only the active account counts');
    assert.equal(s.coverageMet, true);
    assert.equal(isDroughtMode(), true);
  });
});
