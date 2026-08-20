import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleChatCompletions } from '../src/handlers/chat.js';

// O7 (ROADMAP-GATE): logprobs / top_logprobs are accepted by the OpenAI
// request schema but the Devin/Windsurf upstream never returns token
// log-probabilities — they used to be SILENTLY dropped (client thinks
// choices[].logprobs will be populated). We now reject a requested
// (non-default) value with a 400 invalid_request_error instead of faking
// success. Neutral defaults still pass so ordinary clients aren't broken.

const baseReq = (extra) => ({
  model: 'claude-sonnet-4.6',
  messages: [{ role: 'user', content: 'hi' }],
  ...extra,
});

const rejectedFor = (result, param) =>
  result?.status === 400
  && result?.body?.error?.type === 'invalid_request_error'
  && result?.body?.error?.param === param;

// Distinguish "rejected by the logprobs gate" from "reached routing and failed
// for lack of a real account" — the latter is any non-400 or a 400 whose param
// is not one of our logprobs params.
const passedLogprobsGate = (result) => {
  if (result?.status !== 400) return true;
  const p = result?.body?.error?.param;
  return !['logprobs', 'top_logprobs'].includes(p);
};

describe('O7 unsupported logprobs rejected', () => {
  it('rejects logprobs:true with 400 param=logprobs', async () => {
    const r = await handleChatCompletions(baseReq({ logprobs: true }));
    assert.ok(rejectedFor(r, 'logprobs'), JSON.stringify(r?.body));
    assert.match(r.body.error.message, /logprobs/);
  });

  it('rejects a finite top_logprobs > 0', async () => {
    const r = await handleChatCompletions(baseReq({ top_logprobs: 5 }));
    assert.ok(rejectedFor(r, 'top_logprobs'), JSON.stringify(r?.body));
    assert.match(r.body.error.message, /top_logprobs/);
  });

  it('rejects integer logprobs (Completions-style 1..5), not only boolean true', async () => {
    const r = await handleChatCompletions(baseReq({ logprobs: 5 }));
    assert.ok(rejectedFor(r, 'logprobs'), JSON.stringify(r?.body));
  });

  it('rejects string top_logprobs', async () => {
    const r = await handleChatCompletions(baseReq({ top_logprobs: '5' }));
    assert.ok(rejectedFor(r, 'top_logprobs'), JSON.stringify(r?.body));
  });

  it('rejects stream:true + logprobs:true with a JSON 400 (not SSE)', async () => {
    const r = await handleChatCompletions(baseReq({ stream: true, logprobs: true }));
    assert.ok(rejectedFor(r, 'logprobs'), JSON.stringify(r?.body));
    assert.ok(!r.stream);
  });

  it('prefers param=logprobs when both logprobs:true and top_logprobs>0', async () => {
    const r = await handleChatCompletions(baseReq({ logprobs: true, top_logprobs: 2 }));
    assert.ok(rejectedFor(r, 'logprobs'), JSON.stringify(r?.body));
  });

  it('allows omitted / false / top_logprobs:0 — passes the logprobs gate', async () => {
    const omitted = await handleChatCompletions(baseReq({}));
    assert.ok(passedLogprobsGate(omitted), `omitted must not be rejected as logprobs: ${JSON.stringify(omitted?.body)}`);

    const falsy = await handleChatCompletions(baseReq({ logprobs: false, top_logprobs: 0 }));
    assert.ok(passedLogprobsGate(falsy), `neutral defaults must not be rejected as logprobs: ${JSON.stringify(falsy?.body)}`);
  });

  it('allows a request with only temperature/top_p (no logprobs params)', async () => {
    const r = await handleChatCompletions(baseReq({ temperature: 0.7, top_p: 0.9 }));
    assert.ok(passedLogprobsGate(r), JSON.stringify(r?.body));
  });
});
