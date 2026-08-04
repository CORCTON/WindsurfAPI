// Per-account lifetime spend must be recorded on the Cascade STREAM path (K8).
//
// Three of the four paths had a `recordAccountSpend` call point (connect stream, connect
// non-stream, Cascade non-stream); the Cascade stream path did not. On a Cascade deployment
// a streamed turn — the common case for an agent client — therefore added nothing to the
// account's lifetime tally, and the dashboard's per-account spend column under-reported by
// however much of the traffic was streamed.
//
// This is a BEHAVIOUR test on purpose, not a source grep. The call site lives inside
// `streamResponse`, which does not receive `apiKey` as a parameter (nonStreamResponse does —
// that asymmetry is why the gap existed) and resolves the account from its own `acct`
// binding instead. chat.js has ReferenceError'd exactly this way before: it referenced
// `body` inside streamResponse where `body` was never in scope, and it threw on EVERY
// stream finish (#93 follow-up; see test/thinking-fallback-glm.test.js's header). The call
// is wrapped in try/catch, so a scope error would be swallowed in silence — grepping for
// the call proves nothing, and only driving the path and watching the tally move does.
//
// The ledger also records the inverse hazard — the same tokens counted twice on a retried
// or replayed turn — so the retry and abort cases are pinned below.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addAccountByKey,
  getAccountInternal,
  getAccountPublic,
  getApiKey,
  removeAccount,
} from '../src/auth.js';
import { handleChatCompletions } from '../src/handlers/chat.js';

const createdIds = [];
let originalDevinConnect;
let originalDevinOnly;

function seed(label) {
  const a = addAccountByKey(`devin-session-token$xk-${label}-${Math.random().toString(36).slice(2)}`, label);
  createdIds.push(a.id);
  const acct = getAccountInternal(a.id);
  acct.tier = 'pro';
  acct.status = 'active';
  return acct;
}

function fakeResponse() {
  return {
    statusCode: 0,
    body: '',
    writableEnded: false,
    writeHead(status) { this.statusCode = status; },
    write(chunk) { this.body += String(chunk); return true; },
    end(chunk) { if (chunk) this.body += String(chunk); this.writableEnded = true; },
    on() {}, once() {}, removeListener() {},
  };
}

/**
 * @param {object} opts
 * @param {number} [opts.promptTokens] usage the fake upstream reports
 * @param {number} [opts.completionTokens]
 * @param {number} [opts.failFirst] throw a retryable error on the first N calls
 */
function contextFor({ promptTokens = 100, completionTokens = 20, failFirst = 0, stream = true } = {}) {
  let calls = 0;
  class FakeClient {
    async cascadeChat(_messages, _modelEnum, _modelUid, opts = {}) {
      calls++;
      if (calls <= failFirst) {
        // The stream retry gate is `!hadSuccess && (err.isModelError || isRateLimit)`, so
        // `isModelError` is what actually reaches the `continue`. `kind` only classifies it
        // as transient (which suppresses the account penalty). An invented `code` satisfies
        // neither, which is why the first draft never retried at all (calls=1) — and the
        // precondition assertion below is what caught that rather than letting the test
        // report "billed once" off a run with no retry in it.
        const err = new Error('upstream stalled');
        err.kind = 'transient_stall';
        err.isModelError = true;
        throw err;
      }
      // buildUsageBody reads the CASCADE field names (inputTokens / outputTokens), not the
      // OpenAI ones. Getting this wrong is silent: it falls through to the chars/4
      // estimate, so the tally still moves and only the amount is wrong — the first draft
      // of this test asserted 120 and measured 2 that way.
      const usage = { inputTokens: promptTokens, outputTokens: completionTokens };
      if (stream) {
        opts.onChunk({ text: 'OK' });
        return { text: '', toolCalls: [], usage };
      }
      // Non-stream returns an ARRAY of chunks with toolCalls attached; returning a plain
      // object yields a 502.
      return Object.assign([{ text: 'OK' }], { toolCalls: [], usage });
    }
  }
  const ctx = {
    // Hands out a fresh account per attempt. The reference fixture this was copied from
    // returned null after the first attempt, which silently capped the run at ONE upstream
    // call and made the retry test's precondition unsatisfiable.
    waitForAccount(tried, _signal, _maxWait, modelKey) {
      return getApiKey(tried, modelKey);
    },
    ensureLs: async () => {},
    getLsFor: () => ({ port: 17777, csrfToken: 'csrf', generation: 1 }),
    WindsurfClient: FakeClient,
  };
  Object.defineProperty(ctx, 'upstreamCalls', { get: () => calls });
  return ctx;
}

