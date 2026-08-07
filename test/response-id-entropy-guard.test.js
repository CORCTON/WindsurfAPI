// W3 — the response store's tenant isolation rests on ONE secret, and README:307
// says so explicitly:
//
//   "真正挡住跨读的是 response id 的 90 bit 熵 … 所以隔离在实践中成立,但它是
//    '要撞对一个 90 bit 的 id',不是'作用域把租户分开了' —— 别把 user 当成访问控制用"
//
// That paragraph is CORRECT — an earlier version overstated the guarantee and was
// fixed. But the fact it rests on had no test. MEASURED, and the reason this matters:
// under a shared API key two different callers sending the same `user` derive a
// BYTE-IDENTICAL callerKey (verified: differing ip and user-agent, same key
// `api:9584…:user:ff8d…`). So the scope is not a secret, and the id is the only
// thing standing between tenants.
//
// Narrow the id — take fewer hex chars, reuse a counter, switch to a timestamp —
// and that README paragraph silently becomes false while every other test stays
// green. This pins the property the documentation sells.
//
// WHY 90 AND NOT 96: the id is UUIDv4 with the dashes stripped, sliced to 24 hex
// chars = 96 bits of WIDTH, but 6 of those bits are the fixed version/variant
// nibbles that land inside the slice, leaving ~90 bits of entropy. The assertion
// below deliberately checks the WIDTH and the randomness, not the arithmetic — a
// test asserting "90" as a literal would just restate a comment.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chatToResponse } from '../src/handlers/responses.js';

/** Mint an id through the real production path (the default parameter). */
function mintResponseId() {
  const body = chatToResponse(
    { choices: [{ message: { role: 'assistant', content: 'x' } }], model: 'm' },
    'm',
  );
  return body.id;
}

describe('W3 — the response id is the only real tenant secret', () => {
  it('is resp_ plus 24 hex characters', () => {
    // 24 hex = 96 bits of width. Fewer characters directly shrinks the search space
    // the README paragraph relies on.
    const id = mintResponseId();
    assert.match(id, /^resp_[0-9a-f]{24}$/, `unexpected id shape: ${id}`);
  });

  it('carries the UUIDv4 version nibble, so it is random and not a counter', () => {
    // Position 12 of a dash-stripped UUIDv4 is the version nibble '4'. Its presence
    // proves the id still comes from randomUUID rather than a sequence or a
    // timestamp — either of which would be guessable regardless of length.
    const hex = mintResponseId().slice('resp_'.length);
    assert.equal(hex[12], '4', `expected the UUIDv4 version nibble at index 12, got ${hex}`);
  });

  it('does not repeat across many mints', () => {
    // A counter or a coarse timestamp would collide here; randomUUID does not.
    const ids = new Set();
    for (let i = 0; i < 2000; i++) ids.add(mintResponseId());
    assert.equal(ids.size, 2000, 'response ids must be unique');
  });

  it('varies in every position that is not fixed by the UUID format', () => {
    // Guards the shape of the defect that would be easiest to introduce and hardest
    // to see: keeping the length while making part of the id constant (a prefix, a
    // shard tag, a padded counter). Only index 12 may be constant.
    const hexes = Array.from({ length: 400 }, () => mintResponseId().slice('resp_'.length));
    const constant = [];
    for (let i = 0; i < 24; i++) {
      const distinct = new Set(hexes.map(h => h[i]));
      if (distinct.size === 1) constant.push(i);
    }
    assert.deepEqual(constant, [12], `only the version nibble may be constant, got ${JSON.stringify(constant)}`);
  });
});
