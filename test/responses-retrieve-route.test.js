// GET / DELETE /v1/responses/{id} through the REAL router.
//
// The unit tests next door call the handlers directly, which proves the scoping
// logic but never exercises the part of server.js that decides which URL reaches
// which handler. That is exactly the "tested the logic, never tested the assembly"
// gap the audit ledger calls out (§鉴权与暴露面): ten auth suites imported the
// dashboard handler directly and none of them covered the routing layer, where the
// real bypasses lived. So these cases go over HTTP.

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { config } from '../src/config.js';
import { configureBindHost, addAccountByKey, removeAccount, getAccountList, _resetLockoutForTests } from '../src/auth.js';
import { startServer } from '../src/server.js';
import { setRuntimeApiKey } from '../src/runtime-config.js';
import * as store from '../src/response-store.js';

const originalApiKey = config.apiKey;
const originalHost = config.host;
const originalPort = config.port;
let runningServer = null;
const createdAccounts = new Set();

const API_KEY = 'test-key-resp-route';

afterEach(async () => {
  if (runningServer) {
    await new Promise(resolve => runningServer.close(resolve));
    runningServer = null;
  }
  // Only ids this file created — never iterate the account list to delete, which
  // once wiped a user's real accounts irrecoverably.
  for (const id of createdAccounts) { removeAccount(id); createdAccounts.delete(id); }
  for (const a of getAccountList()) {
    if (typeof a.label === 'string' && a.label.startsWith('resp-route-')) removeAccount(a.id);
  }
  _resetLockoutForTests();
  setRuntimeApiKey('');
  config.apiKey = originalApiKey;
  config.host = originalHost;
  config.port = originalPort;
  configureBindHost('127.0.0.1');
  store.resetResponseStore();
});

function waitListening(server) {
  return new Promise(resolve => {
    if (server.address()) return resolve();
    server.once('listening', resolve);
  });
}

function request(port, path, method, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(raw); } catch { /* non-JSON */ }
        resolve({ statusCode: res.statusCode, headers: res.headers, body, raw });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function boot(label) {
  _resetLockoutForTests();
  config.apiKey = API_KEY;
  setRuntimeApiKey(API_KEY);
  config.host = '127.0.0.1';
  config.port = 0;
  const acct = addAccountByKey('fake-key-resp-route', `resp-route-${label}`);
  if (acct?.id) createdAccounts.add(acct.id);
  runningServer = startServer();
  await waitListening(runningServer);
  return runningServer.address().port;
}

// The callerKey the router derives for a keyed request with no body: api:<hash of
// the API key> plus a `user:` sub-key when the client sends one. These tests seed
// the store under the same shape the router will derive, via a real chained POST
// where possible and directly otherwise.
const AUTH = { authorization: `Bearer ${API_KEY}` };

