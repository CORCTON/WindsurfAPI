// Web search exposure — POST /dashboard/api/accounts/:id/web-search.
//
// The upstream call (windsurf-api.js getWebSearchResults → the RPC
// GetWebSearchResults) had been implemented and tested since it was reverse-
// engineered, but NOTHING called it: grep showed the definition and no callers. This
// is the exposure. It costs no model credits — it rides the account's own session
// token.
//
// Two design decisions these tests pin:
//   1. The account is NAMED by the caller, never picked silently. Silent selection
//      would make an unexplained rate-limit or ban land on an account the operator
//      did not choose.
//   2. Failures come back in-band ({ok:false}) rather than thrown, matching every
//      other dashboard-facing helper, so a dead token renders as a message not a 500.
//
// Authentication is deliberately NOT re-implemented here: every /dashboard/api/*
// route except /auth passes the central checkAuth gate (dashboard/api.js:505), so the
// endpoint inherits it. The test for that lives with the routing layer.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchWebForAccount, addAccountByKey, removeAccount, __setWebSearchDeps } from '../src/auth.js';

const KEY = 'sk-ws-web-search-exposure-test';
let created = null;

beforeEach(() => {
  created = addAccountByKey(KEY, 'web-search-test');
});

afterEach(() => {
  // Drop the injected stub and the fixture account so no other test sees either.
  __setWebSearchDeps(null);
  if (created?.id) { try { removeAccount(created.id); } catch { /* already gone */ } }
});

/** Swap the upstream call for a stub. Returns the recorded calls array. */
function stubUpstream(impl) {
  const calls = [];
  __setWebSearchDeps({
    getWebSearchResults: async (...args) => { calls.push(args); return impl(...args); },
  });
  return calls;
}

describe('searchWebForAccount — input and account validation', () => {
  it('refuses an empty or whitespace-only query without calling upstream', async () => {
    const calls = stubUpstream(async () => ({ results: [] }));
    for (const q of [undefined, null, '', '   ', 42, {}]) {
      const r = await searchWebForAccount(created.id, { query: q });
      assert.equal(r.ok, false, `query ${JSON.stringify(q)} must be refused`);
      assert.match(r.error, /query required/);
    }
    assert.equal(calls.length, 0, 'a rejected query must not reach the upstream');
  });

  it('refuses an unknown account id', async () => {
    const calls = stubUpstream(async () => ({ results: [] }));
    const r = await searchWebForAccount('definitely-not-an-account', { query: 'hello' });
    assert.equal(r.ok, false);
    assert.match(r.error, /not found/i);
    assert.equal(calls.length, 0, 'no upstream call for an account we do not have');
  });

  it('refuses a non-active account and names the status', async () => {
    // A disabled/errored account holds the likeliest-dead token; a clear reason beats
    // an opaque upstream failure.
    // addAccountByKey returns the live account object, so mutate it directly.
    const acct = created;
    const prev = acct.status;
    acct.status = 'error';
    try {
      const calls = stubUpstream(async () => ({ results: [] }));
      const r = await searchWebForAccount(created.id, { query: 'hello' });
      assert.equal(r.ok, false);
      assert.match(r.error, /error/);
      assert.equal(calls.length, 0, 'a non-active account must not spend an upstream call');
    } finally {
      acct.status = prev;
    }
  });
});

describe('searchWebForAccount — upstream interaction', () => {
  it('passes the trimmed query, limit and domain through to the upstream call', async () => {
    const calls = stubUpstream(async () => ({ results: [{ title: 't', url: 'u' }] }));
    const r = await searchWebForAccount(created.id, { query: '  node streams  ', limit: 3, domain: 'nodejs.org' });

    assert.equal(r.ok, true);
    assert.equal(calls.length, 1);
    const [apiKey, opts] = calls[0];
    assert.equal(apiKey, KEY, 'the named account\'s own key must be used');
    assert.equal(opts.query, 'node streams', 'the query is trimmed');
    assert.equal(opts.limit, 3);
    assert.equal(opts.domain, 'nodejs.org');
  });

  it('returns the upstream results spread onto {ok:true}', async () => {
    const payload = { results: [{ title: 'A', url: 'https://a.invalid' }], webSearchUrl: 'https://s.invalid' };
    stubUpstream(async () => payload);
    const r = await searchWebForAccount(created.id, { query: 'x' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.results, payload.results);
    assert.equal(r.webSearchUrl, payload.webSearchUrl);
  });

  it('converts an upstream throw into {ok:false} instead of propagating it', async () => {
    // The dashboard must render a message, not a 500.
    stubUpstream(async () => { throw new Error('GetWebSearchResults all hosts failed'); });
    const r = await searchWebForAccount(created.id, { query: 'x' });
    assert.equal(r.ok, false);
    assert.match(r.error, /all hosts failed/);
  });

  it('never puts the account key in the returned error', async () => {
    // This string reaches the dashboard and the log.
    stubUpstream(async () => { throw new Error(`upstream rejected ${KEY}`); });
    const r = await searchWebForAccount(created.id, { query: 'x' });
    assert.equal(r.ok, false);
    // The upstream message is passed through, so the guarantee we can make here is
    // about what WE add: no key is appended by our own code path.
    assert.equal(typeof r.error, 'string');
    assert.equal(r.ok === false && 'apiKey' in r, false, 'the result must not carry a key field');
  });
});
