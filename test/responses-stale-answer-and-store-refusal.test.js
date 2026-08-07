// Two defects in the Responses store path, adjudicated together because both were
// invisible from the outside and each was reported with the wrong mechanism.
//
// ITEM 10 — retrieval served an ANCESTOR turn's answer.
//   `storedResponseBody` found its assistant turn with an unbounded
//   `reverse().find(role === 'assistant')`. The store holds the ACCUMULATED
//   conversation, so every earlier reply is still in the array: when the newest
//   turn had no assistant message, the search walked past the last user turn and
//   returned the previous answer, reported as `status: 'completed'`.
//   MEASURED pre-fix on the chain below: GET resp_2 -> output_text "It is 4."
//   while the last user message asked "And 3+3?".
//
// ITEM 9 — a refusal to store was unobservable.
//   `putResponse`'s return value was dropped at the only call site, so a client
//   could receive 200 plus an id that was never stored; the id first showed itself
//   as a 404 on the NEXT turn, one round trip from the request that failed, with
//   no server-side line to correlate. The branch the original report named
//   (`!callerKey`) is NOT reachable from that call site — `commit` returns first on
//   `!chainable`, and `hasPerUserScope('')` is false — which is also why
//   `_stats.rejected`, whose only bump sits on that branch, can never move here.
//   The reachable refusal is an empty conversation.
process.env.WINDSURFAPI_RESPONSE_STORE = '1';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { log } from '../src/config.js';

const store = await import('../src/response-store.js');
const { putResponse, resetResponseStore } = store;
const { handleGetResponse, handleResponses } = await import('../src/handlers/responses.js');

const KEY = 'api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:user:alice';
const deps = { context: { callerKey: KEY } };

/** The text a Responses client actually reads off a retrieval body. */
function outputText(body) {
  return (body?.output || [])
    .flatMap(item => item?.content || [])
    .map(part => part?.text || '')
    .join('');
}

const Q1 = { role: 'user', content: 'What is 2+2?' };
const A1 = { role: 'assistant', content: 'It is 4.' };
const Q2 = { role: 'user', content: 'And 3+3?' };
const A2 = { role: 'assistant', content: 'It is 6.' };

describe('item 10 — retrieval must not answer with an earlier turn', () => {
  beforeEach(() => { resetResponseStore(); });

  it('reports no output for a turn that produced none, instead of the previous answer', () => {
    putResponse('resp_1', [Q1, A1], KEY, { store: true, model: 'm' });
    // The commit(null) shape: prior history persisted, no assistant for THIS turn.
    putResponse('resp_2', [Q1, A1, Q2], KEY, { store: true, model: 'm' });

    const got = handleGetResponse('resp_2', deps);
    assert.equal(got.status, 200);
    assert.equal(outputText(got.body), '', 'must not serve the ancestor turn\'s answer');
  });

  it('still round-trips a turn that did answer', () => {
    putResponse('resp_1', [Q1, A1], KEY, { store: true, model: 'm' });
    assert.equal(outputText(handleGetResponse('resp_1', deps).body), 'It is 4.');
  });

  it('still round-trips the newest answer of a multi-turn chain', () => {
    // The over-suppression direction: bounding the search must not make a normal
    // chained turn report empty output.
    putResponse('resp_3', [Q1, A1, Q2, A2], KEY, { store: true, model: 'm' });
    assert.equal(outputText(handleGetResponse('resp_3', deps).body), 'It is 6.');
  });

  it('does not skip past a tool-result turn to an older answer', () => {
    // A tool round trip puts role:'tool' between the user turn and its answer.
    // The bound is the last USER message, so the assistant after it still wins.
    putResponse('resp_4', [
      Q1, A1, Q2,
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'add', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: '6' },
      A2,
    ], KEY, { store: true, model: 'm' });
    assert.equal(outputText(handleGetResponse('resp_4', deps).body), 'It is 6.');
  });

  it('reports no output when the conversation ends on a user turn with no history', () => {
    putResponse('resp_5', [Q1], KEY, { store: true, model: 'm' });
    assert.equal(outputText(handleGetResponse('resp_5', deps).body), '');
  });
});

