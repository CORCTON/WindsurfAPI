// Expiry used to drop the entry BEFORE the ownership check.
//
// getResponse's cross-tenant guard carries its own promise — "fails closed and is
// reported as not_found so a caller cannot probe which ids exist" — but the expiry
// branch sat NINE LINES ABOVE it, called dropEntry(responseId) and returned. So a
// caller who guessed a valid id deleted another tenant's expired conversation.
// Probing was indeed closed; the branch above it had already acted.
//
// MEASURED against the pre-fix code with RESPONSE_STORE_TTL_MS=60, entry owned by A:
//     after expiry, B reads -> ok=false reason='expired'
//     then A reads          -> ok=false reason='not_found'   <- B's request reaped it
//
// The reason string was never the leak: handlers/responses.js maps 'expired',
// 'forbidden' and 'not_found' to one identical 404. The DELETION was.
//
// TTL is 400ms here, with the absolute bound left at its 24h default so only the
// IDLE timeout binds. Every "still fresh" assertion below is SYNCHRONOUS — node does
// not preempt synchronous code, so no amount of suite load can insert 400ms between
// a put and the get that follows it. Only the "now expired" assertions await, and
// they sleep 600ms, i.e. they fail in the safe direction.

process.env.RESPONSE_STORE_TTL_MS = '400';

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const store = await import('../src/response-store.js');
const { handleResponses } = await import('../src/handlers/responses.js');

const A = 'api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:user:alice';
const B = 'api:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:user:bob';
const CONV = [{ role: 'user', content: 'alice private data' }];
const TTL = 400;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

beforeEach(() => store.resetResponseStore());

// MUST BE THE FIRST TEST IN THIS FILE. ensureSweepTimer installs the interval on the
// first putResponse and never reinstalls it (resetResponseStore does not clear the
// timer), so mock.timers has to be enabled before any store write or it captures
// nothing. Declaring it first is what guarantees that — tests in one file run in
// declaration order. If someone puts a test above it the tick fires nothing, the
// entry survives, and the assertion below fails loudly rather than passing vacuously.
describe('the periodic sweep still enforces the idle timeout', () => {
  it('reaps an entry left idle past the TTL', () => {
    // MAX_AGE is at its 24h default here and the tick is 5 minutes, so the absolute
    // bound cannot be what removes this entry — only the idle timeout can.
    mock.timers.enable({ apis: ['setInterval', 'Date'] });
    try {
      store.putResponse('forgotten', CONV, A);
      assert.equal(store.getResponseStoreStats().size, 1, 'precondition: stored');
      mock.timers.tick(SWEEP_INTERVAL_MS + 1000);
      assert.equal(store.getResponseStoreStats().size, 0,
        `the sweep must drop an entry idle for 5 minutes against a ${TTL}ms idle timeout`);
      assert.equal(store.getResponseStoreStats().expires, 1, 'and count it as an expiry');
    } finally {
      mock.timers.reset();
    }
  });
});

describe('expiry never acts before ownership is settled', () => {
  it('a foreign read of an EXPIRED entry does not delete it', async () => {
    store.putResponse('r', CONV, A);
    await sleep(TTL + 200);

    const foreign = store.getResponse('r', B);
    assert.equal(foreign.ok, false, 'a stranger must never get the conversation');
    assert.equal(store.getResponseStoreStats().size, 1,
      "the stranger's request must not have removed the owner's entry — this counted 0 "
      + 'before the fix, because the expiry branch ran before the ownership check');

    // The owner can still tell the difference between "mine, expired" and "gone".
    const owner = store.getResponse('r', A);
    assert.equal(owner.reason, 'expired',
      "the owner's entry must still have been there to expire; 'not_found' means the "
      + 'stranger already reaped it');
  });

  it('a foreign caller cannot tell an expired id from a fresh one', async () => {
    // Same reason for both, and neither drops anything, so the side effect does not
    // distinguish them either. The fresh half runs before any await, on purpose.
    store.putResponse('fresh', CONV, A);
    const onFresh = store.getResponse('fresh', B);
    assert.equal(onFresh.reason, 'forbidden');
    assert.equal(store.getResponseStoreStats().size, 1, 'nothing dropped');

    store.resetResponseStore();
    store.putResponse('stale', CONV, A);
    await sleep(TTL + 200);
    const onStale = store.getResponse('stale', B);
    assert.equal(onStale.reason, onFresh.reason,
      "an expired entry must answer a stranger exactly as a fresh one does; 'expired' "
      + 'told the stranger the id was real');
    assert.equal(store.getResponseStoreStats().size, 1, 'and still nothing dropped');
  });

  it('no conversation content leaks on either path', async () => {
    store.putResponse('leak', CONV, A);
    assert.equal(store.getResponse('leak', B).messages, undefined, 'fresh: no content');
    await sleep(TTL + 200);
    assert.equal(store.getResponse('leak', B).messages, undefined, 'expired: no content');
  });

  it('a stranger cannot flush a whole tenant by replaying ids', async () => {
    // The consequence at scale: an id is guessable-ish (a client that ever saw one
    // knows the format), and pre-fix each replay against an expired id destroyed one
    // of the owner's entries. Any caller with a list of ids was a delete primitive.
    for (let i = 0; i < 5; i++) store.putResponse(`x${i}`, CONV, A);
    await sleep(TTL + 200);
    for (let i = 0; i < 5; i++) store.getResponse(`x${i}`, B);
    assert.equal(store.getResponseStoreStats().size, 5,
      "a stranger's five replays must leave all five of the owner's entries in place "
      + '(pre-fix: 0)');
  });
});

