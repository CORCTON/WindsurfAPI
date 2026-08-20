import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleCompletions } from '../src/handlers/completions.js';

function rejectedFor(result, param) {
  return result?.status === 400
    && result?.body?.error?.type === 'invalid_request_error'
    && result?.body?.error?.param === param;
}

function fakeChat(impl) {
  const calls = [];
  const handleChatCompletions = async (body, context) => {
    calls.push({ body, context });
    return impl(body, context);
  };
  return { handleChatCompletions, calls };
}

const okChatBody = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: 1,
  model: 'swe-1-lite',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'hello there' },
    finish_reason: 'stop',
    logprobs: null,
  }],
  usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
};

describe('handleCompletions validation', () => {
  it('rejects stream:true with 400 param=stream and does not call chat', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: 'hi', stream: true },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.ok(rejectedFor(result, 'stream'), JSON.stringify(result?.body));
    assert.equal(chat.calls.length, 0);
  });

  it('rejects a missing prompt with 400 param=prompt', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite' },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.ok(rejectedFor(result, 'prompt'), JSON.stringify(result?.body));
    assert.equal(chat.calls.length, 0);
  });

  it('rejects an empty string prompt', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: '' },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.ok(rejectedFor(result, 'prompt'), JSON.stringify(result?.body));
    assert.equal(chat.calls.length, 0);
  });

  it('rejects an empty prompt array', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: [] },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.ok(rejectedFor(result, 'prompt'), JSON.stringify(result?.body));
    assert.equal(chat.calls.length, 0);
  });

  it('rejects a whitespace-only prompt as empty', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: '   ' },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.ok(rejectedFor(result, 'prompt'), JSON.stringify(result?.body));
    assert.equal(chat.calls.length, 0);
  });

  it('rejects a non-string prompt', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: 12 },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.ok(rejectedFor(result, 'prompt'), JSON.stringify(result?.body));
    assert.equal(chat.calls.length, 0);
  });
});

describe('handleCompletions translation', () => {
  it('turns a string prompt into a single user message and maps text_completion', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: 'hi', temperature: 0.2 },
      { handleChatCompletions: chat.handleChatCompletions, callerKey: 'api:test' },
    );

    assert.equal(chat.calls.length, 1);
    const sent = chat.calls[0].body;
    assert.equal(sent.stream, false);
    assert.equal(sent.__route, 'completions');
    assert.equal(sent.model, 'swe-1-lite');
    assert.equal(sent.temperature, 0.2);
    assert.equal(sent.prompt, undefined);
    assert.deepEqual(sent.messages, [{ role: 'user', content: 'hi' }]);
    assert.equal(chat.calls[0].context.callerKey, 'api:test');

    assert.equal(result.status, 200);
    assert.equal(result.body.object, 'text_completion');
    assert.equal(result.body.id, 'chatcmpl-test');
    assert.equal(result.body.model, 'swe-1-lite');
    assert.equal(result.body.choices[0].text, 'hello there');
    assert.equal(result.body.choices[0].index, 0);
    assert.equal(result.body.choices[0].finish_reason, 'stop');
    assert.equal(result.body.choices[0].message, undefined);
    assert.deepEqual(result.body.usage, okChatBody.usage);
  });

  it('joins a string[] prompt', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    await handleCompletions(
      { model: 'swe-1-lite', prompt: ['Hello', ' ', 'world'] },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.deepEqual(chat.calls[0].body.messages, [{ role: 'user', content: 'Hello world' }]);
  });

  it('maps message.content arrays onto choices[].text', async () => {
    const chat = fakeChat(() => ({
      status: 200,
      body: {
        ...okChatBody,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: [{ type: 'text', text: 'ab' }, { type: 'text', text: 'cd' }] },
          finish_reason: 'stop',
        }],
      },
    }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: 'hi' },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.equal(result.body.choices[0].text, 'abcd');
  });

  it('passes chat-layer errors through without rewriting object', async () => {
    const chat = fakeChat(() => ({
      status: 503,
      body: { error: { message: 'high demand', type: 'capacity_error' } },
      headers: { 'Retry-After': '30' },
    }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: 'hi' },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.error.type, 'capacity_error');
    assert.equal(result.headers['Retry-After'], '30');
    assert.equal(result.body.object, undefined);
  });
});

describe('handleCompletions reuses chat gates', () => {
  it('keeps n>1 as 400 param=n from handleChatCompletions', async () => {
    const result = await handleCompletions({ model: 'claude-sonnet-4.6', prompt: 'hi', n: 2 });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.type, 'invalid_request_error');
    assert.equal(result.body.error.param, 'n');
  });

  it('rejects Completions-style integer logprobs via the chat gate', async () => {
    const result = await handleCompletions({ model: 'claude-sonnet-4.6', prompt: 'hi', logprobs: 5 });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.param, 'logprobs');
  });
});

describe('handleCompletions request hygiene', () => {
  it('rejects best_of>1', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: 'hi', best_of: 4 },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.ok(rejectedFor(result, 'best_of'), JSON.stringify(result?.body));
    assert.equal(chat.calls.length, 0);
  });

  it('rejects a null body instead of throwing', async () => {
    const result = await handleCompletions(null, {});
    assert.equal(result.status, 400);
    assert.equal(result.body.error.param, 'body');
  });

  it('does not forward __* internal carriers into chat', async () => {
    const chat = fakeChat(() => ({ status: 200, body: okChatBody }));
    await handleCompletions(
      { model: 'swe-1-lite', prompt: 'hi', __callerKey: 'stolen', __cachePolicy: { ttl: '1h' } },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.equal(chat.calls[0].body.__callerKey, undefined);
    assert.equal(chat.calls[0].body.__cachePolicy, undefined);
    assert.equal(chat.calls[0].body.__route, 'completions');
  });

  it('maps reasoning_content onto choices[].text when content is empty', async () => {
    const chat = fakeChat(() => ({
      status: 200,
      body: {
        ...okChatBody,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: null, reasoning_content: 'thoughts' },
          finish_reason: 'stop',
        }],
      },
    }));
    const result = await handleCompletions(
      { model: 'swe-1-lite', prompt: 'hi' },
      { handleChatCompletions: chat.handleChatCompletions },
    );
    assert.equal(result.body.choices[0].text, 'thoughts');
  });
});

describe('POST /v1/completions is wired in the server', () => {
  it('server.js owns the route', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
    assert.match(src, /path === '\/v1\/completions'/);
    assert.match(src, /handleCompletions\(/);
  });
});
