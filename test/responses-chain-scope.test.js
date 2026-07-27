// Two ways the Responses chain broke for ordinary clients, both live-reproduced.
//
// 1. SCOPE CHURN (was a blocker). `previous_response_id` used to feed the
//    callerKey derivation. It changes every turn, so turn 1 (without it) and
//    turn 2 (with it) derived DIFFERENT callerKeys — and the response store keys
//    its per-caller isolation on exactly that. A standard OpenAI SDK client, which
//    sends neither `user` nor `prompt_cache_key`, therefore got
//    `404 response_not_found` on every chained turn: the headline feature of the
//    release was broken for its most common caller shape.
//
// 2. EMPTY INPUT reaching the upstream. /v1/chat/completions and /v1/messages both
//    reject an empty conversation locally (server.js:562, :712). This route
//    forwarded it, the upstream answered "an internal error occurred (trace ID …)"
//    → UPSTREAM_INTERNAL → reportInternalError, and two consecutive of those
//    quarantine the account for two minutes. So any authenticated caller — or a
//    client bug, or an empty prompt box — could walk a multi-account pool offline.
//    Live-confirmed before the fix: {input:[]} produced a trace ID (i.e. really hit
//    the upstream) and a 503, while the sibling routes returned 400 locally.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractBodyCallerSubKey } from '../src/caller-key.js';
import { handleResponses } from '../src/handlers/responses.js';
import { resetResponseStore } from '../src/response-store.js';

function recorder(reply = 'ok') {
  const seen = [];
  return {
    seen,
    handler: async (body) => {
      seen.push(body);
      return { status: 200, body: { id: 'x', choices: [{ message: { role: 'assistant', content: reply } }] } };
    },
  };
}
const userTurn = (text) => [{ role: 'user', content: [{ type: 'input_text', text }] }];

beforeEach(() => resetResponseStore());

describe('chain scope stays stable across turns', () => {
  it('previous_response_id alone mints no scope', () => {
    assert.equal(extractBodyCallerSubKey({ previous_response_id: 'resp_abc' }), '');
  });

  it('adding previous_response_id on turn 2 does not change the scope', () => {
    const t1 = extractBodyCallerSubKey({ model: 'm' });
    const t2 = extractBodyCallerSubKey({ model: 'm', previous_response_id: 'resp_1' });
    const t3 = extractBodyCallerSubKey({ model: 'm', previous_response_id: 'resp_2' });
    assert.equal(t1, t2, 'turn 2 must resolve to the same scope as turn 1');
    assert.equal(t2, t3, 'and it must not drift as the id changes each turn');
  });

  it('a stable client signal still wins and stays stable', () => {
    for (const stable of [{ user: 'alice' }, { safety_identifier: 'eu-7' }, { prompt_cache_key: 'conv-1' }]) {
      const bare = extractBodyCallerSubKey(stable);
      const chained = extractBodyCallerSubKey({ ...stable, previous_response_id: 'resp_9' });
      assert.equal(bare, chained, `${Object.keys(stable)[0]} scope must survive chaining`);
      assert.ok(bare, 'a stable signal must still produce a scope');
    }
  });

  it('a client with NO stable signal can still chain end to end', async () => {
    // The exact shape that used to 404: no user, no prompt_cache_key, callerKey
    // supplied by the server layer (ip+ua fingerprint) and identical on both turns.
    const rec = recorder('remembered');
    const CALLER = 'api:hashhashhashhashhashhashhashha:client:fingerprint1';
    const t1 = await handleResponses(
      { model: 'm', input: userTurn('remember 55123') },
      { handleChatCompletions: rec.handler, context: { callerKey: CALLER } },
    );
    assert.equal(t1.status, 200);

    const t2 = await handleResponses(
      { model: 'm', previous_response_id: t1.body.id, input: userTurn('what number?') },
      { handleChatCompletions: rec.handler, context: { callerKey: CALLER } },
    );
    assert.equal(t2.status, 200, 'a bare SDK client must be able to chain');
    assert.equal(rec.seen[1].messages.length, 3, 'the stored turn must be prepended');
  });
});

