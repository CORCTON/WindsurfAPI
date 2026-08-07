// `Retry-After` must survive every egress route, on the NON-STREAM branch too.
//
// WHY THIS FILE EXISTS. Each route builds its own header set and then either spreads
// `result.headers` into writeHead (stream) or does not (non-stream). Measured on
// a7326da by reading the router: the stream branches at server.js:835 (messages) and
// :881 (gemini) both spread it; their non-stream siblings set only the route's own
// vocabulary headers, while /v1/responses had always forwarded them. So a non-stream
// 429 reached an Anthropic or Gemini SDK with no backoff hint at all, and the handler
// had computed one — `chat.js:3011` returns `headers: {'Retry-After': …}` with the
// same clamped value it puts in the body.
//
// This goes over HTTP through the REAL router for the reason
// responses-retrieve-route.test.js states: the handlers were already covered, and the
// defect lived in the assembly. A unit test on handleMessages would have passed
// throughout — it returns the header correctly; the router dropped it.
//
// The 429 is induced the production way (rate-limit every pooled account, then ask
// for a connect selector) rather than by injecting a fake handler, so the assertion
// covers the path an operator actually hits.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { config } from '../src/config.js';
import {
  configureBindHost, addAccountByKey, removeAccount, getAccountList,
  markRateLimited, _resetLockoutForTests,
} from '../src/auth.js';
import { startServer } from '../src/server.js';
import { setRuntimeApiKey } from '../src/runtime-config.js';

const API_KEY = 'test-key-retry-after';
const LABEL_PREFIX = 'retry-after-';
const originals = { apiKey: config.apiKey, host: config.host, port: config.port };
let runningServer = null;
const created = new Set();
let prevConnect;

afterEach(async () => {
  if (runningServer) {
    await new Promise(r => runningServer.close(r));
    runningServer = null;
  }
  // Only ids this file created — never iterate the whole account list to delete.
  for (const id of created) { removeAccount(id); created.delete(id); }
  for (const a of getAccountList()) {
    if (typeof a.label === 'string' && a.label.startsWith(LABEL_PREFIX)) removeAccount(a.id);
  }
  _resetLockoutForTests();
  setRuntimeApiKey('');
  config.apiKey = originals.apiKey;
  config.host = originals.host;
  config.port = originals.port;
  configureBindHost('127.0.0.1');
  if (prevConnect === undefined) delete process.env.DEVIN_CONNECT;
  else process.env.DEVIN_CONNECT = prevConnect;
});

const waitListening = (s) => new Promise(r => (s.address() ? r() : s.once('listening', r)));

function post(port, path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: '127.0.0.1', port, path, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(raw); } catch { /* non-JSON */ }
        resolve({ statusCode: res.statusCode, headers: res.headers, body, raw });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

// Boot with the connect backend on and EVERY pooled account rate-limited, which is
// what makes chat.js's pool-exhausted arm (`rl.allLimited`) return 429 + Retry-After.
async function bootExhausted(label) {
  _resetLockoutForTests();
  prevConnect = process.env.DEVIN_CONNECT;
  process.env.DEVIN_CONNECT = '1';
  config.apiKey = API_KEY;
  setRuntimeApiKey(API_KEY);
  config.host = '127.0.0.1';
  config.port = 0;
  const key = `fake-key-${LABEL_PREFIX}${label}`;
  const acct = addAccountByKey(key, `${LABEL_PREFIX}${label}`);
  if (acct?.id) created.add(acct.id);
  markRateLimited(key, 10 * 60 * 1000);
  runningServer = startServer();
  await waitListening(runningServer);
  return runningServer.address().port;
}

const AUTH = { authorization: `Bearer ${API_KEY}` };
// swe-1-6-slow is the free-reachable connect selector, so the request gets far
// enough to reach the pool-exhausted check rather than being rejected earlier.
const MODEL = 'swe-1-6-slow';

// A non-stream 429 whose Retry-After the route must forward. Skips (rather than
// fails) if the pool-exhausted arm was not reached — a silent 200 here would make
// every assertion below vacuous, so the precondition is asserted explicitly.
function assertRateLimited(res, route) {
  assert.equal(res.statusCode, 429,
    `${route}: precondition — an all-accounts-rate-limited pool must yield 429, got `
    + `${res.statusCode}. Without it the Retry-After assertion proves nothing. Body: ${res.raw.slice(0, 200)}`);
}

describe('Retry-After survives the non-stream branch of every route', () => {
  it('/v1/messages forwards it', async () => {
    const port = await bootExhausted('messages');
    const res = await post(port, '/v1/messages', {
      model: MODEL, max_tokens: 16, stream: false, messages: [{ role: 'user', content: 'hi' }],
    }, AUTH);
    assertRateLimited(res, '/v1/messages');
    assert.ok(res.headers['retry-after'],
      'the Anthropic SDK reads Retry-After to schedule its automatic retry; the handler '
      + 'computed one and the non-stream branch used to drop it');
    assert.match(res.headers['retry-after'], /^\d+$/, 'whole seconds, the header unit');
  });

  it('/v1beta gemini forwards it', async () => {
    const port = await bootExhausted('gemini');
    const res = await post(port, `/v1beta/models/${MODEL}:generateContent`, {
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    }, AUTH);
    assertRateLimited(res, '/v1beta');
    assert.ok(res.headers['retry-after'], 'same divergence as the Anthropic route');
  });

  it('/v1/responses forwards it — the route that was already correct', async () => {
    // The reference. If this ever stops forwarding, the other two assertions lose
    // the thing they were written against.
    const port = await bootExhausted('responses');
    const res = await post(port, '/v1/responses', { model: MODEL, input: 'hi', stream: false }, AUTH);
    assertRateLimited(res, '/v1/responses');
    assert.ok(res.headers['retry-after'], 'responses forwarded result.headers all along');
  });

  it('/v1/chat/completions forwards it', async () => {
    const port = await bootExhausted('chat');
    const res = await post(port, '/v1/chat/completions', {
      model: MODEL, stream: false, messages: [{ role: 'user', content: 'hi' }],
    }, AUTH);
    assertRateLimited(res, '/v1/chat/completions');
    assert.ok(res.headers['retry-after'], 'the OpenAI-native route');
  });

  it('the route\'s own vocabulary headers still win over a handler header', async () => {
    // The forwarding loop must not let a handler clobber the route contract. The
    // Anthropic route always sets anthropic-version; assert it survives alongside
    // the forwarded Retry-After, so "forward everything" did not become
    // "let the handler overwrite the route".
    const port = await bootExhausted('collision');
    const res = await post(port, '/v1/messages', {
      model: MODEL, max_tokens: 16, stream: false, messages: [{ role: 'user', content: 'hi' }],
    }, AUTH);
    assertRateLimited(res, '/v1/messages');
    assert.ok(res.headers['anthropic-version'], 'the route vocabulary is still present');
    assert.ok(res.headers['request-id'], 'and so is the request id');
    assert.ok(res.headers['retry-after'], 'together with the forwarded header');
  });
});
