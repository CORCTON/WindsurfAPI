// Short-lived user JWT (exa.auth_pb.AuthService/GetUserJwt), opt-in.
//
// The upstream can exchange the long-lived session token for a ~24-minute HS256
// JWT that rides the chat request as ClientMetadata #21. Four independent .proto
// reimplementations agree on the method and response shape, and one third-party
// client treats the JWT as REQUIRED for chat RPCs — but OUR chat path demonstrably
// works without it, so this ships default-OFF and an operator turns it on backed by
// their own capture.
//
// What these tests pin, in order of how badly each failure would hurt:
//   1. OFF is not merely "no JWT" but "no extra RPC and no #21 on the wire".
//   2. A mint failure NEVER fails the user's request (null is a valid outcome).
//   3. The epoch guard: a mint in flight across an account switch must be DROPPED,
//      not cached — otherwise the previous account's credential rides the next
//      tenant's request. Silent and cross-account, so it gets the most coverage.
//   4. Caching/coalescing actually happens (a burst mints once).

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGetChatMessageRequest,
  mintUserJwt,
  invalidateUserJwtCache,
  isUserJwtEnabled,
  userJwtExpiryMs,
  __setRequestImpl,
} from '../src/devin-connect.js';
import { parseFields, getField, writeStringField } from '../src/proto.js';
import { wrapEnvelope } from '../src/connect.js';

const TOKEN = 'devin-session-token$a.b.c';

/** A JWT whose payload carries `exp` (seconds), the shape the cache ages out on. */
function jwtWithExp(expSeconds, marker = 'sig') {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return `header.${payload}.${marker}`;
}

/** The ClientMetadata sub-message (#1) of a built request, parsed. */
function metaFields(proto) {
  return parseFields(getField(parseFields(proto), 1, 2).value);
}
function metaField21(proto) {
  return getField(metaFields(proto), 21, 2)?.value?.toString('utf8');
}

/**
 * A fake https.request that answers one Connect unary call with `jwt`.
 * `onRequest` observes each call so a test can count RPCs.
 */
function fakeTransport({ jwt = null, status = 200, onRequest = () => {}, trailerOnly = false } = {}) {
  return (opts, cb) => {
    onRequest(opts);
    const listeners = {};
    const res = {
      statusCode: status,
      on(ev, fn) { listeners[ev] = fn; return res; },
    };
    // Answer asynchronously, the way a socket would.
    setImmediate(() => {
      cb(res);
      if (trailerOnly) {
        const trailer = Buffer.from('{}');
        const frame = Buffer.alloc(5 + trailer.length);
        frame[0] = 0x02;
        frame.writeUInt32BE(trailer.length, 1);
        trailer.copy(frame, 5);
        listeners.data?.(frame);
      } else if (jwt != null) {
        listeners.data?.(wrapEnvelope(writeStringField(1, jwt), { compress: false }));
      }
      listeners.end?.();
    });
    return { on() { return this; }, end() {} };
  };
}

beforeEach(() => { invalidateUserJwtCache(); });
afterEach(() => { __setRequestImpl(null); invalidateUserJwtCache(); });

describe('isUserJwtEnabled — default OFF', () => {
  it('is off unless the value is exactly "1"', () => {
    assert.equal(isUserJwtEnabled({}), false, 'unset must be off: this adds a field to a working wire');
    assert.equal(isUserJwtEnabled({ DEVIN_CONNECT_USER_JWT: '' }), false);
    assert.equal(isUserJwtEnabled({ DEVIN_CONNECT_USER_JWT: '0' }), false);
    assert.equal(isUserJwtEnabled({ DEVIN_CONNECT_USER_JWT: 'true' }), false);
    assert.equal(isUserJwtEnabled({ DEVIN_CONNECT_USER_JWT: '1' }), true);
  });
});