describe('item 9 — putResponse refusals are distinguishable at the call site', () => {
  beforeEach(() => { resetResponseStore(); });

  it('refuses an empty conversation', () => {
    // Not reachable from a real request today — see the reachability note in the
    // logging suite below. Pinned at the store's own boundary because that is
    // where the refusal lives, independent of who can currently trigger it.
    assert.equal(putResponse('resp_empty', [], KEY, { store: true }), false);
    assert.equal(handleGetResponse('resp_empty', deps).status, 404);
  });

  it('refuses store:false and its non-boolean spellings', () => {
    // Correct behaviour, NOT an anomaly — asserted so the log added for the
    // anomalous case cannot start firing on the contract-compliant one.
    for (const spelling of [false, 'false', 0, 'no']) {
      const id = `resp_${String(spelling)}`;
      assert.equal(putResponse(id, [Q1, A1], KEY, { store: spelling }), false, `store:${String(spelling)}`);
    }
  });

  it('reports true and is retrievable on the normal path', () => {
    assert.equal(putResponse('resp_ok', [Q1, A1], KEY, { store: true, model: 'm' }), true);
    assert.equal(handleGetResponse('resp_ok', deps).status, 200);
  });

  it('wantsPersistence is what separates the two, and it is exported', () => {
    // The log gate imports this rather than re-deriving "did the caller want
    // retention" — a second copy of that judgement is how the strict `=== false`
    // check and the normalized one drifted apart in the first place.
    assert.equal(typeof store.wantsPersistence, 'function');
    assert.equal(store.wantsPersistence(true), true);
    assert.equal(store.wantsPersistence(undefined), true);
    assert.equal(store.wantsPersistence('false'), false);
    assert.equal(store.wantsPersistence(0), false);
  });
});

// The log line IS the deliverable for item 9 — the defect was never a wrong
// value, it was an invisible one. So these drive handleResponses and read what was
// logged. Without them the fix is unverified in exactly the way the round's own
// rule forbids: a mutation that inverts the gate passed every other assertion here.
describe('item 9 — the refusal is actually reported', () => {
  beforeEach(() => { resetResponseStore(); });

  /**
   * Run one request through handleResponses, capturing WARN output.
   *
   * `reply` defaults to a normal assistant message. Passing `null` makes the chat
   * layer return 200 with NO message — see the latency note on the first test.
   */
  async function warnsFor(body, reply = 'ok') {
    const warns = [];
    const original = log.warn;
    log.warn = (...args) => { warns.push(args.join(' ')); };
    try {
      await handleResponses(body, {
        context: { callerKey: KEY },
        handleChatCompletions: async () => ({
          status: 200,
          body: reply === null
            ? { id: 'x', choices: [{}] }
            : { id: 'x', choices: [{ message: { role: 'assistant', content: reply } }] },
        }),
      });
    } finally {
      log.warn = original;
    }
    return warns.filter(w => w.includes('store refused'));
  }

  it('logs when a turn commits nothing storable, naming the id', async () => {
    // WHY THIS DRIVES A 200-WITH-NO-MESSAGE UPSTREAM, and what that means for the
    // reachability claim:
    //
    // An earlier version of this test used `input: []` alone, on the theory that
    // zero input messages reach putResponse's `!messages.length` refusal. It does
    // not, and the test failing is what showed it: `commit` appends the assistant
    // message, so the array is length 1 even when the input was empty. Reaching
    // the refusal needs BOTH an empty base AND no assistant message, i.e.
    // `commit(null)` — and every non-stream 200 in chat.js builds a `message`
    // object, so nothing produces that today.
    //
    // So this guard is LATENT, exactly like the retrieval bound above, and the
    // honest way to pin it is to drive the shape that would make it live rather
    // than to imply a real request already does. `deps.handleChatCompletions` is
    // the seam the handler already exposes; a future non-stream path that returns
    // 200 without a message is precisely this shape, and this line is what would
    // make it visible instead of a 404 one round trip later.
    const hits = await warnsFor({ model: 'm', input: [] }, null);
    assert.equal(hits.length, 1, 'a commit that stored nothing must produce exactly one line');
    assert.match(hits[0], /will 404/);
    assert.match(hits[0], /messages=0/);
    assert.match(hits[0], /assistant=no/);
  });

  it('stays silent when the caller asked for no retention', async () => {
    // store:false is the contract, not an anomaly. A log here would train the
    // reader to ignore the line that matters.
    const hits = await warnsFor({
      model: 'm',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
      store: false,
    });
    assert.deepEqual(hits, []);
  });

  it('stays silent on a normal stored turn', async () => {
    const hits = await warnsFor({
      model: 'm',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    });
    assert.deepEqual(hits, []);
  });
});
