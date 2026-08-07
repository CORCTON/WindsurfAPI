// After a terminal event, a stream translator must stop writing.
//
// WHY THIS FILE EXISTS. All three translators guarded `finish()` against
// double-termination and none guarded `processChunk`, so an upstream that kept
// sending after an in-band error was faithfully relayed onto a stream the client had
// already been told was over. Measured on a7326da, one upstream fixture
// (BEFORE -> in-band error -> AFTER_ERROR -> finish_reason:stop -> [DONE]) driven
// through each frontend's real SSE parser:
//
//   Responses   response.failed at event index 5, then response.output_text.delta
//   Anthropic   ... content_block_stop | error | content_block_start |
//               content_block_delta   -> 2 starts vs 1 stop, no message_stop
//   Gemini      array mode body `[{...},{"error":...}],{"candidates":...}` and
//               JSON.parse threw "Unexpected non-whitespace character after JSON at
//               position 180" — the WHOLE body unparseable, not just a stray frame
//
// The Gemini case is the one that shows why this is not cosmetic: error() closes the
// JSON array with `]`, and writeFrame checks only `writableEnded`, so anything after
// it lands outside the array.
//
// Each assertion below drives the parser (feed), never processChunk directly — the
// defect was reachable from the wire, and a test that pokes the method under test
// would not have proven that.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessages } from '../src/handlers/messages.js';
import { handleResponses } from '../src/handlers/responses.js';
import { GeminiStreamTranslator } from '../src/handlers/gemini.js';

function fakeRes() {
  return {
    body: '', writableEnded: false,
    write(c) { this.body += String(c); return true; },
    end(c) { if (c) this.write(c); this.writableEnded = true; },
    on() { return this; }, once() { return this; },
    setHeader() {}, writeHead() { return this; }, flushHeaders() {},
  };
}
const chunk = (o) => `data: ${JSON.stringify(o)}\n\n`;

// The shared fixture: content, an in-band error, then MORE content plus a clean
// terminal. A conforming upstream would stop at the error; this one does not, which
// is the whole point — the gateway must not relay it.
const AFTER = 'AFTER_ERROR';
const NOISY_UPSTREAM = [
  chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'BEFORE' } }] }),
  chunk({ error: { type: 'upstream_error', message: 'boom', status: 502 } }),
  chunk({ choices: [{ index: 0, delta: { content: AFTER } }] }),
  chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  'data: [DONE]\n\n',
];
// Control: the same stream WITHOUT the error. Every "nothing after the error"
// assertion needs this, or a translator that dropped all content would pass.
const CLEAN_UPSTREAM = [
  chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'BEFORE' } }] }),
  chunk({ choices: [{ index: 0, delta: { content: AFTER } }] }),
  chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  'data: [DONE]\n\n',
];

const depsFor = (frames) => ({
  async handleChatCompletions() {
    return {
      status: 200, stream: true,
      async handler(res) { for (const f of frames) res.write(f); res.end(); },
    };
  },
});

async function runAnthropic(frames) {
  const r = await handleMessages(
    { model: 'claude-sonnet-4.6', stream: true, messages: [{ role: 'user', content: 'hi' }] },
    depsFor(frames),
  );
  const res = fakeRes();
  await r.handler(res);
  const events = res.body.trim().split('\n\n').filter(Boolean).filter(f => !f.startsWith(':'))
    .map(f => f.split('\n').find(x => x.startsWith('event: '))?.slice(7)).filter(Boolean);
  return { body: res.body, events };
}

async function runResponses(frames) {
  const r = await handleResponses(
    { model: 'gpt-5.2', stream: true, input: 'hi' },
    { ...depsFor(frames), context: { callerKey: 'api:tguard:user:t' } },
  );
  const res = fakeRes();
  await r.handler(res);
  const events = res.body.trim().split('\n\n').filter(Boolean)
    .map(f => f.split('\n').find(x => x.startsWith('event: '))?.slice(7)).filter(Boolean);
  return { body: res.body, events };
}

function runGemini(frames, mode) {
  const res = fakeRes();
  const t = new GeminiStreamTranslator(res, 'gemini-3.0-pro', { mode });
  for (const f of frames) t.feed(f);
  t.finish();
  return res.body;
}

