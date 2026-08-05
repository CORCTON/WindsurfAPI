// A stream that died having produced ZERO content must not be reported as a
// finished turn — on EVERY egress protocol, not just the one that got it right.
//
// Both truncation guards were gated on having already started emitting:
//
//   gemini.js   finish():  if (this.started       && !this.sawTerminalSignal) …error
//   messages.js finish():  if (this.messageStarted && !this.sawTerminalSignal) …error
//
// So an upstream that ends with no delta, no [DONE], no finish_reason and no error
// frame fell straight through to the NORMAL terminal. MEASURED on master c3ac2b2:
//
//   Gemini      ONE frame, candidates[0].finishReason === 'STOP', parts [{text:''}]
//               → the client reads "the answer is complete, and it is empty"
//   Anthropic   message_start → ping → message_delta(stop_reason:'end_turn')
//               → message_stop, ZERO error events
//   Responses   already correct: response.incomplete / 'upstream_incomplete'
//
// Three egress protocols disagreed about one upstream event, and the two that were
// wrong were the two that told the client everything was fine.
//
// The distinction that must SURVIVE the fix is the reason this is not a one-line
// change: zero content WITH a terminal signal is a legitimately empty completion.
// It happens in production — DEVIN_CONNECT's retry-on-empty and reasoning-only
// rescue exist because of it, and #238 is about a strict client erroring on an
// empty answer — so it must stay a clean, non-error terminal. Every "…is NOT an
// error" case below is that negative control.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessages } from '../src/handlers/messages.js';
import { handleGemini } from '../src/handlers/gemini.js';
import { handleResponses } from '../src/handlers/responses.js';
import * as store from '../src/response-store.js';

// ─── helpers ────────────────────────────────────────────────────

function fakeRes() {
  return {
    body: '',
    writableEnded: false,
    write(chunk) { this.body += typeof chunk === 'string' ? chunk : chunk.toString('utf8'); return true; },
    end(chunk) { if (chunk) this.write(chunk); this.writableEnded = true; },
    on() { return this; },
  };
}

const chunk = (o) => `data: ${JSON.stringify(o)}\n\n`;

// An upstream chat stream that writes exactly `frames` and then ends. Nothing is
// appended — the point of these cases is what the upstream did NOT send.
const upstream = (frames) => async () => ({
  status: 200,
  stream: true,
  handler: async (res) => {
    for (const f of frames) res.write(f);
    res.end();
  },
});

// The four upstream shapes under test. Only DEAD_* lack a terminal signal.
const FRAMES = {
  // Zero content, no terminal signal: the stream died before saying anything.
  DEAD_SILENT: [],
  // Zero VISIBLE content but a chunk did arrive, then death. Separated from
  // DEAD_SILENT because it is what defeated gemini.js specifically: an empty-string
  // delta leaves `started` false there, while messages.js's startMessage() fires on
  // any parseable chunk — so the two frontends failed on different inputs.
  DEAD_AFTER_EMPTY_DELTA: [chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] })],
  // Legitimately empty completion, terminal signal present (bare [DONE]).
  EMPTY_WITH_DONE: ['data: [DONE]\n\n'],
  // Legitimately empty completion, terminal signal present (explicit finish_reason).
  EMPTY_WITH_FINISH: [
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
    'data: [DONE]\n\n',
  ],
  // Ordinary successful turn — the broadest negative control.
  CONTENT_WITH_FINISH: [
    chunk({ choices: [{ index: 0, delta: { content: 'the answer is 4' } }] }),
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
    'data: [DONE]\n\n',
  ],
};

async function runMessages(frames) {
  const result = await handleMessages(
    { model: 'claude-sonnet-4.6', stream: true, messages: [{ role: 'user', content: 'what is 2+2' }] },
    { handleChatCompletions: upstream(frames) },
  );
  const res = fakeRes();
  await result.handler(res);
  return res.body;
}

const anthropicEvents = (raw) => [...raw.matchAll(/^event: (\S+)$/gm)].map(m => m[1]);
const anthropicData = (raw, name) => {
  const m = raw.match(new RegExp(`^event: ${name}\\ndata: (.*)$`, 'm'));
  return m ? JSON.parse(m[1]) : null;
};

async function runGemini(frames, { alt = null } = {}) {
  const result = await handleGemini(
    'gemini-2.5-pro',
    { contents: [{ role: 'user', parts: [{ text: 'what is 2+2' }] }] },
    { handleChatCompletions: upstream(frames) },
    { stream: true, alt },
  );
  const res = fakeRes();
  await result.handler(res);
  return res.body;
}

