// Item 15 — the Responses exit reported `input_tokens: 0` when the upstream had
// reported no usage at all.
//
// The original report framed this as a four-protocol divergence ("only Anthropic
// estimates; the others report 0 or omit; a billing relay gets different numbers for
// one request"). MEASURED, that framing is wrong: on REAL values the exits agree —
// Responses reports 111/22/133 and Anthropic's message_delta corrects its
// message_start pre-fill of input_tokens:1, which the Anthropic spec requires because
// message_start must carry usage before any count is known.
//
// The real defect is narrower and one-directional. Zero is not "unknown" — it is an
// ASSERTION that the turn consumed no prompt tokens, which is false for any request
// that reached a model, and a billing relay reading it silently under-bills. The two
// other exits already got this right, which is why the fix copies them rather than
// inventing a shape: the Gemini exit's buildUsageMetadata returns undefined for a
// silent upstream, and the OpenAI chat route emits no usage frame at all unless
// stream_options.include_usage opts in.
//
// Field sets are deliberately NOT unified. Anthropic splits cache_creation /
// cache_read, OpenAI has cached_tokens, Gemini has cachedContentTokenCount; forcing a
// common shape would produce bodies that violate each SDK's own contract. Only the
// "do not assert a number you do not have" rule is shared.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleResponses, chatToResponse } from '../src/handlers/responses.js';
import { openAIToGemini } from '../src/handlers/gemini.js';

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

const SILENT = [
  chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'hi' } }] }),
  chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  'data: [DONE]\n\n',
];
const REPORTING = [
  chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'hi' } }] }),
  chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  chunk({ choices: [], usage: { prompt_tokens: 111, completion_tokens: 22, total_tokens: 133 } }),
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

async function terminalResponse(frames) {
  const r = await handleResponses(
    { model: 'gpt-5.2', stream: true, input: 'hi' },
    { ...depsFor(frames), context: { callerKey: 'api:usage:user:t' } },
  );
  const res = fakeRes();
  await r.handler(res);
  const frame = res.body.trim().split('\n\n').filter(Boolean)
    .map(f => {
      const ev = f.split('\n').find(x => x.startsWith('event: '))?.slice(7);
      const d = f.split('\n').find(x => x.startsWith('data: '))?.slice(6);
      let data = null;
      try { data = d ? JSON.parse(d) : null; } catch { /* non-JSON */ }
      return { ev, data };
    })
    .filter(x => x.ev === 'response.completed' || x.ev === 'response.incomplete')
    .pop();
  return frame?.data?.response;
}

describe('item 15 — unknown usage is omitted, not reported as zero', () => {
  it('omits usage from the streaming terminal event when the upstream said nothing', async () => {
    // MEASURED pre-fix: input_tokens 0, output_tokens 0, total_tokens 0, and every
    // *_details subfield 0 — a complete, confident, false report.
    const response = await terminalResponse(SILENT);
    assert.equal('usage' in response, false, `usage should be absent, got ${JSON.stringify(response.usage)}`);
  });

  it('reports real streaming usage byte-identically', async () => {
    // The regression direction: suppressing a value the gateway DOES have would be
    // worse than the defect being fixed.
    const response = await terminalResponse(REPORTING);
    assert.deepEqual(response.usage, {
      input_tokens: 111,
      output_tokens: 22,
      total_tokens: 133,
      input_tokens_details: { text_tokens: 111, audio_tokens: 0, image_tokens: 0, cached_tokens: 0 },
      output_tokens_details: { text_tokens: 22, audio_tokens: 0, reasoning_tokens: 0 },
    });
  });

  it('omits usage on the non-streaming path too', async () => {
    // Both call sites must agree. If only one is fixed, the same silent upstream
    // yields usage:0 on one path and absence on the other.
    const body = chatToResponse(
      { choices: [{ message: { role: 'assistant', content: 'hi' } }], model: 'm' },
      'm', 'resp_x', 'msg_x', [],
    );
    assert.equal('usage' in body, false, `usage should be absent, got ${JSON.stringify(body.usage)}`);
  });

  it('reports real non-streaming usage', async () => {
    const body = chatToResponse(
      {
        choices: [{ message: { role: 'assistant', content: 'hi' } }],
        model: 'm',
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
      },
      'm', 'resp_x', 'msg_x', [],
    );
    assert.equal(body.usage.input_tokens, 7);
    assert.equal(body.usage.output_tokens, 3);
    assert.equal(body.usage.total_tokens, 10);
  });

  it('recognises the input_tokens/output_tokens spelling as reported', () => {
    // Not a hypothetical alias: src/handlers/chat.js builds usage with
    // `input_tokens` (:1844, commented as "OpenAI's legacy field == prompt_tokens"),
    // and mapUsage reads both spellings. A presence check covering only the
    // prompt_tokens spelling would treat those real counts as silence and DROP them.
    // Found by a mutation that narrowed the key list and SURVIVED — every fixture
    // here had used the prompt_tokens spelling, so the alias was never load-bearing.
    const body = chatToResponse(
      {
        choices: [{ message: { role: 'assistant', content: 'hi' } }],
        model: 'm',
        usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 },
      },
      'm', 'resp_x', 'msg_x', [],
    );
    assert.equal('usage' in body, true, 'the legacy spelling must count as reported');
    assert.equal(body.usage.input_tokens, 5);
    assert.equal(body.usage.output_tokens, 1);
  });

  it('recognises a usage frame carrying only total_tokens', () => {
    const body = chatToResponse(
      { choices: [{ message: { role: 'assistant', content: 'hi' } }], model: 'm', usage: { total_tokens: 9 } },
      'm', 'resp_x', 'msg_x', [],
    );
    assert.equal('usage' in body, true);
    assert.equal(body.usage.total_tokens, 9);
  });

  it('treats an explicit zero from the upstream as a REPORTED value', () => {
    // The distinction the fix rests on: an upstream saying "0 tokens" is data, an
    // upstream saying nothing is not. Collapsing them would make the fix suppress a
    // real report. A cached hit legitimately reports 0 completion tokens.
    const body = chatToResponse(
      {
        choices: [{ message: { role: 'assistant', content: '' } }],
        model: 'm',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      },
      'm', 'resp_x', 'msg_x', [],
    );
    assert.equal('usage' in body, true, 'an explicit zero must survive as a report');
    assert.equal(body.usage.input_tokens, 0);
  });
});

describe('item 15 — the exits that were already correct (controls)', () => {
  it('Gemini omits usageMetadata for a silent upstream', () => {
    // Not our change — the reference the fix was modelled on. If this regresses,
    // the argument "absence is the established shape here" stops holding.
    const out = openAIToGemini({ choices: [{ message: { role: 'assistant', content: 'hi' } }] }, 'm');
    assert.equal(out.usageMetadata, undefined);
  });

  it('Gemini reports real usage', () => {
    const out = openAIToGemini(
      {
        choices: [{ message: { role: 'assistant', content: 'hi' } }],
        usage: { prompt_tokens: 111, completion_tokens: 22, total_tokens: 133 },
      },
      'm',
    );
    assert.deepEqual(out.usageMetadata, {
      promptTokenCount: 111,
      candidatesTokenCount: 22,
      totalTokenCount: 133,
    });
  });
});
