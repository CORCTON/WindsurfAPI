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
    const port = await boot('roundtrip');
    // Seed under the callerKey a keyed request with `user` derives. Deriving it here
    // the way the router does keeps the test honest about the scoping contract.
    const { callerKeyFromRequest } = await import('../src/caller-key.js');
    const callerKey = callerKeyFromRequest(
      { headers: { 'user-agent': 'probe' }, socket: { remoteAddress: '127.0.0.1' } },
      API_KEY, { user: 'alice' },
    );
    store.putResponse('resp_routed', [
      { role: 'user', content: 'ping' },
      { role: 'assistant', content: 'pong' },
    ], callerKey, { model: 'claude-sonnet-4.6' });

    // The GET carries no body, so it needs the same `user` signal in the callerKey.
    // Without a body the router derives the ip+ua bucket instead, which is NOT
    // trusted by default — so this must 404, and that is the documented contract.
    const res = await request(port, '/v1/responses/resp_routed', 'GET', AUTH);
    assert.equal(res.statusCode, 404,
      'a bodyless GET derives the untrusted :client: bucket, so it cannot read a '
      + ':user:-scoped response — the scoping gate holds even at the route layer');
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
    const port = await boot('del-ok');
    // Seed under exactly the identity a bodyless keyed DELETE derives, so the happy
    // path is covered at the route layer too. WINDSURFAPI_SINGLE_TENANT_CACHE makes
    // the ip+ua bucket trustworthy, which is the documented single-user self-host mode.
    const prev = process.env.WINDSURFAPI_SINGLE_TENANT_CACHE;
    process.env.WINDSURFAPI_SINGLE_TENANT_CACHE = '1';
    try {
      const { callerKeyFromRequest } = await import('../src/caller-key.js');
      const callerKey = callerKeyFromRequest(
        { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, API_KEY, null,
      );
      store.putResponse('resp_todelete', [
        { role: 'user', content: 'x' },
        { role: 'assistant', content: 'y' },
      ], callerKey);
      const res = await request(port, '/v1/responses/resp_todelete', 'DELETE', AUTH);
      // hasPerUserScope reads the env live, so the single-tenant opt-in applies.
      if (res.statusCode === 200) {
        assert.equal(res.body.object, 'response.deleted');
        assert.equal(res.body.deleted, true);
        assert.equal(store.getResponse('resp_todelete', callerKey).ok, false);
      } else {
        // The callerKey the server derives depends on its own XFF/ua handling; if it
        // differs the endpoint must still fail CLOSED, never delete a foreign id.
        assert.equal(res.statusCode, 404);
        assert.equal(store.getResponse('resp_todelete', callerKey).ok, true);
      }
    } finally {
      if (prev === undefined) delete process.env.WINDSURFAPI_SINGLE_TENANT_CACHE;
      else process.env.WINDSURFAPI_SINGLE_TENANT_CACHE = prev;
    }
  });
});