describe('empty input is rejected locally, never forwarded', () => {
  it('returns 400 without touching the upstream', async () => {
    const rec = recorder();
    const res = await handleResponses(
      { model: 'm', input: [] },
      { handleChatCompletions: rec.handler, context: { callerKey: 'api:x:user:u' } },
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error.param, 'input');
    assert.equal(rec.seen.length, 0,
      'the upstream must not be called — that path quarantines the account after two hits');
  });

  it('rejects a missing input field the same way', async () => {
    const rec = recorder();
    const res = await handleResponses(
      { model: 'm' },
      { handleChatCompletions: rec.handler, context: { callerKey: 'api:x:user:u' } },
    );
    assert.equal(res.status, 400);
    assert.equal(rec.seen.length, 0);
  });

  it('an empty input is still rejected when chaining', async () => {
    const rec = recorder();
    const t1 = await handleResponses(
      { model: 'm', input: userTurn('hi') },
      { handleChatCompletions: rec.handler, context: { callerKey: 'api:x:user:u' } },
    );
    const res = await handleResponses(
      { model: 'm', previous_response_id: t1.body.id, input: [] },
      { handleChatCompletions: rec.handler, context: { callerKey: 'api:x:user:u' } },
    );
    assert.equal(res.status, 400, 'a chained request with no new turn has nothing to answer');
  });

  it('a tool-result-only input is NOT empty and must pass', async () => {
    // The legitimate chained shape: only function_call_output items.
    const rec = recorder();
    const t1 = await handleResponses(
      { model: 'm', input: userTurn('go') },
      { handleChatCompletions: rec.handler, context: { callerKey: 'api:x:user:u' } },
    );
    const res = await handleResponses(
      {
        model: 'm',
        previous_response_id: t1.body.id,
        input: [{ type: 'function_call_output', call_id: 'c1', output: 'result' }],
      },
      { handleChatCompletions: rec.handler, context: { callerKey: 'api:x:user:u' } },
    );
    assert.equal(res.status, 200, 'tool outputs are a real turn and must not be rejected');
  });
});

describe('truncation status is reserved for truncation', () => {
  // The rule both paths share: `incomplete` means length / content_filter only.
  // A turn that ends by emitting function calls is a COMPLETE turn — an agent loop
  // depends on that, since every tool round-trip would otherwise look truncated.
  // The streaming translator used to hardcode `completed`, which hid real
  // truncation; aligning it must not swing the other way and mark tool turns
  // incomplete.
  const fakeRes = () => ({
    out: '', writableEnded: false,
    write(c) { this.out += c; return true; },
    end(c) { if (c) this.out += c; this.writableEnded = true; },
    on() { return this; },
  });

  const streamWith = (finishReason, extra = {}) => async () => ({
    status: 200, stream: true,
    handler: async (res) => {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'partial answer' } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }], ...extra })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    },
  });

  const lastEvent = (out) => {
    const evts = [...out.matchAll(/^event: (\S+)$/gm)].map(m => m[1]);
    return evts.at(-1);
  };

  it('finish_reason=length closes the stream as response.incomplete', async () => {
    const t = await handleResponses(
      { model: 'm', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: 'x' }] }] },
      { handleChatCompletions: streamWith('length'), context: { callerKey: 'api:x:user:u' } },
    );
    const res = fakeRes();
    await t.handler(res);
    assert.equal(lastEvent(res.out), 'response.incomplete');
    assert.match(res.out, /max_output_tokens/, 'the reason must be surfaced');
  });

  it('finish_reason=tool_calls stays response.completed', async () => {
    const t = await handleResponses(
      { model: 'm', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: 'x' }] }] },
      { handleChatCompletions: streamWith('tool_calls'), context: { callerKey: 'api:x:user:u' } },
    );
    const res = fakeRes();
    await t.handler(res);
    assert.equal(lastEvent(res.out), 'response.completed',
      'a tool round-trip is a complete turn — an agent loop depends on this');
  });

  it('finish_reason=stop stays response.completed', async () => {
    const t = await handleResponses(
      { model: 'm', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: 'x' }] }] },
      { handleChatCompletions: streamWith('stop'), context: { callerKey: 'api:x:user:u' } },
    );
    const res = fakeRes();
    await t.handler(res);
    assert.equal(lastEvent(res.out), 'response.completed');
  });

  it('content_filter also yields incomplete, with its own reason', async () => {
    const t = await handleResponses(
      { model: 'm', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: 'x' }] }] },
      { handleChatCompletions: streamWith('content_filter'), context: { callerKey: 'api:x:user:u' } },
    );
    const res = fakeRes();
    await t.handler(res);
    assert.equal(lastEvent(res.out), 'response.incomplete');
    assert.match(res.out, /content_filter/);
  });
});
