// Cross-handler parity: the streaming usage frame and the streaming error frame.
//
// messages / responses / gemini all delegate to handleChatCompletions, so a
// behavioural change made at the chat layer has to be mirrored on every route.
// Two drifts this pins:
//
// 1. O1 made the trailing usage-only frame opt-in via stream_options.include_usage.
//    messages.js and responses.js were updated; gemini.js was not — and its
//    translator reads chunk.usage to build the terminal frame's usageMetadata, so
//    every Gemini streaming response shipped with NO usage at all.
//
// 2. messages.js / gemini.js resolve a mid-stream error through
//    connectErrorToHttp(err.code) to recover the authoritative {status,type};
//    responses.js read only err.type, collapsing CAPACITY / RATE_LIMITED /
//    MODEL_BLOCKED into a flat api_error and losing the retryable distinction.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleGemini } from '../src/handlers/gemini.js';
import { connectErrorToHttp } from '../src/handlers/chat.js';

describe('gemini streaming asks the chat layer for the usage frame', () => {
  it('threads stream_options.include_usage into the delegated chat request', async () => {
    let seenBody = null;
    const fakeChat = async (body) => {
      seenBody = body;
      return { status: 200, stream: true, handler: () => {} };
    };

    await handleGemini(
      'gemini-2.5-flash',
      { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] },
      { handleChatCompletions: fakeChat, callerKey: '' },
      { stream: true, alt: 'sse' },
    );

    assert.ok(seenBody, 'the chat handler must have been called');
    assert.equal(seenBody.stream, true);
    assert.equal(seenBody.stream_options?.include_usage, true,
      'without include_usage the chat layer omits the usage frame → usageMetadata always absent');
  });

  it('leaves the non-streaming path alone (no usage frame involved)', async () => {
    let seenBody = null;
    const fakeChat = async (body) => {
      seenBody = body;
      return { status: 200, body: { choices: [{ message: { role: 'assistant', content: 'ok' } }] } };
    };

    await handleGemini(
      'gemini-2.5-flash',
      { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] },
      { handleChatCompletions: fakeChat, callerKey: '' },
      { stream: false },
    );

    assert.equal(seenBody.stream, false);
    assert.equal(seenBody.stream_options?.include_usage, undefined,
      'non-stream responses carry usage inline; no opt-in needed');
  });
});

describe('responses streaming error frame resolves the DEVIN_CONNECT code', () => {
  it('the classifier keeps CAPACITY / RATE_LIMITED / MODEL_BLOCKED distinguishable', () => {
    // This is the signal the flat `api_error` collapse was throwing away.
    assert.equal(connectErrorToHttp('CAPACITY').status, 503, 'CAPACITY is transient');
    assert.equal(connectErrorToHttp('RATE_LIMITED').status, 429);
    assert.equal(connectErrorToHttp('MODEL_BLOCKED').status, 402, 'entitlement wall is terminal');
    assert.notEqual(connectErrorToHttp('CAPACITY').type, connectErrorToHttp('MODEL_BLOCKED').type,
      'a retryable and a terminal failure must not share one type');
  });

  it('responses.js resolves the stream error through connectErrorToHttp, like messages/gemini', () => {
    // Structural parity check (same pattern as the shared-trustedClientIp guard):
    // the three routes must agree on how a mid-stream error is classified.
    const src = readFileSync(new URL('../src/handlers/responses.js', import.meta.url), 'utf8');
    assert.ok(/import \{[^}]*connectErrorToHttp[^}]*\} from '\.\/chat\.js'/.test(src),
      'responses.js must import the shared classifier');
    const errorFn = src.slice(src.indexOf('  error(err) {'), src.indexOf('  feed(rawChunk) {'));
    assert.ok(errorFn.includes('connectErrorToHttp(err.code)'),
      'the stream error frame must resolve err.code, not read err.type alone');
  });
});