describe('ClientMetadata #21 is emitted only when a JWT was minted', () => {
  const base = { token: TOKEN, model: 'm', messages: [{ role: 'user', content: 'x' }], deviceSeed: 's' };

  it('omits #21 entirely for every falsy value — no zero-length field', () => {
    // A zero-length #21 would still be a wire change on the default path. The
    // request must carry NO field 21 at all, which is what `some(f => f.field===21)`
    // checks (a value comparison would pass on an empty string).
    for (const extra of [{}, { userJwt: undefined }, { userJwt: '' }, { userJwt: null }]) {
      const proto = buildGetChatMessageRequest({ ...base, ...extra });
      assert.equal(metaFields(proto).some((f) => f.field === 21), false,
        `#21 must be absent for ${JSON.stringify(extra)}`);
    }
  });

  it('carries the JWT verbatim in #21 when one is passed', () => {
    const proto = buildGetChatMessageRequest({ ...base, userJwt: 'header.payload.sig' });
    assert.equal(metaField21(proto), 'header.payload.sig');
  });

  it('keeps the metadata fields ascending with #21 present', () => {
    // Field order is not semantically required by protobuf, but every other field
    // here is written ascending and a decoder that assumes it (ours does, in
    // places) must not meet #21 after #31.
    const proto = buildGetChatMessageRequest({ ...base, userJwt: 'h.p.s' });
    const nums = metaFields(proto).map((f) => f.field);
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b), `fields not ascending: ${nums}`);
    assert.ok(nums.indexOf(21) < nums.indexOf(31), '#21 must precede the #31 fingerprint');
  });
});

