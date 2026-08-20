// Pins the client-disconnect AbortSignal on every chat-shaped POST route.
//
// Chat and completions already bound an AbortController at the route.
// messages / gemini / responses streamed abort via captureRes, but their
// non-stream await of handleChatCompletions had no signal — hanging up left
// the upstream running. bindClientAbort is the shared seam.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { bindClientAbort } from '../src/server.js';

function fakeRes({ writableEnded = false } = {}) {
  const res = new EventEmitter();
  res.writableEnded = writableEnded;
  return res;
}

describe('bindClientAbort', () => {
  it('aborts when the client hangs up before the response ends', () => {
    const res = fakeRes();
    const ac = bindClientAbort(res);
    assert.equal(ac.signal.aborted, false);
    res.emit('close');
    assert.equal(ac.signal.aborted, true);
  });

  it('does not abort on the normal end-of-response close', () => {
    const res = fakeRes({ writableEnded: true });
    const ac = bindClientAbort(res);
    res.emit('close');
    assert.equal(ac.signal.aborted, false);
  });
});

describe('every chat-shaped POST route threads bindClientAbort into context.signal', () => {
  const src = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

  function routeBlock(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `missing route marker: ${marker}`);
    const next = src.indexOf('\n  if (', start + marker.length);
    return src.slice(start, next > start ? next : src.length);
  }

  const routes = [
    { name: 'chat/completions', marker: "if (path === '/v1/chat/completions' && method === 'POST')" },
    { name: 'completions', marker: "if (path === '/v1/completions' && method === 'POST')" },
    { name: 'responses', marker: "if (path === '/v1/responses' && method === 'POST')" },
    { name: 'messages', marker: "if (path === '/v1/messages' && method === 'POST')" },
    { name: 'gemini', marker: 'if (method === \'POST\' && /\\/models\\/[^:/]+:(generateContent|streamGenerateContent)$/.test(path))' },
  ];

  for (const { name, marker } of routes) {
    it(`${name} binds bindClientAbort and passes signal`, () => {
      const block = routeBlock(marker);
      assert.match(block, /bindClientAbort\(res\)/, `${name} must call bindClientAbort`);
      assert.match(block, /signal:\s*abortController\.signal/, `${name} must pass abortController.signal`);
    });
  }
});
