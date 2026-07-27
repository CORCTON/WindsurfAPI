// A stream that dies mid-answer must not be reported as a finished turn.
//
// Handoff item 2. Two independent layers had the same blind spot, and each needed
// its own fix:
//
//  1. devin-connect.js treated a socket that ended WITHOUT the mandatory
//     Connect-RPC end-of-stream frame as a clean drain — the generator returned
//     normally with reason=null, and null defaults to 'stop'.
//  2. The Responses translator treated an ABSENT finish_reason the same as a benign
//     one, closing the turn as `response.completed`.
//
// Together those meant a dropped connection produced a half answer labelled
// complete, which was then committed to the response store and became the NEXT
// turn's context — a corruption that outlived the request that caused it.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { handleResponses } from '../src/handlers/responses.js';
import * as store from '../src/response-store.js';
import { streamChat, __setRequestImpl, isRetryable } from '../src/devin-connect.js';
import { writeStringField, writeVarintField } from '../src/proto.js';
import { wrapEnvelope, endOfStreamEnvelope } from '../src/connect.js';

const fakeRes = () => ({
  out: '', writableEnded: false,
  write(c) { this.out += c; return true; },
  end(c) { if (c) this.out += c; this.writableEnded = true; },
  on() { return this; },
});

const lastEvent = (out) => [...out.matchAll(/^event: (\S+)$/gm)].map(m => m[1]).at(-1);
const eventData = (out, name) => {
  const m = out.match(new RegExp(`^event: ${name}\\ndata: (.*)$`, 'm'));
  return m ? JSON.parse(m[1]) : null;
};

const CALLER = 'api:truncation:user:u1';

