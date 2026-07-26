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
