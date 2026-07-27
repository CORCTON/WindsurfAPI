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
import { resetResponseStore, putResponse } from '../src/response-store.js';

const CALLER = 'api:dedupdedupdedupdedupdedupdedupd:user:agent';

function recorder(reply = 'done') {
  const seen = [];
  return {
    seen,
    handler: async (body) => {
      seen.push(body.messages);
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

describe('chained turns do not accumulate duplicate system prompts', () => {
  // Responses clients re-send `instructions` every turn — it is a request-level
  // field, not a conversation item, so the API is designed that way. Each one
  // became a fresh system message, and devin-connect concatenates EVERY system
  // message into the single upstream system_prompt field: turn N shipped N copies
  // of the same instructions, paid for each time and diluting the prompt.
  // Measured before the fix: 5 turns → 5 copies.
  const sysCount = (msgs) => msgs.filter(m => m.role === 'system').length;

  it('an identical instructions block is not duplicated across five turns', async () => {
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    let prev = null;
    for (let t = 1; t <= 5; t++) {
      const res = await handleResponses({
        model: 'm',
        instructions: 'YOU ARE AN AGENT. RULES...',
        ...(prev ? { previous_response_id: prev } : {}),
        input: [{ role: 'user', content: [{ type: 'input_text', text: `turn ${t}` }] }],
      }, deps);
      prev = res.body.id;
    }
    assert.equal(sysCount(rec.seen.at(-1)), 1,
      `turn 5 must carry exactly one system message, got ${sysCount(rec.seen.at(-1))}`);
  });

  it('a CHANGED instructions block still reaches the model', async () => {
    // Clients legitimately adjust instructions mid-conversation; dropping the new
    // text would silently ignore the change.
    const rec = recorder();
    const deps = { handleChatCompletions: rec.handler, context: { callerKey: CALLER } };
    const t1 = await handleResponses({
      model: 'm', instructions: 'RULES A',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'a' }] }],
    }, deps);
    await handleResponses({
      model: 'm', instructions: 'RULES B (changed)', previous_response_id: t1.body.id,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'b' }] }],
    }, deps);
    const texts = rec.seen[1].filter(m => m.role === 'system').map(m => m.content);
    assert.ok(texts.includes('RULES B (changed)'), 'the updated instructions must pass through');
  });

  it('dedupe compares flattened text, so a parts-array system message matches too', () => {
    const stored = [{ role: 'system', content: 'SAME RULES' }];
    const incoming = [{ role: 'system', content: [{ type: 'text', text: 'SAME RULES' }] }];
    assert.equal(mergeChainedMessages(stored, incoming).filter(m => m.role === 'system').length, 1);
  });

  it('an empty system message is not treated as a duplicate of another', () => {
    const stored = [{ role: 'system', content: '' }];
    const out = mergeChainedMessages(stored, [{ role: 'system', content: 'REAL RULES' }]);
    assert.ok(JSON.stringify(out).includes('REAL RULES'));
  });
});
