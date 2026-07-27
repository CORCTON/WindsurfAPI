// Chained Responses turns where the client re-sends the server's own tool calls.
//
// Per the Responses contract a chained client sends only what is NEW, so for a
// tool loop that is the `function_call_output` items — the `function_call`s were
// produced by the server and already live in the stored response. Clients re-send
// them anyway (it reads as the safer thing to do), and then the upstream saw the
// SAME assistant tool_call twice and rejected the whole conversation with an
// opaque "an internal error occurred (trace ID …)" — a 503 the caller cannot act
// on and cannot distinguish from a dead account.
//
// Found by running a real agent loop through the proxy: re-sending the calls
// failed on every turn 2, while sending only the outputs completed the task.
// mergeChainedMessages drops the duplicates so both client styles work.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleResponses, mergeChainedMessages } from '../src/handlers/responses.js';
import { resetResponseStore, putResponse, getResponse } from '../src/response-store.js';

const CALLER = 'api:dedupdedupdedupdedupdedupdedupd:user:agent';

function recorder(reply = 'done') {
  const seen = [];
  const sentBodies = [];
  return {
    seen,
    sentBodies,
    handler: async (body) => {
      seen.push(body.messages);
      sentBodies.push(body);
      return { status: 200, body: { id: 'x', choices: [{ message: { role: 'assistant', content: reply } }] } };
    },
  };
}
const call = (id, name = 'read_file') => ({ id, type: 'function', function: { name, arguments: '{}' } });
const toolIds = (msgs) => msgs.filter(m => m.role === 'assistant' && m.tool_calls)
  .flatMap(m => m.tool_calls.map(t => t.id));

beforeEach(() => resetResponseStore());

describe('mergeChainedMessages (unit)', () => {
  it('drops an assistant tool_call the stored history already carries', () => {
    const stored = [{ role: 'user', content: 'go' }, { role: 'assistant', content: '', tool_calls: [call('c1')] }];
    const incoming = [{ role: 'assistant', content: null, tool_calls: [call('c1')] }, { role: 'tool', tool_call_id: 'c1', content: 'r' }];
    const out = mergeChainedMessages(stored, incoming);
    assert.deepEqual(toolIds(out), ['c1'], 'the call must appear exactly once');
    assert.equal(out.filter(m => m.role === 'tool').length, 1, 'the result is new information and must survive');
  });

  it('passes through a call id the stored history has never seen', () => {
    const stored = [{ role: 'assistant', content: '', tool_calls: [call('old')] }];
    const out = mergeChainedMessages(stored, [{ role: 'assistant', content: null, tool_calls: [call('new')] }]);
    assert.deepEqual(toolIds(out).sort(), ['new', 'old']);
  });

  it('keeps only the unseen calls when a message mixes known and new', () => {
    const stored = [{ role: 'assistant', content: '', tool_calls: [call('a')] }];
    const out = mergeChainedMessages(stored, [{ role: 'assistant', content: null, tool_calls: [call('a'), call('b')] }]);
    assert.deepEqual(toolIds(out).sort(), ['a', 'b'], 'no duplicate, no loss');
  });

  it('never drops an assistant message that carries text of its own', () => {
    const stored = [{ role: 'assistant', content: '', tool_calls: [call('c1')] }];
    const out = mergeChainedMessages(stored, [{ role: 'assistant', content: 'reasoning aloud', tool_calls: [call('c1')] }]);
    assert.ok(JSON.stringify(out).includes('reasoning aloud'));
  });

  it('is a plain concat when the stored history has no tool calls', () => {
    const stored = [{ role: 'user', content: 'a' }];
    const incoming = [{ role: 'user', content: 'b' }];
    assert.deepEqual(mergeChainedMessages(stored, incoming), [...stored, ...incoming]);
  });
});

describe('chained tool loop end to end', () => {
  it('a client re-sending both calls and outputs produces a coherent conversation', async () => {
    const rec = recorder();
    putResponse('resp_dup', [
      { role: 'user', content: 'do the thing' },
      { role: 'assistant', content: '', tool_calls: [call('call_a'), call('call_b')] },
    ], CALLER);

    await handleResponses({
      model: 'm',
      previous_response_id: 'resp_dup',
      input: [
        { type: 'function_call', call_id: 'call_a', name: 'read_file', arguments: '{}' },
        { type: 'function_call_output', call_id: 'call_a', output: 'body a' },
        { type: 'function_call', call_id: 'call_b', name: 'read_file', arguments: '{}' },
        { type: 'function_call_output', call_id: 'call_b', output: 'body b' },
      ],
    }, { handleChatCompletions: rec.handler, context: { callerKey: CALLER } });

    const upstream = rec.seen[0];
    assert.deepEqual(toolIds(upstream), ['call_a', 'call_b'],
      `each tool_call must reach the upstream exactly once; got ${JSON.stringify(toolIds(upstream))}`);
    assert.equal(upstream.filter(m => m.role === 'tool').length, 2, 'both results must survive');
  });

  it('a client sending only the outputs (the strict contract) still works', async () => {
    const rec = recorder();
    putResponse('resp_ok', [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: '', tool_calls: [call('c1')] },
    ], CALLER);

    await handleResponses({
      model: 'm',
      previous_response_id: 'resp_ok',
      input: [{ type: 'function_call_output', call_id: 'c1', output: 'r' }],
    }, { handleChatCompletions: rec.handler, context: { callerKey: CALLER } });

    assert.deepEqual(toolIds(rec.seen[0]), ['c1']);
    assert.equal(rec.seen[0].filter(m => m.role === 'tool').length, 1);
  });
});

