// The /v1/responses SSE stream must close with the `data: [DONE]` sentinel.
//
// WHY THIS FILE EXISTS. The Responses frontend translates a chat stream into OpenAI
// Responses events and ends the socket with `realRes.end()` and nothing else — no
// `[DONE]`. A direct Responses client does not need one: the API carries its outcome
// on response.completed / .incomplete / .failed, and those events are what this
// frontend emits. But the relays sitting in front of it are OpenAI-shaped and scan for
// `[DONE]` as "the stream ended cleanly". Measured pre-fix: new-api drops the terminal
// event of a stream that lacks the sentinel — and on this route the terminal event is
// the ONLY carrier of the usage block (the translator opts into include_usage for
// exactly that reason), so the relay's billing row silently came out empty. The chat
// exit has always written `[DONE]` on both its success and its post-error path
// (chat.js:6052, chat.js:543); this one never did, which split the two routes' wire
// shape for the identical upstream.
//
// Each assertion below drives the real handler with a synthetic upstream, exactly like
// terminal-event-guard.test.js does — the defect lives on the wire, so a test that
// poked the translator's write path would not have proven it. The sentinel must come
// AFTER the terminal event (never before the socket closes without one), so a client
// that only settled the request when it saw the outcome still gets the outcome first.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleResponses } from '../src/handlers/responses.js';

function fakeRes() {
  const listeners = new Map();
  return {
    body: '', writableEnded: false,
    write(c) { this.body += String(c); return true; },
    end(c) { if (c) this.write(c); this.writableEnded = true; },
    on(e, cb) {
      if (!listeners.has(e)) listeners.set(e, []);
      listeners.get(e).push(cb);
      return this;
    },
    once() { return this; },
    fire(e) { for (const cb of listeners.get(e) || []) cb(); },
    setHeader() {}, writeHead() { return this; }, flushHeaders() {},
  };
}
const chunk = (o) => `data: ${JSON.stringify(o)}\n\n`;

async function runResponses(frames) {
  const r = await handleResponses(
    { model: 'gpt-5.2', stream: true, input: 'hi' },
    {
      async handleChatCompletions() {
        return { status: 200, stream: true, async handler(res) { for (const f of frames) res.write(f); res.end(); } };
      },
      context: { callerKey: 'api:rdsent:user:t' },
    },
  );
  const res = fakeRes();
  await r.handler(res);
  return res.body;
}

// The terminal event is `response.completed` / `response.incomplete` / `response.failed`.
function lastEvent(body) {
  const events = body.trim().split('\n\n').filter(Boolean)
    .map(f => f.split('\n').find(x => x.startsWith('event: '))?.slice(7)).filter(Boolean);
  return events[events.length - 1];
}

const CLEAN = [
  chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'hi' } }] }),
  chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  'data: [DONE]\n\n',
];
// A legitimate truncation still closes as a terminal event ('incomplete') — the
// sentinel must not be reserved for 'completed' only.
const LENGTH = [
  chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'hi' } }] }),
  chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }),
  'data: [DONE]\n\n',
];
// An in-band upstream error still closes the stream — a relay scanning for `[DONE]`
// must not hang forever waiting for a sentinel a failed stream never sends.
const ERROR = [
  chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'hi' } }] }),
  chunk({ error: { type: 'upstream_error', message: 'boom', status: 502 } }),
];

describe('responses stream ends with the [DONE] sentinel', () => {
  it('appends data: [DONE] after the terminal event on a clean stream', async () => {
    const body = await runResponses(CLEAN);
    assert.equal(body.trimEnd().endsWith('data: [DONE]'), true,
      `the stream must close with the sentinel. Tail: ${JSON.stringify(body.slice(-160))}`);
    assert.equal(body.trimEnd().split('\n\n').pop(), 'data: [DONE]',
      'nothing may follow the sentinel — it must be the last frame');
  });

  it('emits the sentinel after the terminal event, never before it', async () => {
    const body = await runResponses(CLEAN);
    assert.ok(body.indexOf('response.completed') < body.indexOf('data: [DONE]'),
      'the outcome must precede the sentinel, or a client that only reads the first '
      + 'terminal signal would settle the request before its completion');
  });

  it('closes with the sentinel on a truncated stream (response.incomplete)', async () => {
    const body = await runResponses(LENGTH);
    assert.equal(lastEvent(body), 'response.incomplete', 'the truncated turn still reports its terminal event');
    assert.equal(body.trimEnd().endsWith('data: [DONE]'), true,
      `tail: ${JSON.stringify(body.slice(-160))}`);
  });

  it('does NOT send the sentinel after response.failed — a relay must not read a failure as clean', async () => {
    // Adversarial review (2026-08-09) caught the original version of this test: it
    // asserted the sentinel WAS sent after response.failed, i.e. it enshrined the
    // defect. `[DONE]` is what a relay scans for as "stream ended cleanly" — writing
    // it on `response.failed`/`response.incomplete` makes the failure invisible on the
    // wire, which is the exact hole the sentinel fix exists to plug, on the failure
    // side. chat.js's post-error path writes an explicit error chunk before `[DONE]`;
    // here the failure is already in the terminal event, so no sentinel.
    const body = await runResponses(ERROR);
    assert.equal(lastEvent(body), 'response.failed', 'the failure is still the last event');
    assert.equal(body.trimEnd().endsWith('data: [DONE]'), false,
      `a failed stream must not claim a clean ending. Tail: ` + JSON.stringify(body.slice(-160)));
  });

  it('does NOT send the sentinel when the client vanished mid-answer', async () => {
    // The one path that must stay sentinel-free. `[DONE]` is what a relay reads as
    // "whole"; a client that disconnected never reaches captureRes.end(), so no
    // terminal event goes out at all, and writing the sentinel there would dress a
    // half turn in an ending it never earned. Same reasoning finish() applies when it
    // refuses to report an absent finish_reason as 'completed'.
    const res = fakeRes();
    const r = await handleResponses(
      { model: 'gpt-5.2', stream: true, input: 'hi' },
      {
        async handleChatCompletions() {
          return {
            status: 200, stream: true,
            async handler(cres) {
              cres.write(chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'half' } }] }));
              res.fire('close');       // the client goes away
            },
          };
        },
        context: { callerKey: 'api:rdsent:user:disc' },
      },
    );
    // An aborted socket still reports writableEnded === false here — the event loop
    // just never lets end() run. That is precisely the shape the `finished` gate
    // protects against, so the fake must keep it: pre-setting writableEnded would
    // short-circuit both the gate and the bug it guards.
    await r.handler(res);
    assert.equal(res.body.includes('[DONE]'), false,
      `a half-delivered turn must not be sealed with the sentinel. Tail: ${JSON.stringify(res.body.slice(-160))}`);
    assert.ok(res.body.includes('"delta":"half"'), 'the partial content it did deliver is still there');
  });

  it('CONTROL: content and the terminal event still stream when no sentinel was requested', async () => {
    // The sentinel must not suppress anything — a stream that never had it on its tail
    // must be byte-identical to before except for the appended frame.
    const body = await runResponses(CLEAN);
    assert.ok(body.includes('"text":"hi"'), 'the text delta still streams');
    assert.equal(lastEvent(body), 'response.completed', 'a clean stream still completes');
  });
});
