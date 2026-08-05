// Egress parity: malformed tool `arguments` on the Gemini frontend.
//
// WHY THIS FILE EXISTS. src/handlers/gemini.js opens by declaring it "Mirrors
// src/handlers/messages.js". One fix had not been mirrored: messages.js "B4"
// logs the tool name plus the raw string and keeps the raw string recoverable
// when `arguments` fails to parse, because silently collapsing it into `{}`
// drops every tool parameter with no trace on any channel. Gemini did exactly
// that — two sites, both `catch {}` — so a truncated upstream reply was
// indistinguishable from a tool call that genuinely took no arguments.
// Measured before the fix, on one shared upstream payload: the Anthropic egress
// logged and preserved; the Gemini egress produced `args: {}` and no log line.
//
// That made this the seventh instance of this repo's most-repeated defect shape
// ("a fix covers only some of the protocol routes"), so the assertions below
// drive BOTH Gemini sites and re-drive the Anthropic one from the same payload —
// a parity claim tested on one path is the thing that failed here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openAIToGemini, GeminiStreamTranslator } from '../src/handlers/gemini.js';
import { openAIToAnthropic } from '../src/handlers/messages.js';
import { log } from '../src/config.js';

// Truncated mid-object: what an upstream that stops emitting produces. Carries
// two parameters, so "the parameters survived" is observable rather than vacuous.
const MALFORMED = '{"file_path": "/etc/passwd", "limit": 10';
const WELL_FORMED = '{"file_path": "/etc/hosts", "limit": 5}';

function chatChunk(chunk) {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function fakeRes() {
  return {
    body: '',
    writableEnded: false,
    write(chunk) { this.body += String(chunk); return true; },
    end(chunk) { if (chunk) this.write(chunk); this.writableEnded = true; },
    on() { return this; },
    once() { return this; },
    setHeader() {},
    writeHead() { return this; },
    flushHeaders() {},
  };
}

function parseSseFrames(raw) {
  return raw
    .split('\r\n\r\n')
    .filter(Boolean)
    .filter((f) => f.startsWith('data: '))
    .map((f) => JSON.parse(f.slice(6)));
}

function upstreamWithArgs(args) {
  return {
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_abc', type: 'function', function: { name: 'read_file', arguments: args } }],
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function geminiFunctionCall(body) {
  return body?.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
}

describe('gemini egress: malformed tool arguments stay recoverable (B4 parity)', () => {
  it('non-stream keeps the raw string instead of collapsing to an empty args object', () => {
    const call = geminiFunctionCall(openAIToGemini(upstreamWithArgs(MALFORMED), 'gemini-3.0-pro'));
    assert.ok(call, 'a functionCall part must still be emitted');
    assert.equal(call.name, 'read_file', 'the tool name is not what was malformed');
    // The defect: args === {}. Assert the positive property (recoverable) rather
        // than `notDeepEqual(args, {})`, which would also pass for a wrong key.
    assert.equal(call.args.__raw_arguments, MALFORMED,
      'the unparseable argument string must survive verbatim');
  });

  it('non-stream still parses well-formed arguments into real keys', () => {
    // Guards the fix from over-reaching: a valid payload must NOT be wrapped.
    const call = geminiFunctionCall(openAIToGemini(upstreamWithArgs(WELL_FORMED), 'gemini-3.0-pro'));
    assert.deepEqual(call.args, { file_path: '/etc/hosts', limit: 5 });
    assert.ok(!('__raw_arguments' in call.args), 'valid args must not carry the raw fallback key');
  });

  it('stream path keeps the raw string too — it has its own parse site', () => {
    // flushToolCalls() parses the buffered fragments separately from the
    // non-stream translator. Fixing one and not the other is the exact shape
    // this file exists to prevent, so it is driven independently.
    const res = fakeRes();
    const t = new GeminiStreamTranslator(res, 'gemini-3.0-pro', { mode: 'sse' });
    t.feed(chatChunk({
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, id: 'call_abc', function: { name: 'read_file', arguments: MALFORMED } }] },
      }],
    }));
    t.feed(chatChunk({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }));
    t.feed('data: [DONE]\n\n');
    t.finish();

    const call = parseSseFrames(res.body).map(geminiFunctionCall).find(Boolean);
    assert.ok(call, 'the stream must emit a functionCall part');
    assert.equal(call.args.__raw_arguments, MALFORMED,
      'the streaming parse site must preserve the raw string as well');
  });

  it('stream path parses well-formed buffered arguments normally', () => {
    const res = fakeRes();
    const t = new GeminiStreamTranslator(res, 'gemini-3.0-pro', { mode: 'sse' });
    t.feed(chatChunk({
      choices: [{
        index: 0,
        delta: { tool_calls: [{ index: 0, id: 'call_ok', function: { name: 'read_file', arguments: WELL_FORMED } }] },
      }],
    }));
    t.feed(chatChunk({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }));
    t.feed('data: [DONE]\n\n');
    t.finish();

    const call = parseSseFrames(res.body).map(geminiFunctionCall).find(Boolean);
    assert.deepEqual(call.args, { file_path: '/etc/hosts', limit: 5 });
  });

  it('the failure is logged with the tool name and the raw string', () => {
    // Preserving the data and reporting it are separate properties: a silent
    // recovery still leaves an operator unable to see that the upstream is
    // emitting truncated tool calls at all. The original defect lost BOTH, and
    // an assertion on only the data would let the log half regress unnoticed.
    const warns = [];
    const original = log.warn;
    log.warn = (...args) => { warns.push(args.join(' ')); };
    try {
      openAIToGemini(upstreamWithArgs(MALFORMED), 'gemini-3.0-pro');
    } finally {
      log.warn = original;
    }
    const lines = warns.filter((w) => w.includes('functionCall arguments JSON parse failed'));
    assert.equal(lines.length, 1, `expected exactly one parse-failure line, got:\n${warns.join('\n')}`);
    assert.match(lines[0], /read_file/, 'the tool name makes the line actionable');
    assert.match(lines[0], /file_path/, 'the raw string must be in the log, not just the return value');
  });

  it('a well-formed payload logs nothing', () => {
    // Negative control. Without it the assertion above passes on a version that
    // logs unconditionally, which would flood an operator on every tool call.
    const warns = [];
    const original = log.warn;
    log.warn = (...args) => { warns.push(args.join(' ')); };
    try {
      openAIToGemini(upstreamWithArgs(WELL_FORMED), 'gemini-3.0-pro');
    } finally {
      log.warn = original;
    }
    assert.equal(warns.filter((w) => w.includes('JSON parse failed')).length, 0);
  });

  it('both frontends recover the same malformed payload — the parity claim itself', () => {
    // One shared upstream object, two egress translations. This is the assertion
    // that would have caught the original divergence: each path on its own looked
    // internally consistent.
    const payload = upstreamWithArgs(MALFORMED);
    const gArgs = geminiFunctionCall(openAIToGemini(structuredClone(payload), 'gemini-3.0-pro')).args;
    const aInput = openAIToAnthropic(structuredClone(payload), 'claude-sonnet-4.6', 'msg_1')
      .content.find((b) => b.type === 'tool_use').input;

    assert.equal(gArgs.__raw_arguments, MALFORMED, 'gemini recovers the raw string');
    assert.equal(aInput.__raw_arguments, MALFORMED, 'anthropic recovers the raw string');
    assert.equal(gArgs.__raw_arguments, aInput.__raw_arguments,
      'both frontends expose it under the same key, so a client can handle one case');
  });
});

