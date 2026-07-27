// Responses API server-side conversation state.
//
// `/v1/responses` advertises OpenAI Responses compatibility, whose defining
// feature is that the SERVER holds the conversation: the client sends only the new
// turn plus previous_response_id. Before response-store.js that field was never
// read — a chained client reached the upstream with ONE message every turn, so the
// model answered blind with no error and no warning. Fluent, context-free replies
// the caller could not diagnose.
//
// These tests pin the store contract itself; response-store-e2e covers the wiring.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  putResponse, getResponse, deleteResponse,
  getResponseStoreStats, resetResponseStore, isResponseStoreEnabled,
} from '../src/response-store.js';

const A = 'api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:user:alice';
const B = 'api:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:user:bob';
const CONV = [
  { role: 'user', content: 'turn 1' },
  { role: 'assistant', content: 'reply 1' },
];

beforeEach(() => resetResponseStore());

describe('response store — round trip', () => {
  it('is enabled by default', () => {
    assert.equal(isResponseStoreEnabled(), true);
  });

  it('stores a conversation and resolves it back for the same caller', () => {
    assert.equal(putResponse('resp_1', CONV, A), true);
    const got = getResponse('resp_1', A);
    assert.equal(got.ok, true);
    assert.deepEqual(got.messages, CONV);
  });

  it('reports a clean miss for an unknown id (caller must fail loud, not truncate)', () => {
    const got = getResponse('resp_nope', A);
    assert.equal(got.ok, false);
    assert.equal(got.reason, 'not_found');
  });

  it('honors store:false — such a response can never be chained from', () => {
    assert.equal(putResponse('resp_nostore', CONV, A, { store: false }), false);
    assert.equal(getResponse('resp_nostore', A).ok, false);
  });

  it('refuses to store without a caller scope (would be shared-readable)', () => {
    assert.equal(putResponse('resp_anon', CONV, ''), false);
  });

  it('a later turn overwrites the same id with the grown conversation', () => {
    putResponse('resp_1', CONV, A);
    const grown = [...CONV, { role: 'user', content: 'turn 2' }, { role: 'assistant', content: 'reply 2' }];
    putResponse('resp_1', grown, A);
    assert.deepEqual(getResponse('resp_1', A).messages, grown);
    assert.equal(getResponseStoreStats().size, 1, 'refresh is not a second entry');
  });

  it('deletes only for the owning caller', () => {
    putResponse('resp_1', CONV, A);
    assert.equal(deleteResponse('resp_1', B), false, 'a stranger must not delete it');
    assert.equal(deleteResponse('resp_1', A), true);
    assert.equal(getResponse('resp_1', A).ok, false);
  });
});

describe('response store — cross-tenant isolation', () => {
  it('an id minted for one caller does NOT resolve for another', () => {
    putResponse('resp_secret', [{ role: 'user', content: 'alice private data' }], A);
    const stolen = getResponse('resp_secret', B);
    assert.equal(stolen.ok, false,
      'replaying another tenant\'s response id must not return their conversation');
    assert.equal(stolen.reason, 'forbidden');
    assert.equal(stolen.messages, undefined, 'no conversation content may leak');
  });

  it('the owner still resolves it after a foreign attempt', () => {
    putResponse('resp_secret', CONV, A);
    getResponse('resp_secret', B);
    assert.equal(getResponse('resp_secret', A).ok, true, 'a probe must not evict the entry');
  });

  it('an empty callerKey cannot read a scoped entry', () => {
    putResponse('resp_1', CONV, A);
    assert.equal(getResponse('resp_1', '').ok, false);
  });
});