describe("expiry still reaps the OWNER's own dead entry", () => {
  it("the owner's expired entry is dropped on lookup, not left for the sweep", async () => {
    // The reorder must not turn the lookup-path reap into a 5-minute-sweep-only
    // affair; the per-lookup check is the primary enforcement.
    store.putResponse('mine', CONV, A);
    await sleep(TTL + 200);

    const first = store.getResponse('mine', A);
    assert.equal(first.ok, false);
    assert.equal(first.reason, 'expired');
    assert.equal(store.getResponseStoreStats().size, 0,
      'the owner\'s own expired entry must actually be removed');
    assert.equal(store.getResponseStoreStats().expires, 1, 'and counted as an expiry');

    assert.equal(store.getResponse('mine', A).reason, 'not_found',
      'a second read finds nothing, because the first reaped it');
  });
});

describe('NEGATIVE CONTROL: the idle timeout and the fresh path are unchanged', () => {
  it('a fresh entry still resolves for its owner', () => {
    store.putResponse('ok', CONV, A);
    const got = store.getResponse('ok', A);
    assert.equal(got.ok, true);
    assert.deepEqual(got.messages, CONV, 'and the conversation is intact');
  });

  it('a foreign probe does not evict a FRESH entry either', () => {
    store.putResponse('probe', CONV, A);
    store.getResponse('probe', B);
    assert.equal(store.getResponse('probe', A).ok, true,
      'the pre-existing guarantee: a probe must not evict the entry');
  });

  it('reads keep refreshing the idle clock, so an active chain does not expire', async () => {
    // This is the behaviour the absolute bound was added ALONGSIDE, not instead of:
    // an agent loop touching the same id every few seconds must not have its context
    // expire underneath it. Polled at 20ms against a 400ms idle timeout for 3x the
    // TTL — a false red needs a single 20ms timer to overshoot by 20x.
    store.putResponse('active', CONV, A);
    let reads = 0;
    const deadline = Date.now() + TTL * 3;
    while (Date.now() < deadline) {
      await sleep(20);
      if (!store.getResponse('active', A).ok) break;
      reads++;
    }
    assert.ok(reads >= 15, `precondition: the loop must actually have polled, got ${reads}`);
    assert.equal(store.getResponse('active', A).ok, true,
      `an entry read every 20ms must survive ${TTL * 3}ms of a ${TTL}ms idle timeout`);
  });

  it('an entry left ALONE past the idle timeout does expire', async () => {
    // The mirror of the above: the refresh must not have become "never expires".
    store.putResponse('idle', CONV, A);
    await sleep(TTL + 200);
    assert.equal(store.getResponse('idle', A).reason, 'expired',
      'an abandoned conversation must still be collected');
  });
});

describe('the absolute retention default is generous enough for a long agent session', () => {
  // Lives here because this file overrides only TTL — RESPONSE_STORE_MAX_AGE_MS is at
  // its default, which is the value under test.
  it('defaults to at least 8 hours', () => {
    const st = store.getResponseStoreStats();
    assert.ok(st.maxAgeMs >= 8 * 60 * 60 * 1000,
      `the absolute bound must not silently drop a long-running agent loop; got ${st.maxAgeMs}ms. `
      + 'Dropping an in-use conversation is a worse failure than over-retention: the caller '
      + 'gets a 404 on context it is actively using and has nothing to recover from.');
    assert.equal(st.ttlMs, TTL, 'and the idle timeout is reported separately');
  });
});

describe('the HTTP boundary reveals nothing either', () => {
  const userTurn = (text) => [{ role: 'user', content: [{ type: 'input_text', text }] }];
  const recorder = () => {
    const seen = [];
    return {
      seen,
      handler: async (body) => {
        seen.push(body.messages);
        return { status: 200, body: { id: 'x', choices: [{ message: { role: 'assistant', content: 'ok' } }] } };
      },
    };
  };

  it("a stranger chaining from an expired foreign id gets the same 404 as an unknown id", async () => {
    const rec = recorder();
    store.putResponse('resp_real', CONV, A);
    await sleep(TTL + 200);

    const onReal = await handleResponses(
      { model: 'm', previous_response_id: 'resp_real', input: userTurn('give me it') },
      { handleChatCompletions: rec.handler, context: { callerKey: B } },
    );
    const onFake = await handleResponses(
      { model: 'm', previous_response_id: 'resp_fake', input: userTurn('give me it') },
      { handleChatCompletions: rec.handler, context: { callerKey: B } },
    );

    assert.equal(onReal.status, 404);
    assert.equal(onFake.status, 404);
    assert.equal(
      JSON.stringify(onReal.body).replace('resp_real', 'ID'),
      JSON.stringify(onFake.body).replace('resp_fake', 'ID'),
      'the two 404s must differ only in the echoed id');
    assert.equal(rec.seen.length, 0, 'and the upstream must not be called at all');
    assert.equal(store.getResponseStoreStats().size, 1,
      "the stranger's HTTP request must not have deleted the owner's entry");
  });
});