describe('GET /v1/responses/{id} routing', () => {
  it('requires the API key like every other /v1 endpoint', async () => {
    const port = await boot('auth');
    const res = await request(port, '/v1/responses/resp_whatever', 'GET');
    assert.equal(res.statusCode, 401, 'the route must sit BEHIND the API-key gate');
  });

  it('404s an unknown id with an OpenAI-shaped error and a request id', async () => {
    const port = await boot('unknown');
    const res = await request(port, '/v1/responses/resp_doesnotexist', 'GET', AUTH);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'response_not_found');
    assert.match(res.headers['x-request-id'], /^req_/);
    assert.equal(res.body.request_id, res.headers['x-request-id']);
  });

  it('rejects a traversal-shaped id instead of passing it to the store', async () => {
    // `path` is never URL-decoded in this router, so `%2e%2e` stays literal and the
    // strict id charset rejects it. A loose `slice` with no shape check would hand
    // the whole suffix to the store lookup.
    const port = await boot('traversal');
    // A raw space is rejected by Node's HTTP client itself (ERR_UNESCAPED_CHARACTERS)
    // and never reaches the server, so it is not a useful case here — these are the
    // shapes that DO arrive on the wire.
    for (const bad of ['..%2f..%2fetc%2fpasswd', '%2e%2e%2fetc%2fpasswd', 'resp_a/extra',
      'resp_a%00', '....//resp_a']) {
      const res = await request(port, `/v1/responses/${bad}`, 'GET', AUTH);
      assert.equal(res.statusCode, 404, `${bad} must not resolve`);
      // Falls through to the router's generic 404, not the endpoint's — proof the id
      // never reached the store lookup at all.
      assert.notEqual(res.body?.error?.code, 'response_not_found',
        `${bad} must be rejected by the id shape check, not handed to the store`);
    }
  });

  it('strips a query string and looks up the bare id', async () => {
    // The router splits the query off before matching, so `resp_a?x=1` resolves as the
    // valid id `resp_a` and reaches the store — reported as this endpoint's own
    // response_not_found rather than the generic router 404.
    const port = await boot('query');
    const res = await request(port, '/v1/responses/resp_a?x=1', 'GET', AUTH);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'response_not_found');
  });

  it('does not hijack POST /v1/responses', async () => {
    // The prefix match must not shadow the canonical POST route.
    const port = await boot('post');
    const res = await request(port, '/v1/responses', 'GET', AUTH);
    assert.notEqual(res.statusCode, 200);
  });

  it('retrieves a response the same caller stored, end to end', async () => {
    // CORRECTED. This case previously asserted the OPPOSITE — that a bodyless GET
    // must 404 — and called that "the documented contract". It was not a contract,
    // it was the bug: it made both endpoints dead on arrival for EVERY client shape.
    // A client that can chain sends user / prompt_cache_key / safety_identifier, so
    // its POST callerKey carries `:user:<hash>` while a bodyless GET derived
    // `:client:<ip+ua>` — always a miss. A client sending none of them derived a
    // matching key but failed hasPerUserScope — also a miss. Freezing that into an
    // assertion is how the endpoint shipped unusable and stayed green.
    const port = await boot('roundtrip');
    const { callerKeyFromRequest } = await import('../src/caller-key.js');
    // Derive exactly what the ROUTER will derive for the GET below: same request
    // shape, same identity vocabulary, read through the same extraction path.
    const callerKey = callerKeyFromRequest(
      { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
      API_KEY, { prompt_cache_key: 'conv-1' },
    );
    store.putResponse('resp_routed', [
      { role: 'user', content: 'ping' },
      { role: 'assistant', content: 'pong' },
    ], callerKey, { model: 'claude-sonnet-4.6' });

    const res = await request(port, '/v1/responses/resp_routed?prompt_cache_key=conv-1', 'GET', AUTH);
    assert.equal(res.statusCode, 200,
      'a caller must be able to retrieve its OWN stored response — otherwise the '
      + 'endpoint is unusable by every client that can chain');
    assert.equal(res.body.object, 'response');
    assert.equal(res.body.output_text, 'pong');
  });

  it('a foreign identity param still cannot read it', async () => {
    // The flip side: making the endpoint usable must not weaken the scope gate.
    const port = await boot('foreign');
    const { callerKeyFromRequest } = await import('../src/caller-key.js');
    const mine = callerKeyFromRequest(
      { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
      API_KEY, { prompt_cache_key: 'conv-mine' },
    );
    store.putResponse('resp_mine', [
      { role: 'user', content: 'secret question' },
      { role: 'assistant', content: 'secret answer' },
    ], mine, { model: 'm' });

    const res = await request(port, '/v1/responses/resp_mine?prompt_cache_key=conv-theirs', 'GET', AUTH);
    assert.equal(res.statusCode, 404, 'another caller\'s scope must not resolve');
    assert.equal(/secret answer/.test(res.raw), false, 'and must leak no content');
  });

  it('still 404s with no identity param at all', async () => {
    // Unchanged behaviour for a caller that supplies nothing: the guessed
    // `:client:` bucket is not a trustworthy scope in multi-tenant mode.
    const port = await boot('noparam');
    const res = await request(port, '/v1/responses/resp_whatever', 'GET', AUTH);
    assert.equal(res.statusCode, 404);
  });
});