describe('terminal-event guard: Responses', () => {
  it('emits nothing after response.failed', async () => {
    const { events } = await runResponses(NOISY_UPSTREAM);
    const at = events.findIndex(e => e.includes('failed'));
    assert.ok(at >= 0, `precondition: the error must surface as response.failed. Got: ${events.join('|')}`);
    assert.deepEqual(events.slice(at + 1), [],
      `response.failed is terminal in the Responses contract, so an SDK has already `
      + `settled the request. Events after it: ${events.slice(at + 1).join('|')}`);
  });

  it('does not leak the post-error text into the body', async () => {
    const { body } = await runResponses(NOISY_UPSTREAM);
    assert.ok(!body.includes(AFTER), 'content the upstream sent after the error must not be relayed');
  });

  it('CONTROL: the same content DOES stream when no error precedes it', async () => {
    // Without this, a translator that simply dropped everything after the first
    // delta would satisfy both assertions above.
    const { body, events } = await runResponses(CLEAN_UPSTREAM);
    assert.ok(body.includes(AFTER), 'the guard must not suppress ordinary content');
    assert.ok(events.some(e => e.includes('completed')), `a clean stream still completes: ${events.join('|')}`);
  });
});

describe('terminal-event guard: Anthropic', () => {
  it('opens no second content block after the error event', async () => {
    const { events } = await runAnthropic(NOISY_UPSTREAM);
    const starts = events.filter(e => e === 'content_block_start').length;
    const stops = events.filter(e => e === 'content_block_stop').length;
    assert.equal(starts, stops,
      `every opened block must be closed — an unclosed block leaves Claude Code waiting `
      + `on a stop that never arrives. Sequence: ${events.join('|')}`);
    assert.ok(events.includes('error'), 'the failure itself must still be reported');
  });

  it('does not leak the post-error text', async () => {
    const { body } = await runAnthropic(NOISY_UPSTREAM);
    assert.ok(!body.includes(AFTER), 'content after the error must not be relayed');
  });

  it('the error event is the LAST event, matching stream-error.test.js', async () => {
    // `error` is terminal in the Anthropic contract (stream-error.test.js:99 pins
    // error-first streams the same way), so no message_stop follows it. Asserted so
    // a future reader does not "fix" the absence of message_stop back into a defect.
    const { events } = await runAnthropic(NOISY_UPSTREAM);
    assert.equal(events[events.length - 1], 'error', `sequence: ${events.join('|')}`);
  });

  it('CONTROL: the same content DOES stream when no error precedes it', async () => {
    const { body, events } = await runAnthropic(CLEAN_UPSTREAM);
    assert.ok(body.includes(AFTER), 'the guard must not suppress ordinary content');
    assert.ok(events.includes('message_stop'), `a clean stream still stops: ${events.join('|')}`);
  });
});

describe('terminal-event guard: Gemini', () => {
  it('array mode stays parseable JSON after an error', () => {
    // The defect that makes this the worst of the three: error() writes the closing
    // `]`, so a later frame lands outside the array and the ENTIRE body fails to
    // parse — a client loses the error report too, not just the extra frame.
    const body = runGemini(NOISY_UPSTREAM, 'array');
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(body); },
      `the whole response body must parse. Raw: ${body.slice(0, 220)}`);
    assert.ok(Array.isArray(parsed), 'array mode returns a JSON array');
    assert.ok(parsed.some(f => f.error), 'and the error report survives inside it');
  });

  it('array mode does not leak the post-error frame', () => {
    assert.ok(!runGemini(NOISY_UPSTREAM, 'array').includes(AFTER));
  });

  it('sse mode does not leak the post-error frame either', () => {
    // Two modes, two write paths. Fixing one and not the other is this repo's
    // most-repeated defect shape, so both are driven.
    assert.ok(!runGemini(NOISY_UPSTREAM, 'sse').includes(AFTER));
  });

  it('CONTROL: both modes stream the same content with no error present', () => {
    for (const mode of ['array', 'sse']) {
      const body = runGemini(CLEAN_UPSTREAM, mode);
      assert.ok(body.includes(AFTER), `${mode}: the guard must not suppress ordinary content`);
    }
    assert.doesNotThrow(() => JSON.parse(runGemini(CLEAN_UPSTREAM, 'array')),
      'array mode still closes its bracket on the clean path');
  });
});