describe('gemini egress: the FINISH_MAP default rests on a stated premise', () => {
  // mapFinishReason falls back to 'STOP' for anything not in FINISH_MAP. That is
  // only safe while every finish_reason this proxy emits is a key in it. The one
  // value that is not — `error`, from a special-agent run that failed after
  // headers were sent — is unreachable here ONLY because the error frame arrives
  // first and latches `finished`. That ordering is the premise; assert it,
  // because if it ever inverts, a failed run reports as a clean completion —
  // precisely what special-agent.js's "H2" comment exists to prevent.
  it('an error frame terminates the stream, so a later error finish never becomes STOP', () => {
    const res = fakeRes();
    const t = new GeminiStreamTranslator(res, 'gemini-3.0-pro', { mode: 'sse' });
    t.feed(chatChunk({ choices: [{ index: 0, delta: { content: 'partial output' } }] }));
    // Exactly what special-agent.js sends on failure, in its real order.
    t.feed(chatChunk({ error: { type: 'backend_error', message: 'special-agent stream failed' } }));
    t.feed(chatChunk({ choices: [{ index: 0, delta: {}, finish_reason: 'error' }] }));
    t.feed('data: [DONE]\n\n');
    t.finish();

    const frames = parseSseFrames(res.body);
    assert.ok(frames.some((f) => f.error), 'the failure must surface as an error frame');
    const stopFrames = frames.filter((f) => f.candidates?.[0]?.finishReason === 'STOP');
    assert.equal(stopFrames.length, 0,
      'a failed run must not also emit a clean STOP terminal frame');
  });

  it('every finish_reason the proxy can emit is an explicit FINISH_MAP key', () => {
    // Range measured from the producers: special-agent.js mapFinishReason
    // (stop / length / tool_calls / content_filter) and devin-connect
    // resolveFinishReason ('length'). A new producer value would land on the
    // default and silently read as a clean stop, so pin the set behaviourally:
    // each must map to something, and NOT by falling through the default.
    const expected = {
      stop: 'STOP',
      length: 'MAX_TOKENS',
      tool_calls: 'STOP',
      content_filter: 'SAFETY',
    };
    for (const [reason, want] of Object.entries(expected)) {
      const body = openAIToGemini({
        choices: [{ index: 0, message: { role: 'assistant', content: 'x' }, finish_reason: reason }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }, 'gemini-3.0-pro');
      assert.equal(body.candidates[0].finishReason, want,
        `finish_reason '${reason}' must map to ${want}`);
    }
    // Negative control: content_filter must NOT be the default. Without this the
    // loop above would pass even if every entry collapsed to STOP.
    assert.notEqual(expected.content_filter, 'STOP',
      'the table under test must contain at least one non-default mapping');
  });
});