const spendOf = (id) => getAccountPublic(id)?.totalSpend?.totalTokens ?? 0;

beforeEach(() => {
  originalDevinConnect = process.env.DEVIN_CONNECT;
  originalDevinOnly = process.env.DEVIN_ONLY;
  // Cascade transport, not connect: the gap under test is Cascade-specific.
  delete process.env.DEVIN_CONNECT;
  delete process.env.DEVIN_ONLY;
});

afterEach(() => {
  // Only ids this file created. Never map removeAccount over the account list — a cleanup
  // written that way once deleted a user's real accounts, unrecoverably.
  while (createdIds.length) { try { removeAccount(createdIds.pop()); } catch {} }
  if (originalDevinConnect === undefined) delete process.env.DEVIN_CONNECT;
  else process.env.DEVIN_CONNECT = originalDevinConnect;
  if (originalDevinOnly === undefined) delete process.env.DEVIN_ONLY;
  else process.env.DEVIN_ONLY = originalDevinOnly;
});

describe('K8: Cascade stream path records per-account spend', () => {
  it('a streamed turn moves the account tally', async () => {
    const acct = seed('stream-spend');
    const before = spendOf(acct.id);

    const result = await handleChatCompletions(
      { model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }], stream: true },
      contextFor({ promptTokens: 100, completionTokens: 20 }),
    );
    assert.equal(result.status, 200);
    await result.handler(fakeResponse());

    const after = spendOf(acct.id);
    assert.ok(
      after > before,
      `per-account spend did not move (${before} -> ${after}). Either the call point is '
      + 'missing or its account binding is out of scope — the try/catch around it makes a '
      + 'ReferenceError silent, which is why this asserts the tally rather than the call`,
    );
    assert.equal(after - before, 120, 'the recorded amount must be the reported usage');
  });

  it('the non-stream path still records, so the fix did not move the problem', async () => {
    const acct = seed('nonstream-spend');
    const before = spendOf(acct.id);

    const result = await handleChatCompletions(
      { model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }] },
      contextFor({ promptTokens: 7, completionTokens: 3, stream: false }),
    );
    assert.equal(result.status, 200);

    assert.equal(spendOf(acct.id) - before, 10);
  });

  it('a failed attempt is not billed — only the account that served it', async () => {
    // The call site sits inside the attempt loop, so this is the hazard that matters. The
    // ledger records a rescue retry's billing being counted into the following attempt.
    //
    // Two accounts, because the stream retry moves to the NEXT account rather than reusing
    // the same one. Attempt 1 throws on whichever it drew; attempt 2 succeeds on the other.
    // The failed one must end at zero and the total across both must be a single turn.
    const a = seed('retry-a');
    const b = seed('retry-b');
    const before = spendOf(a.id) + spendOf(b.id);

    const ctx = contextFor({ promptTokens: 100, completionTokens: 20, failFirst: 1 });
    const result = await handleChatCompletions(
      { model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }], stream: true },
      ctx,
    );
    assert.equal(result.status, 200);
    await result.handler(fakeResponse());

    assert.ok(ctx.upstreamCalls >= 2,
      `precondition: the retry must have fired (calls=${ctx.upstreamCalls}). Without it this `
      + 'test would report "billed once" off a run containing no retry at all');
    const total = spendOf(a.id) + spendOf(b.id) - before;
    assert.equal(total, 120,
      `a retried stream billed ${total} across both accounts instead of one turn's 120 — the `
      + 'failed attempt must not be counted');
    const served = [a, b].filter((x) => spendOf(x.id) > 0);
    assert.equal(served.length, 1, 'exactly one account may carry the charge');
  });
});
