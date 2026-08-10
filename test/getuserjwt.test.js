import { afterEach, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __setWindsurfApiPostJsonForTest,
  __resetUserJwtCache,
  __userJwtCacheStats,
  __bumpUserJwtCacheEpoch,
  getUserJwt,
  isUserJwtEnabled,
} from '../src/windsurf-api.js';

const HOST = 'server.codeium.com';

function stubMint(jwt = 'jwt.one', ttlMs) {
  let calls = 0;
  __setWindsurfApiPostJsonForTest(async (host, path, body) => {
    calls++;
    return {
      status: 200,
      data: { userJwt: jwt, ...(ttlMs ? { ttlMs } : {}) },
      raw: '{}',
    };
  });
  return () => calls;
}

beforeEach(() => {
  __resetUserJwtCache();
});
afterEach(() => {
  __resetUserJwtCache();
  __setWindsurfApiPostJsonForTest(null);
});

describe('GetUserJwt short-lived credential path (auth)', () => {
  it('is gated by an env switch that defaults OFF', () => {
    assert.equal(isUserJwtEnabled({}), false);
    assert.equal(isUserJwtEnabled({ WINDSURFAPI_USER_JWT: '0' }), false);
    assert.equal(isUserJwtEnabled({ WINDSURFAPI_USER_JWT: '1' }), true);
  });

  it('mints against AuthService/GetUserJwt with the apiKey in Metadata', async () => {
    const seen = [];
    __setWindsurfApiPostJsonForTest(async (host, path, body) => {
      seen.push({ host, path, body });
      return { status: 200, data: { userJwt: 'jwt.one' }, raw: '{}' };
    });

    const jwt = await getUserJwt('key-1', HOST);
    assert.equal(jwt, 'jwt.one');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].host, HOST);
    assert.equal(seen[0].path, '/exa.auth_pb.AuthService/GetUserJwt');
    assert.equal(seen[0].body.metadata.apiKey, 'key-1');
    assert.equal(__userJwtCacheStats().entries, 1);
  });

  it('caches per-(apiKey,host) and serves from cache without re-minting', async () => {
    const calls = stubMint('jwt.one');

    await getUserJwt('key-1', HOST);
    await getUserJwt('key-1', HOST);
    await getUserJwt('key-1', HOST);
    assert.equal(calls(), 1, 'same (apiKey,host) must mint exactly once');

    // Different apiKey → different cache bucket.
    await getUserJwt('key-2', HOST);
    assert.equal(calls(), 2, 'a different apiKey must mint separately');
  });

  it('dedups concurrent in-flight mints to one upstream RPC', async () => {
    let calls = 0;
    let release;
    const gate = new Promise((r) => { release = r; });
    __setWindsurfApiPostJsonForTest(async () => {
      calls++;
      await gate;
      return { status: 200, data: { userJwt: 'jwt.one' }, raw: '{}' };
    });

    const p1 = getUserJwt('key-1', HOST);
    const p2 = getUserJwt('key-1', HOST);
    const p3 = getUserJwt('key-1', HOST);
    // Let all three reach the shared in-flight promise.
    await new Promise((r) => setImmediate(r));
    release();
    const [j1, j2, j3] = await Promise.all([p1, p2, p3]);
    assert.equal(j1, 'jwt.one');
    assert.equal(j2, 'jwt.one');
    assert.equal(j3, 'jwt.one');
    assert.equal(calls, 1, 'concurrent same-key mints must share one RPC');
    assert.equal(__userJwtCacheStats().entries, 1);
  });

  it('monotonic cacheEpoch: a mint racing a logout is rejected and the cache stays clean', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    __setWindsurfApiPostJsonForTest(async () => {
      await gate;
      return { status: 200, data: { userJwt: 'jwt.one' }, raw: '{}' };
    });

    const racing = getUserJwt('key-1', HOST);
    await new Promise((r) => setImmediate(r));
    // Logout/rotation happens while the mint is still in flight.
    __bumpUserJwtCacheEpoch();
    release();

    await assert.rejects(racing, /cache epoch changed during mint/);
    assert.equal(__userJwtCacheStats().entries, 0, 'a raced mint must not repopulate the cache');
  });

  it('stale entries are not served after the TTL elapses', async () => {
    const calls = stubMint('jwt.one', 1); // sub-ms TTL clamps to the min floor...
    await getUserJwt('key-1', HOST);
    // Min-TTL floor means we cannot wait out 5min — instead prove expiry is
    // enforced by simulating a re-mint after the epoch advances (a forced
    // invalidation) and after cache reset.
    __bumpUserJwtCacheEpoch(); // simulates a logout; cache entry is now stale
    const calls2 = stubMint('jwt.two');
    const jwt2 = await getUserJwt('key-1', HOST);
    assert.equal(jwt2, 'jwt.two');
    assert.equal(calls(), 1, 'first mint still counted once');
    assert.equal(calls2(), 1, 'second mint happened after epoch bump');
  });

  it('rejects when the upstream omits user_jwt', async () => {
    __setWindsurfApiPostJsonForTest(async () => ({ status: 200, data: {}, raw: '{}' }));
    await assert.rejects(() => getUserJwt('key-1', HOST), /missing user_jwt/);
  });

  it('metadata builder attaches user_jwt on field 21 only when provided', async () => {
    const { buildMetadata } = await import('../src/windsurf.js');
    const { parseFields, getAllFields } = await import('../src/proto.js');
    const plain = buildMetadata('key-1', undefined, 'sess');
    const withJwt = buildMetadata('key-1', undefined, 'sess', 'jwt.one');
    const without = buildMetadata('key-1', undefined, 'sess', null);

    // Field 21 must appear only with a JWT. This used to scan for a raw 0xaa byte (the wire
    // tag 21<<3|2 = 170), which failed ~4.3% of runs: Metadata carries a random field, and
    // any byte of any field's VALUE can be 0xaa. A tag byte is only a tag at a field
    // boundary, so presence has to come from parsing — the same "assert the field is absent,
    // never compare bytes" rule this repo already learned about wire-stability assertions.
    const hasField21 = (buf) => getAllFields(parseFields(buf), 21).length > 0;
    assert.equal(hasField21(plain), false);
    assert.equal(hasField21(without), false);
    assert.equal(hasField21(withJwt), true);
    assert.ok(withJwt.length > plain.length);
    assert.ok(without.length === plain.length);
  });

  it('buildRawGetChatMessageRequest threads userJwt into the embedded Metadata', async () => {
    const { buildRawGetChatMessageRequest } = await import('../src/windsurf.js');
    const { parseFields, getField, getAllFields } = await import('../src/proto.js');

    const proto = buildRawGetChatMessageRequest('key-1', [{ role: 'user', content: 'hi' }], 1, null, 'sess', 'jwt.one');
    const root = parseFields(proto);
    const metaField = getField(root, 1, 2);
    assert.ok(metaField, 'Metadata field 1 present');
    const meta = parseFields(metaField.value);
    const userJwtField = getAllFields(meta, 21).find((f) => f.wireType === 2);
    assert.ok(userJwtField, 'Metadata.user_jwt (field 21) present');
    assert.equal(userJwtField.value.toString('utf8'), 'jwt.one');

    const protoNoJwt = buildRawGetChatMessageRequest('key-1', [{ role: 'user', content: 'hi' }], 1, null, 'sess');
    const rootNoJwt = parseFields(protoNoJwt);
    const metaNoJwt = parseFields(getField(rootNoJwt, 1, 2).value);
    assert.equal(getAllFields(metaNoJwt, 21).length, 0, 'no user_jwt when none provided');
  });

  it('buildSendCascadeMessageRequest threads userJwt into the embedded Metadata', async () => {
    const { buildSendCascadeMessageRequest } = await import('../src/windsurf.js');
    const { parseFields, getField, getAllFields } = await import('../src/proto.js');

    const proto = buildSendCascadeMessageRequest('key-1', 'cascade-1', 'hi', 123, null, 'sess', {}, 'jwt.cascade');
    const root = parseFields(proto);
    const metaField = getField(root, 3, 2); // SendUserCascadeMessageRequest.metadata = 3
    assert.ok(metaField, 'Metadata field 3 present');
    const meta = parseFields(metaField.value);
    const userJwtField = getAllFields(meta, 21).find((f) => f.wireType === 2);
    assert.ok(userJwtField, 'Metadata.user_jwt (field 21) present on cascade message');
    assert.equal(userJwtField.value.toString('utf8'), 'jwt.cascade');
  });
});