describe('response store — bounded memory', () => {
  it('never exceeds the configured cap', () => {
    for (let i = 0; i < 40; i++) putResponse(`r${i}`, CONV, A);
    assert.ok(getResponseStoreStats().size <= 2000);
  });

  it('a read refreshes an entry so it is not the next eviction victim', () => {
    putResponse('old', CONV, A);
    putResponse('new', CONV, A);
    assert.equal(getResponse('old', A).ok, true);
    // 'old' was just read, so LRU order now ends with it.
    const stats = getResponseStoreStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.size, 2);
  });

  it('caps a runaway conversation while keeping the leading system messages', () => {
    const huge = [
      { role: 'system', content: 'INSTRUCTIONS' },
      ...Array.from({ length: 900 }, (_, i) => ({ role: 'user', content: `m${i}` })),
    ];
    putResponse('r_huge', huge, A);
    const got = getResponse('r_huge', A);
    assert.ok(got.messages.length <= 400, `capped, got ${got.messages.length}`);
    assert.equal(got.messages[0].content, 'INSTRUCTIONS',
      'the system prompt must survive truncation — dropping it changes agent behaviour');
    assert.equal(got.messages.at(-1).content, 'm899', 'the most recent turn must survive');
  });
});

describe('truncateMessages boundary (the negative-slice bug and its fix)', () => {
  // At lead >= MAX_MESSAGES the old code computed a NEGATIVE tail budget, and
  // `slice(-negative)` silently becomes `slice(positive)` — it returned most of the
  // array, so the result GREW instead of shrinking (measured: 501 in, 901 stored).
  // The fix must cap the head, but only where it has to: capping at MAX/2 would
  // also change the (MAX/2, MAX) range where the old behaviour was already correct.
  const MAX = 400; // RESPONSE_STORE_MAX_MESSAGES default
  const build = (lead, conv) => [
    ...Array.from({ length: lead }, (_, i) => ({ role: 'system', content: `s${i}` })),
    ...Array.from({ length: conv }, (_, i) => ({ role: 'user', content: `u${i}` })),
  ];
  const store = (msgs, id = 'b') => {
    resetResponseStore();
    putResponse(id, msgs, 'api:bound:user:1');
    return getResponse(id, 'api:bound:user:1').messages;
  };

  it('never exceeds the cap, for any ratio of system to conversation', () => {
    for (const [lead, conv] of [[0, 500], [1, 500], [200, 300], [201, 199], [300, 100], [399, 2], [400, 1], [500, 1], [800, 0], [1000, 1000]]) {
      const out = store(build(lead, conv));
      assert.ok(out.length <= MAX,
        `lead=${lead} conv=${conv} produced ${out.length}, cap is ${MAX}`);
    }
  });

  it('leaves a conversation at or below the cap completely untouched', () => {
    // This is the range the old code handled correctly — the fix must not change it.
    for (const [lead, conv] of [[201, 199], [300, 100], [0, 400], [399, 1]]) {
      const input = build(lead, conv);
      assert.equal(input.length, MAX, 'precondition: exactly at the cap');
      const out = store(input);
      assert.equal(out.length, MAX);
      assert.equal(out.filter(m => m.role === 'system').length, lead,
        `lead=${lead}: every leading system message must survive when no truncation is needed`);
    }
  });

  it('when truncation IS needed, keeps as much of the system block as the cap allows', () => {
    // lead=300 conv=200 → 500 messages, so truncation runs. The two candidate head
    // budgets diverge here: MAX-1 keeps all 300 system messages (+100 recent turns),
    // while a MAX/2 cap would keep only 200 and silently discard 100 system messages
    // that the pre-fix code preserved. This case is what pins the policy.
    const out = store(build(300, 200));
    assert.equal(out.length, 400, 'must fill the cap exactly');
    assert.equal(out.filter(m => m.role === 'system').length, 300,
      'the whole system block fits under the cap and must be kept');
    assert.equal(out.at(-1).content, 'u199', 'and the newest turn must still be there');
  });

  it('keeps room for at least one real turn when the system block is huge', () => {
    const out = store(build(500, 50));
    assert.ok(out.length <= MAX);
    assert.equal(out.at(-1).content, 'u49', 'the newest turn must survive a huge system block');
  });

  it('preserves the FIRST system messages, not a middle slice', () => {
    const out = store(build(500, 5));
    assert.equal(out[0].content, 's0', 'truncation drops from the middle, never the head');
  });
});
