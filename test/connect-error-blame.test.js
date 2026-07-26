// Who gets blamed for a failed DEVIN_CONNECT request.
//
// finalizeConnectAccount's job is to separate "this ACCOUNT is bad" from "this
// REQUEST was bad". Getting it wrong in the second direction is expensive: a
// caller looping on a request the upstream always rejects walks the whole pool
// offline, three errors at a time, and the status flip is persisted to
// accounts.json so a restart does not undo it.
//
// That exact bug was fixed once for CONTENT_BLOCKED (upstream rejected the prompt)
// and MODEL_BLOCKED (tier wall). UPSTREAM_ERROR was missed: it carries the gRPC
// `internal` class, which classifyUpstreamError itself documents as "PERMANENT
// client mistakes (short fingerprint, gzipped request body) — fails identically
// every retry". The session token is alive and the account is healthy, yet it fell
// through to the generic reportError and got evicted.
//
// The eviction only shows up when a healthy peer exists — a single-account pool is
// covered by the last-account exemption, which is why this went unnoticed.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey, removeAccount, getAccountInternal,
} from '../src/auth.js';
import { finalizeConnectAccount } from '../src/handlers/chat.js';

const created = [];
function seed(label) {
  const a = addAccountByKey(`devin-session-token$blame-${label}-${Math.random().toString(36).slice(2)}`, label);
  created.push(a.id);
  return getAccountInternal(a.id);
}
function fail(acct, code, times = 3) {
  for (let i = 0; i < times; i++) {
    const err = Object.assign(new Error(`simulated ${code}`), { code });
    finalizeConnectAccount(
      { id: acct.id, apiKey: acct.apiKey },
      { model: 'swe-1-6-slow', selector: 'swe-1-6-slow', startTime: Date.now(), err },
    );
  }
  return getAccountInternal(acct.id);
}

beforeEach(() => { created.length = 0; });
afterEach(() => { while (created.length) removeAccount(created.pop()); });

describe('request-side failures never evict the account', () => {
  // A healthy peer must exist, otherwise the last-account exemption masks the
  // eviction and the test would pass for the wrong reason.
  const REQUEST_SIDE = ['UPSTREAM_ERROR', 'CONTENT_BLOCKED', 'MODEL_BLOCKED'];

  for (const code of REQUEST_SIDE) {
    it(`${code} x3 keeps the account in rotation (fault is in the request)`, () => {
      const victim = seed(`v-${code}`);
      seed(`peer-${code}`); // voids the last-account exemption
      const after = fail(victim, code);
      assert.notEqual(after.status, 'error',
        `${code} evicted a healthy account — a caller looping on a bad request would `
        + 'walk the whole pool offline three errors at a time');
      assert.notEqual(after.errorCount, 3,
        `${code} must not accumulate the eviction counter`);
    });
  }

  it('a client looping on malformed requests cannot drain the pool', () => {
    const accounts = [seed('p1'), seed('p2'), seed('p3')];
    for (const a of accounts) fail(a, 'UPSTREAM_ERROR', 6);
    const alive = accounts.filter(a => getAccountInternal(a.id).status !== 'error');
    assert.equal(alive.length, accounts.length,
      'every account must survive — the requests were malformed, not the accounts');
  });
});

describe('account-side failures still count against the account', () => {
  it('an unclassified account fault still evicts after the streak', () => {
    // Guard against over-correcting: a genuine account error must still be able
    // to remove a key from rotation.
    const victim = seed('genuine');
    seed('peer-genuine');
    const after = fail(victim, 'SOME_UNKNOWN_ACCOUNT_FAULT');
    assert.equal(after.status, 'error',
      'a genuinely faulty account must still be evicted after the error streak');
  });
});