describe('DELETE /v1/responses/{id} routing', () => {
  it('requires the API key', async () => {
    const port = await boot('del-auth');
    const res = await request(port, '/v1/responses/resp_x', 'DELETE');
    assert.equal(res.statusCode, 401);
  });

  it('404s an unknown id rather than reporting a phantom deletion', async () => {
    const port = await boot('del-unknown');
    const res = await request(port, '/v1/responses/resp_ghost', 'DELETE', AUTH);
    assert.equal(res.statusCode, 404);
    assert.notEqual(res.body?.deleted, true);
  });

  it('deletes a response owned by the derived caller identity', async () => {
    // REWRITTEN. The previous version wrapped its assertions in
    // `if (res.statusCode === 200) {...} else { assert 404 }` and set
    // WINDSURFAPI_SINGLE_TENANT_CACHE at runtime — but chat.js freezes that env into
    // a module-level const at IMPORT time, so the flag never took effect and the fork
    // ALWAYS took the 404 branch. The happy path was never executed: mutating the
    // endpoint to `if (true) return responseNotFound(...)` — i.e. DELETE completely
    // dead — left this suite 11/11 green. A test with a conditional assertion proves
    // whichever branch it happens to take, which is the one thing a guard must not do.
    //
    // Use an explicit identity header instead, so the happy path is unconditional and
    // does not depend on import-time env state.
    const port = await boot('del-ok');
    const { callerKeyFromRequest } = await import('../src/caller-key.js');
    const callerKey = callerKeyFromRequest(
      { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, API_KEY, { user: 'deleter' },
    );
    store.putResponse('resp_todelete', [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: 'y' },
    ], callerKey, { model: 'm' });

    const res = await request(port, '/v1/responses/resp_todelete', 'DELETE',
      { ...AUTH, 'x-response-user': 'deleter' });
    assert.equal(res.statusCode, 200, 'the owner must be able to delete its own response');
    assert.equal(res.body.object, 'response.deleted');
    assert.equal(res.body.deleted, true);
    assert.equal(store.getResponse('resp_todelete', callerKey).ok, false,
      'and it must really be gone from the store');
  });
});

