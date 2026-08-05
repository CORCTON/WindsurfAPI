// `store: false` was only honoured when it was STRICTLY the boolean false.
//
// The store's own comment states the OpenAI contract correctly — "`store: false`
// means this response is not retained, so it can never serve as a later
// previous_response_id" — and the implementation was `if (opts.store === false)`.
// handlers/responses.js passes `store: body.store` RAW off the request body with no
// normalization, so every other falsy spelling reached that strict comparison and
// lost. MEASURED against the pre-fix code:
//
//   store=false                                  -> not stored   (correct)
//   store="false" / 0 / "no" / "off" / null / "" -> ALL STORED and retrievable
//
// A JSON client that spells the flag as a string got retention it explicitly opted
// out of, with nothing in the response to tell it so. Form-encoded relays, shell
// wrappers and hand-rolled clients all produce `"false"`.
//
// These tests drive putResponse and handleResponses — not the source text — because
// what matters is whether the conversation is RETRIEVABLE afterwards.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  putResponse, getResponse, resetResponseStore, wantsPersistence,
} from '../src/response-store.js';
import { handleResponses } from '../src/handlers/responses.js';

const A = 'api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:user:alice';
const CONV = [
  { role: 'user', content: 'turn 1' },
  { role: 'assistant', content: 'reply 1' },
];

// The spellings measured as stored-despite-opt-out before the fix.
const OPTED_OUT = [false, 'false', 'FALSE', ' false ', '0', 0, 'no', 'NO', 'off', 'Off', '', null];
// Values that mean "keep storing". `undefined` is the important one: absent means
// the OpenAI default (store=true), NOT opted out.
const OPTED_IN = [undefined, true, 'true', 'TRUE', '1', 1, 2];

beforeEach(() => resetResponseStore());

describe('store flag normalization — opting out is honoured however it is spelled', () => {
  for (const v of OPTED_OUT) {
    it(`store=${JSON.stringify(v)} is not retained and cannot be chained from`, () => {
      assert.equal(putResponse('r', CONV, A, { store: v }), false,
        'putResponse must report that it did not persist');
      const got = getResponse('r', A);
      assert.equal(got.ok, false,
        `store=${JSON.stringify(v)} was stored and remained retrievable — the caller `
        + 'opted out of retention and got it anyway');
      assert.equal(got.messages, undefined, 'no conversation content may come back');
    });
  }
});

describe('store flag normalization — NEGATIVE CONTROL: the default still stores', () => {
  // The fix must not over-reach into "refuse anything that is not literally true".
  // An absent flag is the overwhelmingly common case and it must keep working, or
  // every chained client in existence breaks.
  for (const v of OPTED_IN) {
    it(`store=${JSON.stringify(v)} is retained and chainable`, () => {
      assert.equal(putResponse('r', CONV, A, { store: v }), true);
      const got = getResponse('r', A);
      assert.equal(got.ok, true,
        `store=${JSON.stringify(v)} must still be stored — this is the documented default`);
      assert.deepEqual(got.messages, CONV, 'and the conversation must round-trip intact');
    });
  }

  it('no opts object at all still stores (the call shape used before the flag existed)', () => {
    assert.equal(putResponse('r', CONV, A), true);
    assert.equal(getResponse('r', A).ok, true);
  });

  it('an unrecognized token keeps the documented default rather than silently dropping', () => {
    // "maybe" is not an opt-out signal. Treating every unknown value as false would
    // turn a client typo into silent context loss on the NEXT turn, which is the
    // failure mode this module exists to remove.
    for (const v of ['maybe', 'yes', {}, [], 'store']) {
      resetResponseStore();
      assert.equal(putResponse('r', CONV, A, { store: v }), true,
        `store=${JSON.stringify(v)} is not a recognized opt-out and must not drop the turn`);
      assert.equal(getResponse('r', A).ok, true);
    }
  });
});

describe('wantsPersistence is the single decision point', () => {
  // Exported so the contract is tested against THIS implementation rather than a
  // re-derived copy of the token list — a mirror test passes when production breaks.
  it('maps every measured falsy spelling to false', () => {
    for (const v of OPTED_OUT) {
      assert.equal(wantsPersistence(v), false, `${JSON.stringify(v)} must read as opted out`);
    }
  });

  it('maps absent and truthy spellings to true', () => {
    for (const v of OPTED_IN) {
      assert.equal(wantsPersistence(v), true, `${JSON.stringify(v)} must read as store`);
    }
  });

  it('undefined and null are NOT the same answer', () => {
    // Absent means "the field was not sent", and the OpenAI default is store=true.
    // An explicit null is a value the client chose; for a retention decision the
    // safe reading of an ambiguous explicit value is "do not retain".
    assert.equal(wantsPersistence(undefined), true);
    assert.equal(wantsPersistence(null), false);
  });
});

describe('store flag normalization — end to end through /v1/responses', () => {
  const CALLER = 'api:cafecafecafecafecafecafecafecafe:user:chainer';
  const userTurn = (text) => [{ role: 'user', content: [{ type: 'input_text', text }] }];
  const recorder = () => {
    const seen = [];
    return {
      seen,
      handler: async (body) => {
        seen.push(body.messages);
        return { status: 200, body: { id: 'x', choices: [{ message: { role: 'assistant', content: 'ok' } }] } };
      },
    };
  };

  it('a client sending the STRING "false" cannot chain from that turn', async () => {
    // This is the whole defect at the level the caller sees it: handleResponses
    // forwards body.store untouched, so before the fix turn 2 succeeded — proving
    // the server had retained a conversation the client asked it not to keep.
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    const t1 = await handleResponses({ model: 'm', input: userTurn('a'), store: 'false' }, deps);
    assert.equal(t1.status, 200, 'the turn itself must still be served');

    const t2 = await handleResponses(
      { model: 'm', previous_response_id: t1.body.id, input: userTurn('b') }, deps,
    );
    assert.equal(t2.status, 404,
      'store:"false" was honoured only as a real boolean, so this turn used to succeed — '
      + 'the server kept a conversation the client opted out of');
  });

  it('NEGATIVE CONTROL: without the flag the same chain still works', async () => {
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    const t1 = await handleResponses({ model: 'm', input: userTurn('a') }, deps);
    const t2 = await handleResponses(
      { model: 'm', previous_response_id: t1.body.id, input: userTurn('b') }, deps,
    );
    assert.equal(t2.status, 200, 'the default path must be untouched by the normalization');
    assert.equal(rec.seen[1].length, 3, 'and the whole conversation must reach the upstream');
  });

  it('store:true spelled as a string still chains', async () => {
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    const t1 = await handleResponses({ model: 'm', input: userTurn('a'), store: 'true' }, deps);
    const t2 = await handleResponses(
      { model: 'm', previous_response_id: t1.body.id, input: userTurn('b') }, deps,
    );
    assert.equal(t2.status, 200, 'a stringly-typed TRUE must not be read as an opt-out');
  });
});