describe('request-level instructions do not carry over (Responses contract)', () => {
  // The spec: "when used along with previous_response_id, the instructions from a
  // previous response will not be carried over to the next response." So the stored
  // chain's instructions block is REPLACED by the current request's, not merged.
  //
  // A first cut append-with-deduped instead, which accumulated one copy per turn
  // (devin-connect concatenates every system message into one system_prompt) and —
  // worse — silently kept a REVOKED value on toggle-back: with X→Y→X, turn 3's X
  // was dropped as a duplicate, leaving Y as the last and therefore winning line.
  // Live-reproduced: an EN→JA→EN sequence answered in Japanese.
  const sys = (msgs) => msgs.filter(m => m.role === 'system').map(m => m.content);

  const runChain = async (instructionsPerTurn) => {
    resetResponseStore();
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    let prev = null;
    for (const ins of instructionsPerTurn) {
      const res = await handleResponses({
        model: 'm',
        ...(ins ? { instructions: ins } : {}),
        ...(prev ? { previous_response_id: prev } : {}),
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'q' }] }],
      }, deps);
      prev = res.body.id;
    }
    return rec.seen;
  };

  it('a toggle-back keeps the CURRENT instructions, not the revoked one', async () => {
    const seen = await runChain(['Respond in ENGLISH.', 'Respond in JAPANESE.', 'Respond in ENGLISH.']);
    assert.deepEqual(sys(seen[2]), ['Respond in ENGLISH.'],
      'the instructions the client just sent must be the only system block');
  });

  it('identical instructions across five turns stay a single copy', async () => {
    const seen = await runChain(Array(5).fill('YOU ARE AN AGENT. RULES...'));
    assert.equal(sys(seen[4]).length, 1, `turn 5 must carry one system message, got ${sys(seen[4]).length}`);
  });

  it('dropping instructions on a later turn drops them from the chain', async () => {
    // Per the contract there is nothing to carry over, so no system block remains.
    const seen = await runChain(['RULES', null]);
    assert.deepEqual(sys(seen[1]), [], 'stored instructions must not resurface');
  });

  it('a system/developer message that arrived as an input ITEM does carry over', async () => {
    // Conversation items are part of the conversation — only the request-level
    // `instructions` field is per-request.
    resetResponseStore();
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    const t1 = await handleResponses({
      model: 'm',
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: 'ITEM RULE' }] },
        { role: 'user', content: [{ type: 'input_text', text: 'a' }] },
      ],
    }, deps);
    await handleResponses({
      model: 'm', previous_response_id: t1.body.id,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'b' }] }],
    }, deps);
    assert.ok(JSON.stringify(rec.seen[1]).includes('ITEM RULE'),
      'a developer/system conversation item must persist across the chain');
  });

  it('the instructions block is not persisted, so it cannot resurface', async () => {
    // The mechanism is "never store it", not "tag and filter later" — an earlier
    // attempt tagged the message and a still earlier one recorded a leading count,
    // which stopped being valid once the merge moved the block into the middle.
    // Assert the OBSERVABLE consequence: the stored chain has no system message.
    resetResponseStore();
    const rec = recorder();
    const res = await handleResponses({
      model: 'm', instructions: 'RULES',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'q' }] }],
    }, { handleChatCompletions: rec.handler, context: { callerKey: CALLER } });

    // The upstream DID see it on this turn...
    assert.ok(rec.seen[0].some(m => m.role === 'system' && m.content === 'RULES'),
      'the current turn must carry its own instructions');
    // ...but the stored conversation must not, or the next turn would inherit it.
    const stored = getResponse(res.body.id, CALLER);
    assert.equal(stored.ok, true);
    assert.deepEqual(stored.messages.filter(m => m.role === 'system'), [],
      'a persisted instructions block is what made toggle-back keep the revoked value');
  });

  it('no internal marker field leaks into the upstream body', async () => {
    // The internal `__instructionsLead` hint must be stripped before delegation —
    // an earlier version of this test asserted on a symbol name that the
    // implementation no longer used, so it could never fail.
    resetResponseStore();
    const rec = recorder();
    await handleResponses({
      model: 'm', instructions: 'RULES',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'q' }] }],
    }, { handleChatCompletions: rec.handler, context: { callerKey: CALLER } });
    const bodies = rec.sentBodies || [];
    for (const b of bodies) {
      assert.equal('__instructionsLead' in b, false,
        'the internal hint must not reach the chat layer');
    }
  });
});