// Real HTTP for the header identity channel.
//
// This exists because the contract suite guarded it with `assert.match(src,
// /x-response-/)` — a source grep, which matches any surviving mention of the string.
// Measured: dropping the underscore→hyphen conversion in the header-name derivation
// left prompt_cache_key / safety_identifier / conversation_id / session_id all
// returning 404 while every retrieval test stayed green. Only a request that actually
// SENDS the header can tell "works" from "the string is still in the file".
describe('every documented identity signal resolves over real HTTP', () => {
  // header name ↔ the POST body shape that must derive the SAME callerKey
  const SIGNALS = [
    ['x-response-user', { user: 'alice@example.com' }],
    ['x-response-prompt-cache-key', { prompt_cache_key: 'conv-1' }],
    ['x-response-safety-identifier', { safety_identifier: 'sid-1' }],
    ['x-response-conversation', { conversation: 'cv-1' }],
    ['x-response-conversation-id', { metadata: { conversation_id: 'mc-1' } }],
    ['x-response-session-id', { metadata: { session_id: 'ms-1' } }],
  ];

  for (const [header, body] of SIGNALS) {
    it(`${header} retrieves the caller's own response`, async () => {
      const port = await boot(`hdr-${header.slice(12)}`);
      const { callerKeyFromRequest } = await import('../src/caller-key.js');
      // Derive with the same request shape the server will see for the GET below.
      const callerKey = callerKeyFromRequest(
        { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, API_KEY, body,
      );
      const id = `resp_${header.replace(/[^a-z]/g, '')}`;
      store.putResponse(id, [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'the answer' },
      ], callerKey, { model: 'm' });

      const value = body.metadata
        ? Object.values(body.metadata)[0]
        : Object.values(body)[0];
      const res = await request(port, `/v1/responses/${id}`, 'GET', { ...AUTH, [header]: value });
      assert.equal(res.statusCode, 200,
        `${header} must reproduce the POST-side scope — otherwise a client using this `
        + 'signal cannot read the response it just created');
      assert.equal(res.body.output_text, 'the answer');
    });
  }

  // The query fallback must accept BOTH spellings of a multi-word signal.
  //
  // The READMEs list the six signals with the header spelling (`conversation-id`,
  // `session-id`) and then state that the same names work as query parameters. They
  // did not: the hyphen substitution in server.js's `pick()` was applied to the
  // HEADER name only, while the query lookup used the raw underscore key. So a
  // client that followed the documented vocabulary literally — `?conversation-id=` —
  // got a 404 with no hint why, on the very channel documented as the fallback for
  // clients that cannot set headers.
  for (const [queryName, body] of [
    ['conversation_id', { metadata: { conversation_id: 'q-underscore' } }],
    ['conversation-id', { metadata: { conversation_id: 'q-hyphen' } }],
    ['session_id', { metadata: { session_id: 'q-us-sess' } }],
    ['session-id', { metadata: { session_id: 'q-hy-sess' } }],
  ]) {
    it(`?${queryName}= resolves the caller's own response`, async () => {
      const port = await boot(`q-${queryName}`);
      const { callerKeyFromRequest } = await import('../src/caller-key.js');
      const callerKey = callerKeyFromRequest(
        { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, API_KEY, body,
      );
      const id = `resp_q_${queryName.replace(/[^a-z]/g, '')}_${Object.values(body.metadata)[0]}`;
      store.putResponse(id, [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'the answer' },
      ], callerKey, { model: 'm' });

      const value = Object.values(body.metadata)[0];
      const res = await request(port, `/v1/responses/${id}?${queryName}=${value}`, 'GET', AUTH);
      assert.equal(res.statusCode, 200,
        `?${queryName}= is a documented spelling of this scope signal and must resolve it`);
      assert.equal(res.body.output_text, 'the answer');
    });
  }

  it('a wrong query value still 404s on either spelling', async () => {
    const port = await boot('q-wrong');
    const { callerKeyFromRequest } = await import('../src/caller-key.js');
    const mine = callerKeyFromRequest(
      { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, API_KEY,
      { metadata: { conversation_id: 'mine' } },
    );
    store.putResponse('resp_qscope', [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'secret answer' },
    ], mine, { model: 'm' });

    for (const spelling of ['conversation_id', 'conversation-id']) {
      const res = await request(port, `/v1/responses/resp_qscope?${spelling}=theirs`, 'GET', AUTH);
      assert.equal(res.statusCode, 404,
        `accepting the ${spelling} spelling must not weaken the scope gate`);
    }
  });

  it('a wrong header value still 404s (the scope gate is not weakened)', async () => {
    const port = await boot('hdr-wrong');
    const { callerKeyFromRequest } = await import('../src/caller-key.js');
    const mine = callerKeyFromRequest(
      { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, API_KEY, { prompt_cache_key: 'mine' },
    );
    store.putResponse('resp_hdrscope', [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'secret answer' },
    ], mine, { model: 'm' });
    const res = await request(port, '/v1/responses/resp_hdrscope', 'GET',
      { ...AUTH, 'x-response-prompt-cache-key': 'theirs' });
    assert.equal(res.statusCode, 404);
    assert.equal(/secret answer/.test(res.raw), false);
  });
});