// An upstream that streams `chunks` and then ends however `finishReason` says:
// a string sends the terminal chunk, null sends nothing (connection dropped).
const streamThat = (chunks, finishReason) => async () => ({
  status: 200, stream: true,
  handler: async (res) => {
    for (const c of chunks) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
    }
    if (finishReason !== null) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\n`);
      res.write('data: [DONE]\n\n');
    }
    res.end();
  },
});

async function runStream(handleChatCompletions) {
  const t = await handleResponses(
    {
      model: 'claude-sonnet-4.6', stream: true, store: true,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'what is 2+2' }] }],
    },
    { handleChatCompletions, context: { callerKey: CALLER } },
  );
  const res = fakeRes();
  await t.handler(res);
  return { out: res.out, responseId: res.out.match(/"id":"(resp_[^"]+)"/)?.[1] };
}

beforeEach(() => store.resetResponseStore());

describe('Responses stream: an upstream that never sent a terminal chunk', () => {
  it('closes as response.incomplete, not response.completed', async () => {
    const { out } = await runStream(streamThat(['The answer is 4'], null));
    assert.equal(lastEvent(out), 'response.incomplete',
      'a stream that died mid-answer must not be reported as a finished turn');
  });

  it('names the reason "upstream_incomplete", NOT max_output_tokens', async () => {
    // Mislabelling a dropped connection as a token limit sends an auto-continuing
    // client off to extend a turn the upstream never finished.
    const { out } = await runStream(streamThat(['The answer is 4'], null));
    const data = eventData(out, 'response.incomplete');
    assert.equal(data.response.incomplete_details.reason, 'upstream_incomplete');
  });

  it('does NOT commit the partial answer to the response store', async () => {
    // The corruption that outlived the request: the half answer became the next
    // turn's context, and the client had no way to see it.
    const { responseId } = await runStream(streamThat(['The answer is 4'], null));
    assert.ok(responseId, 'precondition: a response id was minted');
    assert.equal(store.getResponse(responseId, CALLER).ok, false,
      'a truncated turn must not be chainable');
  });

  it('still delivers the bytes the upstream DID send', async () => {
    // Reporting the turn as incomplete must not withhold the partial text — the
    // client asked for a stream and is entitled to what arrived.
    const { out } = await runStream(streamThat(['The answer ', 'is 4'], null));
    assert.match(out, /The answer /);
    assert.match(out, /is 4/);
  });
});

describe('Responses stream: turns that DID terminate are unchanged', () => {
  it('finish_reason=stop still completes and still commits to the store', async () => {
    const { out, responseId } = await runStream(streamThat(['4'], 'stop'));
    assert.equal(lastEvent(out), 'response.completed');
    assert.equal(store.getResponse(responseId, CALLER).ok, true,
      'a clean turn must remain chainable — this is the feature, not a side effect');
  });

  it('finish_reason=tool_calls still completes (an agent loop depends on it)', async () => {
    const { out } = await runStream(streamThat(['calling'], 'tool_calls'));
    assert.equal(lastEvent(out), 'response.completed');
  });

  it('finish_reason=length still reports max_output_tokens, not upstream_incomplete', async () => {
    // Real truncation keeps its own distinct reason; the new case must not swallow it.
    const { out } = await runStream(streamThat(['cut off'], 'length'));
    assert.equal(lastEvent(out), 'response.incomplete');
    assert.equal(eventData(out, 'response.incomplete').response.incomplete_details.reason,
      'max_output_tokens');
  });

  it('finish_reason=content_filter keeps its own reason too', async () => {
    const { out } = await runStream(streamThat(['refus'], 'content_filter'));
    assert.equal(eventData(out, 'response.incomplete').response.incomplete_details.reason,
      'content_filter');
  });

  it('a real truncated turn is also kept out of the store', async () => {
    const { responseId } = await runStream(streamThat(['cut off'], 'length'));
    assert.equal(store.getResponse(responseId, CALLER).ok, false,
      'a length-truncated reply is not a complete turn either');
  });
});

describe('connect layer: a stream with no end-of-stream frame is an error', () => {
  const TOKEN = 'devin-session-token$test.jwt.sig';

  function mockTransport(payloads, { trailer }) {
    return (_opts, cb) => {
      const req = new EventEmitter();
      req.setTimeout = () => req; req.write = () => {}; req.destroy = () => {};
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 200;
        setImmediate(() => {
          for (const p of payloads) res.emit('data', wrapEnvelope(p, { compress: false }));
          if (trailer) res.emit('data', endOfStreamEnvelope());
          res.emit('end');
        });
        cb(res);
      };
      return req;
    };
  }

  async function drain(payloads, opts) {
    __setRequestImpl(mockTransport(payloads, opts));
    try {
      const events = [];
      for await (const ev of streamChat({
        messages: [{ role: 'user', content: 'hi' }], model: 'claude-sonnet-4.6',
        token: TOKEN, env: { DEVIN_CONNECT_TOKEN: TOKEN },
      })) events.push(ev);
      return { events, err: null };
    } catch (err) {
      return { events: null, err };
    } finally {
      __setRequestImpl(null);
    }
  }

  it('throws STREAM_TRUNCATED instead of yielding a clean finish', async () => {
    // Connect-RPC always terminates a stream with an end-of-stream frame. Without
    // one the answer is partial, but the generator used to return normally with
    // reason=null — and null maps to 'stop', so a truncated answer arrived at all
    // four protocol handlers looking like a completed turn.
    const { err } = await drain([writeStringField(3, 'The answer is 4')], { trailer: false });
    assert.ok(err, 'a truncated stream must not drain cleanly');
    assert.equal(err.code, 'STREAM_TRUNCATED');
  });

  it('is retryable — a replay usually lands a complete answer', async () => {
    // Transport-level truncation is the same class of fault as ECONNRESET. The
    // stream path only replays while nothing has been emitted, so this cannot
    // duplicate delivered content.
    assert.equal(isRetryable({ code: 'STREAM_TRUNCATED' }), true);
  });

  it('a stream WITH the end-of-stream frame still completes normally', async () => {
    const { events, err } = await drain(
      [Buffer.concat([writeStringField(3, 'done'), writeVarintField(5, 2)])],
      { trailer: true },
    );
    assert.equal(err, null, 'a well-formed stream must not be affected');
    assert.equal(events.find(e => e.type === 'finish').reason, 'stop');
  });
});