// Gemini frames, whichever wire mode produced them: SSE is \r\n\r\n-delimited
// `data:` lines, the default mode is one incrementally written JSON array.
const geminiFrames = (raw, mode) => (mode === 'sse'
  ? raw.split('\r\n\r\n').filter(f => f.startsWith('data: ')).map(f => JSON.parse(f.slice(6)))
  : JSON.parse(raw));

const CALLER = 'api:zero-content:user:u1';

async function runResponses(frames) {
  const result = await handleResponses(
    {
      model: 'claude-sonnet-4.6', stream: true, store: true,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'what is 2+2' }] }],
    },
    { handleChatCompletions: upstream(frames), context: { callerKey: CALLER } },
  );
  const res = fakeRes();
  await result.handler(res);
  return res.body;
}

// ─── Anthropic egress ───────────────────────────────────────────

describe('Anthropic stream: zero content and NO terminal signal', () => {
  for (const shape of ['DEAD_SILENT', 'DEAD_AFTER_EMPTY_DELTA']) {
    it(`${shape}: surfaces an error event instead of stop_reason end_turn`, async () => {
      const raw = await runMessages(FRAMES[shape]);
      assert.ok(anthropicEvents(raw).includes('error'),
        'a stream that died with nothing to show must reach the client as an error');
      assert.equal(anthropicData(raw, 'message_delta'), null,
        'faking stop_reason:end_turn tells Claude Code an answer it never received is complete');
      assert.ok(!anthropicEvents(raw).includes('message_stop'),
        'message_stop closes the turn as successful — it must not be sent');
    });

    it(`${shape}: the error is retryable (overloaded_error, 529-class)`, async () => {
      // Anthropic's stop_reason enum has no "truncated" value, so the only way to
      // say "retry this" is the error type. 502 → overloaded_error via
      // toAnthropicError; a flat api_error would make the SDK give up.
      const raw = await runMessages(FRAMES[shape]);
      assert.equal(anthropicData(raw, 'error').error.type, 'overloaded_error');
    });

    it(`${shape}: the event sequence stays well-formed for Claude Code`, async () => {
      // Claude Code reports "Content block not found" when a message_delta or a
      // content_block_* event arrives with no preceding message_start. Whatever we
      // emit on the failure path must not create that shape.
      const events = anthropicEvents(await runMessages(FRAMES[shape]));
      const startAt = events.indexOf('message_start');
      for (const [i, ev] of events.entries()) {
        if (ev === 'message_delta' || ev.startsWith('content_block')) {
          assert.ok(startAt !== -1 && startAt < i,
            `${ev} at index ${i} has no preceding message_start — sequence: ${events.join(', ')}`);
        }
      }
      assert.equal(events.at(-1), 'error', 'the turn ends on the error, nothing after it');
    });
  }
});

describe('Anthropic stream: an EMPTY completion that terminated properly is NOT an error', () => {
  // The negative control. Getting this half wrong turns working requests into
  // errors: an empty-but-terminated answer is a real production outcome.
  for (const shape of ['EMPTY_WITH_DONE', 'EMPTY_WITH_FINISH']) {
    it(`${shape}: closes cleanly with stop_reason end_turn and no error event`, async () => {
      const raw = await runMessages(FRAMES[shape]);
      const events = anthropicEvents(raw);
      assert.ok(!events.includes('error'),
        'a legitimately empty completion must not be reported as a dead stream');
      assert.deepEqual(events.filter(e => e !== 'ping'),
        ['message_start', 'message_delta', 'message_stop'],
        'the client still gets the full, well-formed terminal sequence');
      assert.equal(anthropicData(raw, 'message_delta').delta.stop_reason, 'end_turn');
    });
  }

  it('CONTENT_WITH_FINISH: an ordinary turn is untouched', async () => {
    const raw = await runMessages(FRAMES.CONTENT_WITH_FINISH);
    assert.ok(!anthropicEvents(raw).includes('error'));
    assert.equal(anthropicData(raw, 'message_delta').delta.stop_reason, 'end_turn');
    assert.match(raw, /the answer is 4/);
  });
});

// ─── Gemini egress ──────────────────────────────────────────────

