// Thinking-core T2 (incoming reasoning as continuity source) +
// T4 (thinking/text dedup on the anthropic egress) — design v0.3.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessages, openAIToAnthropic } from '../src/handlers/messages.js';

function chatChunk(chunk) {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function fakeRes() {
  const listeners = new Map();
  return {
    body: '',
    writableEnded: false,
    write(chunk) {
      this.body += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      return true;
    },
    end(chunk) {
      if (chunk) this.write(chunk);
      this.writableEnded = true;
      const cbs = listeners.get('close') || [];
      for (const cb of cbs) cb();
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
      return this;
    },
  };
}

function parseAnthropicEvents(raw) {
  return raw
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .filter(frame => !frame.startsWith(':'))
    .map(frame => {
      const lines = frame.split('\n');
      return {
        event: lines.find(line => line.startsWith('event: '))?.slice(7),
        data: JSON.parse(lines.find(line => line.startsWith('data: '))?.slice(6) || '{}'),
      };
    });
}

describe('T2: incoming thinking captured as continuity source', () => {
  it('captures the LAST assistant turn\u2019s thinking; history stays thinking-free', async () => {
    let capturedBody = null;
    let capturedContext = null;
    await handleMessages({
      model: 'swe-1-7',
      messages: [
        { role: 'user', content: 't1' },
        { role: 'assistant', content: [
          { type: 'thinking', thinking: 'first turn reasoning' },
          { type: 'text', text: 'a1' },
        ] },
        { role: 'user', content: 't2' },
        { role: 'assistant', content: [
          { type: 'thinking', thinking: 'last turn reasoning' },
          { type: 'tool_use', id: 'toolu_9', name: 'Bash', input: { command: 'ls' } },
        ] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_9', content: 'ok' }] },
      ],
    }, {
      async handleChatCompletions(body, context) {
        capturedBody = body;
        capturedContext = context;
        return {
          status: 200,
          body: { model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
        };
      },
    });

    assert.equal(capturedBody._incomingThinking, 'last turn reasoning', 'only the last assistant thinking is captured');
    assert.equal(capturedContext.incomingReasoning, 'last turn reasoning', 'threaded to the handler context');
    for (const m of capturedBody.messages) {
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        assert.equal(m.content.some(b => b.type === 'thinking'), false, 'thinking stays dropped on the wire');
      }
    }
  });

  it('redacted_thinking stays dropped and uncaptured', async () => {
    let capturedBody = null;
    let capturedContext = null;
    await handleMessages({
      model: 'swe-1-7',
      messages: [
        { role: 'user', content: 't1' },
        { role: 'assistant', content: [
          { type: 'redacted_thinking', data: 'opaque' },
          { type: 'text', text: 'a1' },
        ] },
      ],
    }, {
      async handleChatCompletions(body, context) {
        capturedBody = body;
        capturedContext = context;
        return { status: 200, body: { model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } };
      },
    });
    assert.equal(capturedBody._incomingThinking, undefined, 'redacted_thinking never feeds the store');
    assert.equal(capturedContext?.incomingReasoning, undefined);
  });
});

describe('T4: thinking/text dedup on the anthropic egress', () => {
  const mkChoice = (content, reasoning) => ({
    model: 'swe-1-7',
    choices: [{ index: 0, message: { role: 'assistant', content, reasoning_content: reasoning }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  it('non-stream: verbatim duplicate suppresses the thinking block, keeps the text', () => {
    const out = openAIToAnthropic({ id: 'x', created: 1, ...mkChoice('same output', 'same output') }, 'swe-1-7', 'm1');
    const kinds = out.content.map(b => b.type);
    assert.deepEqual(kinds, ['text'], 'duplicate reasoning must not ride twice');
    assert.equal(out.content[0].text, 'same output');
  });

  it('non-stream: distinct reasoning and content both ride', () => {
    const out = openAIToAnthropic({ id: 'x', created: 1, ...mkChoice('the answer', 'the deliberation') }, 'swe-1-7', 'm1');
    const kinds = out.content.map(b => b.type);
    assert.deepEqual(kinds, ['thinking', 'text']);
    assert.equal(out.content[0].thinking, 'the deliberation');
    assert.equal(out.content[1].text, 'the answer');
  });

  async function runStream(chunks) {
    const result = await handleMessages({
      model: 'swe-1-7',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    }, {
      async handleChatCompletions() {
        return {
          status: 200,
          stream: true,
          async handler(res) {
            for (const c of chunks) res.write(chatChunk(c));
            res.end('data: [DONE]\n\n');
          },
        };
      },
    });
    const res = fakeRes();
    await result.handler(res);
    return parseAnthropicEvents(res.body);
  }

  it('stream: content duplicating the streamed reasoning is suppressed', async () => {
    const events = await runStream([
      { choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'step one. ' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { reasoning_content: 'step two.' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: 'step one. step two.' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    ]);
    const starts = events.filter(e => e.event === 'content_block_start');
    assert.deepEqual(starts.map(s => s.data.content_block.type), ['thinking'], 'no duplicate text block');
    const deltas = events.filter(e => e.event === 'content_block_delta' && e.data.delta?.type === 'thinking_delta');
    assert.equal(deltas.map(d => d.data.delta.thinking).join(''), 'step one. step two.');
  });

  it('stream: distinct content flushes untouched after the reasoning', async () => {
    const events = await runStream([
      { choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'deliberation' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: 'the answer' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    ]);
    const starts = events.filter(e => e.event === 'content_block_start');
    assert.deepEqual(starts.map(s => s.data.content_block.type), ['thinking', 'text']);
    const textDeltas = events.filter(e => e.event === 'content_block_delta' && e.data.delta?.type === 'text_delta');
    assert.equal(textDeltas.map(d => d.data.delta.text).join(''), 'the answer');
  });

  it('stream: content without any reasoning emits immediately (no hold)', async () => {
    const events = await runStream([
      { choices: [{ index: 0, delta: { role: 'assistant', content: 'plain' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    ]);
    const starts = events.filter(e => e.event === 'content_block_start');
    assert.deepEqual(starts.map(s => s.data.content_block.type), ['text']);
    const textDeltas = events.filter(e => e.event === 'content_block_delta' && e.data.delta?.type === 'text_delta');
    assert.equal(textDeltas.map(d => d.data.delta.text).join(''), 'plain');
  });
});