describe('userJwtExpiryMs', () => {
  it('reads exp out of the payload as milliseconds', () => {
    assert.equal(userJwtExpiryMs(jwtWithExp(1_800_000_000)), 1_800_000_000_000);
  });

  it('returns null for anything unreadable instead of throwing', () => {
    // This runs on the request path; an upstream returning junk must degrade.
    for (const bad of [null, undefined, 42, '', 'notajwt', 'a.b', 'a.!!!.c', 'a.' + Buffer.from('{}').toString('base64url') + '.c']) {
      assert.equal(userJwtExpiryMs(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe('mintUserJwt', () => {
  it('returns the JWT from response field #1', async () => {
    const jwt = jwtWithExp(Math.floor(Date.now() / 1000) + 1800);
    __setRequestImpl(fakeTransport({ jwt }));
    assert.equal(await mintUserJwt(TOKEN), jwt);
  });

  it('caches: a second call within the freshness window issues NO new RPC', async () => {
    const jwt = jwtWithExp(Math.floor(Date.now() / 1000) + 1800);
    let calls = 0;
    __setRequestImpl(fakeTransport({ jwt, onRequest: () => { calls++; } }));

    assert.equal(await mintUserJwt(TOKEN), jwt);
    assert.equal(await mintUserJwt(TOKEN), jwt);
    assert.equal(calls, 1, 'the cached JWT must be reused');
  });

  it('coalesces a concurrent burst into ONE mint', async () => {
    const jwt = jwtWithExp(Math.floor(Date.now() / 1000) + 1800);
    let calls = 0;
    __setRequestImpl(fakeTransport({ jwt, onRequest: () => { calls++; } }));

    const all = await Promise.all(Array.from({ length: 8 }, () => mintUserJwt(TOKEN)));
    assert.deepEqual(all, Array(8).fill(jwt));
    assert.equal(calls, 1, 'eight concurrent callers must mint once, not eight times');
  });

  it('re-mints once the cached JWT is inside the refresh skew', async () => {
    // exp only 30s out, and the skew is 60s → already stale on arrival, so it is
    // handed to this caller but never cached.
    const soon = jwtWithExp(Math.floor(Date.now() / 1000) + 30);
    let calls = 0;
    __setRequestImpl(fakeTransport({ jwt: soon, onRequest: () => { calls++; } }));

    await mintUserJwt(TOKEN);
    await mintUserJwt(TOKEN);
    assert.equal(calls, 2, 'a JWT inside the skew must not satisfy the next caller');
  });

  it('does not cache a JWT with no readable exp (never cached-forever)', async () => {
    let calls = 0;
    __setRequestImpl(fakeTransport({ jwt: 'header.notbase64.sig', onRequest: () => { calls++; } }));

    assert.equal(await mintUserJwt(TOKEN), 'header.notbase64.sig', 'still usable once');
    await mintUserJwt(TOKEN);
    assert.equal(calls, 2, 'a credential we cannot age out must not be held');
  });

  it('returns null (never throws) for an empty token, a non-200, a trailer-only reply, and a transport throw', async () => {
    assert.equal(await mintUserJwt(''), null);

    __setRequestImpl(fakeTransport({ status: 403 }));
    assert.equal(await mintUserJwt(TOKEN), null, 'a non-200 must degrade, not fail the request');

    __setRequestImpl(fakeTransport({ trailerOnly: true }));
    assert.equal(await mintUserJwt(TOKEN), null, 'a trailer-only response carries no message');

    __setRequestImpl(() => { throw new Error('socket exploded'); });
    assert.equal(await mintUserJwt(TOKEN), null, 'a transport throw must be swallowed');
  });

  it('returns null when the response frame has no field #1', async () => {
    __setRequestImpl((opts, cb) => {
      const listeners = {};
      const res = { statusCode: 200, on(ev, fn) { listeners[ev] = fn; return res; } };
      setImmediate(() => {
        cb(res);
        // field #2 (custom_api_server_url) only — no JWT.
        listeners.data?.(wrapEnvelope(writeStringField(2, 'https://example.invalid'), { compress: false }));
        listeners.end?.();
      });
      return { on() { return this; }, end() {} };
    });
    assert.equal(await mintUserJwt(TOKEN), null);
  });
});

describe('mintUserJwt epoch guard — a mint crossing an account switch is DROPPED', () => {
  it('discards an in-flight mint when the cache is invalidated mid-flight', async () => {
    // The failure this prevents: account A's mint is in flight, the account is
    // rotated/logged out, the mint lands, and A's credential is cached — then rides
    // the NEXT tenant's request. Silent and cross-account.
    const jwt = jwtWithExp(Math.floor(Date.now() / 1000) + 1800, 'accountA');
    let release;
    __setRequestImpl((opts, cb) => {
      const listeners = {};
      const res = { statusCode: 200, on(ev, fn) { listeners[ev] = fn; return res; } };
      // Hand the test control of WHEN the response lands.
      release = () => {
        cb(res);
        listeners.data?.(wrapEnvelope(writeStringField(1, jwt), { compress: false }));
        listeners.end?.();
      };
      return { on() { return this; }, end() {} };
    });

    const pending = mintUserJwt(TOKEN);
    invalidateUserJwtCache(); // the account switches while the mint is in flight
    release();

    assert.equal(await pending, null,
      'a mint that crossed an invalidation must resolve null, not the stale credential');

    // And it must not have poisoned the cache: the next mint issues a fresh RPC.
    let calls = 0;
    const fresh = jwtWithExp(Math.floor(Date.now() / 1000) + 1800, 'accountB');
    __setRequestImpl(fakeTransport({ jwt: fresh, onRequest: () => { calls++; } }));
    assert.equal(await mintUserJwt(TOKEN), fresh, 'the next caller must get the CURRENT account JWT');
    assert.equal(calls, 1, 'the dropped mint must not have populated the cache');
  });

  it('invalidateUserJwtCache clears an already-cached JWT', async () => {
    const first = jwtWithExp(Math.floor(Date.now() / 1000) + 1800, 'first');
    __setRequestImpl(fakeTransport({ jwt: first }));
    assert.equal(await mintUserJwt(TOKEN), first);

    invalidateUserJwtCache();

    const second = jwtWithExp(Math.floor(Date.now() / 1000) + 1800, 'second');
    let calls = 0;
    __setRequestImpl(fakeTransport({ jwt: second, onRequest: () => { calls++; } }));
    assert.equal(await mintUserJwt(TOKEN), second, 'the cleared cache must re-mint');
    assert.equal(calls, 1);
  });

  it('keys the cache per token: a different token does not reuse the first JWT', async () => {
    const a = jwtWithExp(Math.floor(Date.now() / 1000) + 1800, 'tokenA');
    __setRequestImpl(fakeTransport({ jwt: a }));
    assert.equal(await mintUserJwt(TOKEN), a);

    const b = jwtWithExp(Math.floor(Date.now() / 1000) + 1800, 'tokenB');
    __setRequestImpl(fakeTransport({ jwt: b }));
    assert.equal(await mintUserJwt('devin-session-token$other.token.here'), b,
      'a second account must not be served the first account credential');
  });
});