describe('Gemini stream: zero content and NO terminal signal', () => {
  for (const mode of ['sse', 'array']) {
    const alt = mode === 'sse' ? 'sse' : null;
    for (const shape of ['DEAD_SILENT', 'DEAD_AFTER_EMPTY_DELTA']) {
      it(`${mode}/${shape}: emits an error frame, not a STOP candidate`, async () => {
        const raw = await runGemini(FRAMES[shape], { alt });
        const frames = geminiFrames(raw, mode);
        const errFrame = frames.find(f => f.error);
        assert.ok(errFrame, 'the death must surface as an error frame');
        assert.equal(errFrame.error.status, 'UNAVAILABLE',
          'Gemini has no "truncated" finishReason, so retryability lives in the error status');
        assert.ok(!frames.some(f => f.candidates?.[0]?.finishReason),
          'a finishReason of STOP here reads as "complete, and empty"');
      });
    }

    it(`${mode}/DEAD_SILENT: the wire form is still parseable`, async () => {
      // The array mode opens its bracket on the first frame written, so erroring
      // before any candidate frame must not leave the client with a bare fragment.
      const raw = await runGemini(FRAMES.DEAD_SILENT, { alt });
      assert.doesNotThrow(() => geminiFrames(raw, mode));
      if (mode === 'array') assert.ok(Array.isArray(JSON.parse(raw)) && raw.endsWith(']'));
    });
  }
});

describe('Gemini stream: an EMPTY completion that terminated properly is NOT an error', () => {
  for (const mode of ['sse', 'array']) {
    const alt = mode === 'sse' ? 'sse' : null;
    for (const shape of ['EMPTY_WITH_DONE', 'EMPTY_WITH_FINISH']) {
      it(`${mode}/${shape}: keeps its clean STOP terminal frame`, async () => {
        const frames = geminiFrames(await runGemini(FRAMES[shape], { alt }), mode);
        assert.ok(!frames.some(f => f.error),
          'an empty answer the upstream actually finished is not a failure');
        const terminal = frames.find(f => f.candidates?.[0]?.finishReason);
        assert.ok(terminal, 'the terminal frame must still be emitted');
        assert.equal(terminal.candidates[0].finishReason, 'STOP');
        assert.deepEqual(terminal.candidates[0].content.parts, [{ text: '' }],
          'Gemini\'s empty terminal carries an empty text part');
      });
    }

    it(`${mode}/CONTENT_WITH_FINISH: an ordinary turn is untouched`, async () => {
      const frames = geminiFrames(await runGemini(FRAMES.CONTENT_WITH_FINISH, { alt }), mode);
      assert.ok(!frames.some(f => f.error));
      const text = frames.flatMap(f => f.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      assert.equal(text, 'the answer is 4');
      assert.equal(frames.find(f => f.candidates?.[0]?.finishReason).candidates[0].finishReason, 'STOP');
    });
  }
});

// ─── three-way parity ───────────────────────────────────────────

describe('all three egress protocols agree about ONE upstream event', () => {
  beforeEach(() => store.resetResponseStore());

  it('a zero-content death is a failure on Anthropic, Gemini AND Responses', async () => {
    // The defect was not "two handlers have a bug", it was "three protocols
    // disagree and the majority is wrong". Responses was the reference; this
    // asserts the other two now match it rather than inventing a third behaviour.
    const anthropic = await runMessages(FRAMES.DEAD_SILENT);
    const gemini = geminiFrames(await runGemini(FRAMES.DEAD_SILENT, { alt: 'sse' }), 'sse');
    const responses = await runResponses(FRAMES.DEAD_SILENT);

    assert.ok(anthropicEvents(anthropic).includes('error'), 'Anthropic reports the failure');
    assert.ok(gemini.some(f => f.error), 'Gemini reports the failure');
    assert.match(responses, /^event: response\.incomplete$/m, 'Responses reports the failure');
    assert.equal(
      JSON.parse(responses.match(/^event: response\.incomplete\ndata: (.*)$/m)[1])
        .response.incomplete_details.reason,
      'upstream_incomplete',
      'and names it a dropped upstream, not a token limit',
    );
  });

  it('an empty-but-terminated turn is a success on all three', async () => {
    const anthropic = await runMessages(FRAMES.EMPTY_WITH_FINISH);
    const gemini = geminiFrames(await runGemini(FRAMES.EMPTY_WITH_FINISH, { alt: 'sse' }), 'sse');
    const responses = await runResponses(FRAMES.EMPTY_WITH_FINISH);

    assert.ok(!anthropicEvents(anthropic).includes('error'));
    assert.ok(!gemini.some(f => f.error));
    assert.match(responses, /^event: response\.completed$/m);
  });
});
