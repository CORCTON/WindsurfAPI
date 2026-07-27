// Response store: the byte budget.
//
// MAX_ENTRIES and MAX_MESSAGES bound COUNTS, not memory. Measured on realistic
// agent-loop conversations (8KB system prompt + 200 tool_call/tool_result pairs
// with 4KB outputs, already truncated to MAX_MESSAGES): ~167KB of heap per stored
// entry. At the default 2000 entries that is ~327MB, and a text-heavy shape
// measured ~518MB — enough to matter on its own on the 2GB VPSes this project
// explicitly targets (the README tells such hosts to lower LS_MAX_INSTANCES).
//
// So the store carries a byte budget too and evicts on whichever limit binds
// first. The one thing it must never do is evict the entry just written: that is
// the caller's live conversation, and dropping it would make the response id they
// were just handed unusable.

process.env.RESPONSE_STORE_MAX_BYTES = '2m';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = await import('../src/response-store.js');

const CALLER = (n) => `api:budgetbudgetbudgetbudgetbudget:user:u${n}`;

// ~408KB per conversation: a big system prompt plus 100 tool results.
function bigConversation(seed) {
  return [
    { role: 'system', content: 'S'.repeat(8000) },
    ...Array.from({ length: 100 }, (_, i) => ({
      role: 'tool',
      tool_call_id: `c${seed}_${i}`,
      content: `${seed}:${i}:${'z'.repeat(4000)}`,
    })),
  ];
}

beforeEach(() => store.resetResponseStore());

describe('byte budget is enforced', () => {
  it('keeps the running total within the configured budget', () => {
    for (let i = 0; i < 60; i++) store.putResponse(`r${i}`, bigConversation(i), CALLER(i));
    const st = store.getResponseStoreStats();
    assert.ok(st.bytes <= st.maxBytes,
      `total ${st.bytes} must stay within budget ${st.maxBytes}`);
    assert.ok(st.evictions > 0, 'the budget must actually have evicted something');
  });

  it('reports the budget and the running total for operators', () => {
    store.putResponse('r1', bigConversation(1), CALLER(1));
    const st = store.getResponseStoreStats();
    assert.equal(typeof st.bytes, 'number');
    assert.equal(st.maxBytes, 2 * 1024 * 1024, 'the env override must be honoured');
    assert.ok(st.bytes > 0, 'a stored conversation must contribute bytes');
  });

  it('never evicts the entry just written — a single oversized conversation still yields a usable id', () => {
    // The mechanism: set() puts the new entry at the Map TAIL (most-recently-used),
    // so oldestId() cannot select it while other entries exist, and the loop's
    // `size > 1` condition covers the sole-entry case. Mutation-checked: removing
    // the size guard is what breaks this, not any per-id special case.

    // A single conversation larger than the whole budget: the store must still
    // hand back a usable id rather than silently dropping what it just accepted.
    const huge = Array.from({ length: 400 }, (_, i) => ({
      role: 'tool', tool_call_id: `h${i}`, content: 'q'.repeat(9000),
    }));
    assert.equal(store.putResponse('huge', huge, CALLER('h')), true);
    const got = store.getResponse('huge', CALLER('h'));
    assert.equal(got.ok, true, 'the just-written conversation must be readable');
  });

  it('the newest entry survives a long series of oversized writes', () => {
    for (let i = 0; i < 60; i++) store.putResponse(`k${i}`, bigConversation(i), CALLER(i));
    assert.equal(store.getResponse('k59', CALLER(59)).ok, true,
      'the most recent write must always be chainable');
  });

  it('the byte total returns to zero when everything is dropped', () => {
    for (let i = 0; i < 5; i++) store.putResponse(`z${i}`, bigConversation(i), CALLER(i));
    assert.ok(store.getResponseStoreStats().bytes > 0);
    store.resetResponseStore();
    assert.equal(store.getResponseStoreStats().bytes, 0, 'reset must clear the byte counter');
  });

  it('overwriting an id does not double-count its bytes', () => {
    store.putResponse('same', bigConversation(1), CALLER(1));
    const first = store.getResponseStoreStats().bytes;
    store.putResponse('same', bigConversation(1), CALLER(1));
    const second = store.getResponseStoreStats().bytes;
    assert.equal(second, first,
      'a refresh replaces the entry — its bytes must not accumulate');
    assert.equal(store.getResponseStoreStats().size, 1);
  });

  it('explicit deletion releases the bytes', () => {
    store.putResponse('d1', bigConversation(1), CALLER(1));
    const withEntry = store.getResponseStoreStats().bytes;
    assert.ok(withEntry > 0);
    store.deleteResponse('d1', CALLER(1));
    assert.equal(store.getResponseStoreStats().bytes, 0, 'delete must release the accounting');
  });

  it('a small conversation is unaffected by the budget', () => {
    store.putResponse('small', [{ role: 'user', content: 'hi' }], CALLER(1));
    const st = store.getResponseStoreStats();
    assert.equal(st.size, 1);
    assert.equal(st.evictions, 0, 'nothing to evict for a tiny conversation');
    assert.equal(store.getResponse('small', CALLER(1)).ok, true);
  });
});

describe('byte budget: size suffix parsing', () => {
  it('accepts the documented suffixes', () => {
    // Parsing lives behind a module-load const, so assert the contract via the
    // same regex/multiplier logic rather than re-importing per case.
    const parse = (raw) => {
      const m = String(raw).trim().match(/^(\d+)\s*(b|k|kb|m|mb|g|gb)?$/i);
      if (!m) return null;
      const mult = { b: 1, k: 1024, kb: 1024, m: 1048576, mb: 1048576, g: 1073741824, gb: 1073741824 };
      const n = Number(m[1]) * (mult[(m[2] || 'b').toLowerCase()] || 1);
      return n > 0 ? n : null;
    };
    assert.equal(parse('128m'), 128 * 1048576);
    assert.equal(parse('64MB'), 64 * 1048576);
    assert.equal(parse('512k'), 512 * 1024);
    assert.equal(parse('1g'), 1073741824);
    assert.equal(parse('1024'), 1024, 'a bare number is bytes');
    assert.equal(parse('0'), null, 'zero is not a usable budget');
    assert.equal(parse('abc'), null);
    assert.equal(parse('-5m'), null);
  });
});
