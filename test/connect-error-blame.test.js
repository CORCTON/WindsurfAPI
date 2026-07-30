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
import { readFileSync } from 'node:fs';
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
  // STREAM_TRUNCATED joined this list when the truncation detection shipped: the
  // socket ending mid-answer with no end-of-stream frame is a TRANSPORT fault
  // (ECONNRESET class), not an account fault. Without an explicit branch it fell
  // through to the generic reportError — so a flaky network path to the upstream
  // would evict healthy accounts three truncations at a time, reproducing the exact
  // bug the CONTENT_BLOCKED / UPSTREAM_ERROR exemptions above were added to remove.
  // TIMEOUT / DEADLINE_EXCEEDED / NO_TOKEN joined next, found by asking the obvious
  // follow-up question: STREAM_TRUNCATED landed in the silent fallthrough by
  // accident, so WHICH OTHER codes are down there? Measured, all three evicted a
  // healthy account in 3 calls. TIMEOUT and DEADLINE_EXCEEDED are upstream stalls
  // (devin-connect.js says so in its own comments); NO_TOKEN is a CONFIGURATION
  // fault, so charging account health for it is doubly wrong.
  const REQUEST_SIDE = ['UPSTREAM_ERROR', 'CONTENT_BLOCKED', 'MODEL_BLOCKED', 'STREAM_TRUNCATED',
    'TIMEOUT', 'DEADLINE_EXCEEDED', 'NO_TOKEN'];

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

// ─── 结构守卫 ───────────────────────────────────────────────
//
// The bug above happened TWICE for the same structural reason: the classification
// ends in a bare `else reportError(apiKey)`, so any error code nobody thought about
// is silently treated as an account fault and evicts healthy accounts. First
// STREAM_TRUNCATED landed there, then TIMEOUT / DEADLINE_EXCEEDED / NO_TOKEN.
//
// A behavioural test cannot catch the NEXT one — the code that will land there
// hasn't been written yet. So this guard reads both sources and fails when
// devin-connect.js can emit a code that finalizeConnectAccount does not classify.
describe('structural guard — every upstream code has an explicit blame decision', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('no code reaches the silent `else reportError` fallthrough unclassified', () => {
    const connectSrc = read('../src/devin-connect.js');
    const chatSrc = read('../src/handlers/chat.js');

    // Every code devin-connect.js attaches to an Error it throws.
    const emitted = new Set(
      [...connectSrc.matchAll(/code:\s*'([A-Z_]+)'/g)].map(m => m[1]),
    );
    assert.ok(emitted.size >= 10, `expected the real code vocabulary, got ${emitted.size}`);

    // Everything finalizeConnectAccount decides explicitly: either an `err.code ===`
    // arm, or a member of the TRANSPORT_FAULT_CODES set. Read from the set
    // declaration through the end of the function — the `err.code ===` arms live
    // INSIDE finalizeConnectAccount, which follows the declaration.
    const from = chatSrc.indexOf('const TRANSPORT_FAULT_CODES');
    assert.notEqual(from, -1, 'TRANSPORT_FAULT_CODES declaration not found');
    const end = chatSrc.indexOf('\n}', chatSrc.indexOf('releaseAccountById(acct.id)', from));
    const body = chatSrc.slice(from, end > from ? end : undefined);
    const classified = new Set([
      ...[...body.matchAll(/err\.code === '([A-Z_]+)'/g)].map(m => m[1]),
      ...[...(body.match(/const TRANSPORT_FAULT_CODES = new Set\(\[([^\]]*)\]/) || [, ''])[1]
        .matchAll(/'([A-Z_]+)'/g)].map(m => m[1]),
    ]);

    const unclassified = [...emitted].filter(c => !classified.has(c));
    assert.deepEqual(unclassified, [],
      'these codes fall through to `else reportError`, which charges the account error '
      + 'budget and evicts healthy accounts after errorStreakThreshold hits. Decide '
      + 'explicitly: a real account fault stays in the fallthrough, anything else '
      + 'belongs in TRANSPORT_FAULT_CODES or its own arm. '
      + `Unclassified: ${unclassified.join(', ')}`);
  });
});
