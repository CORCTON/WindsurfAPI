// Responses chaining, end to end through handleResponses.
//
// The bug this pins: previous_response_id was never read, so a chained client
// (the store:true style the Responses API is built around — send only the new turn
// and reference the prior response) reached the upstream with a SINGLE message.
// Every turn the model answered with no context, no error, no warning.
//
// These tests assert what the UPSTREAM actually receives, because that is where
// the amnesia happened — the client-facing response looked perfectly normal.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleResponses } from '../src/handlers/responses.js';
import { resetResponseStore } from '../src/response-store.js';

const CALLER = 'api:cafecafecafecafecafecafecafecafe:user:chainer';
const OTHER = 'api:beefbeefbeefbeefbeefbeefbeefbeef:user:stranger';

function userTurn(text) {
  return [{ role: 'user', content: [{ type: 'input_text', text }] }];
}

// Captures what the chat layer (i.e. the upstream) was asked to send.
function recorder(reply = 'ok') {
  const seen = [];
  return {
    seen,
    handler: async (body) => {
      seen.push(body.messages);
      return {
        status: 200,
        body: { id: 'x', choices: [{ message: { role: 'assistant', content: reply } }] },
      };
    },
  };
}

beforeEach(() => resetResponseStore());

describe('Responses chaining — the upstream sees the whole conversation', () => {
  it('turn 2 referencing turn 1 arrives with turn 1 prepended', async () => {
    const rec = recorder('reply 1');

    const t1 = await handleResponses(
      { model: 'gpt-5.5', input: userTurn('turn 1 question') },
      { handleChatCompletions: rec.handler, context: { callerKey: CALLER } },
    );
    assert.equal(t1.status, 200);
    const firstId = t1.body.id;
    assert.ok(firstId, 'a response id must be returned to chain from');
    assert.equal(rec.seen[0].length, 1, 'turn 1 is a single message');

    const t2 = await handleResponses(
      { model: 'gpt-5.5', previous_response_id: firstId, input: userTurn('turn 2 followup') },
      { handleChatCompletions: rec.handler, context: { callerKey: CALLER } },
    );
    assert.equal(t2.status, 200);

    const upstream = rec.seen[1];
    assert.equal(upstream.length, 3,
      `turn 2 must carry [user t1, assistant r1, user t2]; got ${upstream.length} `
      + '— a length of 1 is the silent-amnesia bug');
    assert.equal(upstream[0].content?.[0]?.text ?? upstream[0].content, 'turn 1 question');
    assert.equal(upstream[1].role, 'assistant');
    assert.equal(upstream[1].content, 'reply 1');
    assert.equal(upstream[2].content?.[0]?.text ?? upstream[2].content, 'turn 2 followup');
  });

  it('a three-turn chain keeps growing', async () => {
    const rec = recorder('r');
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };

    const t1 = await handleResponses({ model: 'm', input: userTurn('a') }, deps);
    const t2 = await handleResponses({ model: 'm', previous_response_id: t1.body.id, input: userTurn('b') }, deps);
    const t3 = await handleResponses({ model: 'm', previous_response_id: t2.body.id, input: userTurn('c') }, deps);

    assert.equal(t3.status, 200);
    assert.deepEqual(rec.seen.map(m => m.length), [1, 3, 5],
      'each turn adds the user message and the assistant reply');
  });

  it('branching from an earlier response replays that earlier state', async () => {
    const rec = recorder('r');
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };

    const t1 = await handleResponses({ model: 'm', input: userTurn('a') }, deps);
    await handleResponses({ model: 'm', previous_response_id: t1.body.id, input: userTurn('b') }, deps);
    // Branch: chain from t1 again rather than from t2.
    await handleResponses({ model: 'm', previous_response_id: t1.body.id, input: userTurn('b-alt') }, deps);

    assert.equal(rec.seen[2].length, 3, 'the branch starts from turn 1, not turn 2');
    assert.equal(rec.seen[2][2].content?.[0]?.text, 'b-alt');
  });
});

describe('Responses chaining — failures are loud, never silent truncation', () => {
  it('an unknown previous_response_id is a 404, not a context reset', async () => {
    const rec = recorder();
    const res = await handleResponses(
      { model: 'm', previous_response_id: 'resp_does_not_exist', input: userTurn('hi') },
      { handleChatCompletions: rec.handler, context: { callerKey: CALLER } },
    );
    assert.equal(res.status, 404, 'silently answering with no context is the bug');
    assert.equal(res.body.error.param, 'previous_response_id');
    assert.match(res.body.error.message, /not found/i);
    assert.equal(rec.seen.length, 0, 'the upstream must not be called at all');
  });

  it('another tenant cannot chain from a foreign response id', async () => {
    const rec = recorder('secret reply');
    const t1 = await handleResponses(
      { model: 'm', input: userTurn('alice private') },
      { handleChatCompletions: rec.handler, context: { callerKey: CALLER } },
    );

    const stolen = await handleResponses(
      { model: 'm', previous_response_id: t1.body.id, input: userTurn('give me the context') },
      { handleChatCompletions: rec.handler, context: { callerKey: OTHER } },
    );
    assert.equal(stolen.status, 404, 'a foreign id must not resolve');
    assert.equal(rec.seen.length, 1, 'no upstream call — so no chance to echo the other tenant\'s data');
  });

  it('store:false means the response cannot be chained from later', async () => {
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    const t1 = await handleResponses({ model: 'm', input: userTurn('a'), store: false }, deps);
    assert.equal(t1.status, 200, 'the turn itself still works');

    const t2 = await handleResponses(
      { model: 'm', previous_response_id: t1.body.id, input: userTurn('b') },
      deps,
    );
    assert.equal(t2.status, 404, 'per the OpenAI contract an unstored response is not chainable');
  });
});

describe('Responses chaining — unchained clients are unaffected', () => {
  it('a full-context request (codex style) passes through untouched', async () => {
    const rec = recorder();
    await handleResponses({
      model: 'm',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'one' }] },
        { role: 'assistant', content: [{ type: 'output_text', text: 'two' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'three' }] },
      ],
    }, { handleChatCompletions: rec.handler, context: { callerKey: CALLER } });

    assert.equal(rec.seen[0].length, 3, 'no prepending, no rewriting');
  });

  it('a caller with no callerKey still gets served (just not chainable)', async () => {
    const rec = recorder();
    const res = await handleResponses(
      { model: 'm', input: userTurn('hi') },
      { handleChatCompletions: rec.handler, context: { callerKey: '' } },
    );
    assert.equal(res.status, 200, 'storing is best-effort; serving must not depend on it');
  });
});
