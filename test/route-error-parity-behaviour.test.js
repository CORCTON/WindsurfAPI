// The route-parity guard checks SOURCE SHAPE, and shape is escapable.
//
// handler-route-parity-guard.test.js verifies that each delegating route calls
// connectErrorToHttp and that the bound name is read more than once. "Read more than
// once" is satisfied by any second mention of the name. Reproduced: restoring the
// pre-v3.8.0 defect (reading a flat err.type instead of the classifier's result) while
// leaving a dead binding that a console.log happens to read keeps that suite at 10/10.
//
// This file asserts the BEHAVIOUR instead. The call site is the STREAM translator's
// error() path — a mid-stream error chunk shaped { type, code, message } — so that is what
// these tests drive, rather than a thrown error (handleMessages does not catch those, and
// a test that throws exercises none of this).
//
// Two mappings are chained: connectErrorToHttp turns the connect code into {status,type},
// then toAnthropicError normalises that to a valid Anthropic type (CAPACITY → 503
// capacity_error → 529 overloaded_error). The assertion therefore compares against the
// composed result, computed from the shipped helpers rather than hardcoded — a literal
// table here would just re-encode today's numbers and pass even if both mappings broke
// together.
//
// Kept alongside the source guard rather than replacing it: that guard also enforces "no
// new protocol front escapes the list", which is a real and different property.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connectErrorToHttp } from '../src/handlers/chat.js';
import { handleMessages } from '../src/handlers/messages.js';

/** One transient, one auth, one billing, one rate-limit, one truncation. */
const CODES = ['CAPACITY', 'TIMEOUT', 'RATE_LIMITED', 'MODEL_BLOCKED', 'UNAUTHORIZED', 'STREAM_TRUNCATED'];

function fakeRes() {
  return {
    body: '',
    headersSent: false,
    writeHead() { this.headersSent = true; },
    write(c) { this.body += c; return true; },
    end(c) { if (c) this.body += c; this.ended = true; },
    on() {}, once() {}, removeListener() {},
  };
}

/** Parse `event: x\ndata: {...}` SSE pairs. */
function parseEvents(raw) {
  const out = [];
  for (const block of raw.split('\n\n')) {
    const ev = block.match(/^event:\s*(.+)$/m);
    const data = block.match(/^data:\s*(.+)$/m);
    if (ev && data) {
      try { out.push({ event: ev[1].trim(), data: JSON.parse(data[1]) }); } catch { /* skip */ }
    }
  }
  return out;
}

/** Drive a stream that dies mid-flight with a connect-classified error chunk. */
async function streamThatFailsWith(code) {
  const result = await handleMessages({
    model: 'claude-sonnet-4.6',
    stream: true,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'hi' }],
  }, {
    async handleChatCompletions() {
      return {
        status: 200,
        stream: true,
        async handler(res) {
          // A real delta first, so the translator has started a message.
          res.write(`data: ${JSON.stringify({
            id: 'x', object: 'chat.completion.chunk', created: 0, model: 'claude-sonnet-4-6-thinking',
            choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
          })}\n\n`);
          // Then the mid-stream error the connect path emits: type + code + message.
          res.write(`data: ${JSON.stringify({
            error: { type: 'upstream_error', code, message: `upstream failed (${code})` },
          })}\n\n`);
          res.end('data: [DONE]\n\n');
        },
      };
    },
    callerKey: 'parity',
  });

  const res = fakeRes();
  await result.handler(res);
  return parseEvents(res.body);
}

describe('connectErrorToHttp can actually discriminate', () => {
  it('maps every pinned code away from the flat 500 fallback', () => {
    // Precondition for everything below: if a code mapped to {500, undefined} the route
    // assertion would pass whether or not the classifier ran.
    for (const code of CODES) {
      const mapped = connectErrorToHttp(code);
      assert.ok(mapped && typeof mapped.status === 'number', `${code} must map to a status`);
      assert.notEqual(mapped.status, 500,
        `${code} maps to 500, the same as the flat fallback — it cannot discriminate`);
      assert.ok(mapped.type, `${code} must map to a type`);
    }
  });
});

describe('/v1/messages mid-stream errors carry the classifier verdict', () => {
  for (const code of CODES) {
    it(`translates ${code} through the classifier, not a flat error type`, async () => {
      const { toAnthropicError } = await import('../src/handlers/messages.js');
      const http = connectErrorToHttp(code);
      const expected = toAnthropicError(http.status, http.type, 'x').body.error.type;
      // The flat path would compute this instead — from err.type ('upstream_error') and
      // err.status (absent → 500). If the two agree for some code, the assertion below
      // cannot tell them apart, so state that rather than silently passing.
      const flat = toAnthropicError(500, 'upstream_error', 'x').body.error.type;

      const events = await streamThatFailsWith(code);
      const errEvent = events.find((e) => e.event === 'error');

      assert.ok(errEvent, `${code}: an error event must be emitted`);
      if (expected === flat) {
        assert.equal(errEvent.data.error.type, expected,
          `${code}: classifier and flat path agree here, so this only pins the value`);
        return;
      }
      assert.equal(errEvent.data.error.type, expected,
        `${code}: expected the classifier-derived "${expected}", got `
        + `"${errEvent.data.error.type}". The flat err.type fallback would answer "${flat}".`);
    });
  }
});
