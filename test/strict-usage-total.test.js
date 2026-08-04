// total_tokens vs OpenAI's arithmetic identity.
//
// OpenAI specifies total_tokens == prompt_tokens + completion_tokens. This proxy
// deliberately breaks that whenever cache_write > 0: the grand total carries
// generation-side cache-write so per-account cost accounting reflects real spend, while
// the per-bucket fields keep strict OpenAI/Anthropic semantics (cache_write ships on
// cache_creation_input_tokens, NOT inside prompt_tokens).
//
// #118 chose that on purpose. The alternative — cache_write inside prompt_tokens — made
// billing relays (one-api / new-api / sub2api) meter it as ordinary input and burn trial
// quotas in hours.
//
// WINDSURFAPI_STRICT_USAGE_TOTAL=1 restores the identity for clients that validate it.
// It is OFF by default, and the reason is an asymmetry worth stating: the identity break
// is cosmetic for almost every consumer, whereas dropping cache_write from the total
// under-reports real spend, so a relay metering on total_tokens would silently
// undercharge. Cosmetic beats financial, so spec-strictness is the opt-in rather than the
// default.
//
// The trap this file exists to guard: the operator's OWN spend tally reads the same usage
// object that goes out on the wire. If accounting metered on total_tokens, opting into
// spec compliance would silently make every operator's cost chart under-report — paying
// for cache-writes that never show up. Accounting therefore recovers the full cost from
// cache_creation_input_tokens instead, and that independence is asserted here.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildUsageBody, strictUsageTotal } from '../src/handlers/chat.js';
import { normalizeConnectUsage } from '../src/devin-connect.js';
import {
  addAccountByKey, removeAccount, getAccountInternal, recordAccountSpend,
  fullBillableTokens,
} from '../src/auth.js';

const ENV_KEY = 'WINDSURFAPI_STRICT_USAGE_TOTAL';

/** A cascade usage block with a real cache-write, so the two shapes differ. */
const SERVER_USAGE = { inputTokens: 100, outputTokens: 40, cacheReadTokens: 900, cacheWriteTokens: 500 };
/** The connect equivalent. */
const CONNECT_USAGE = { prompt: 100, completion: 40, cache_read_tokens: 900, cache_write_tokens: 500 };

const created = [];
beforeEach(() => { delete process.env[ENV_KEY]; created.length = 0; });
afterEach(() => {
  delete process.env[ENV_KEY];
  while (created.length) removeAccount(created.pop());
});

function seed(label) {
  const a = addAccountByKey(`devin-session-token$sut-${label}-${Math.random().toString(36).slice(2)}`, label);
  created.push(a.id);
  return getAccountInternal(a.id);
}

describe('default: the grand total carries cache-write', () => {
  it('is off unless explicitly set to 1', () => {
    assert.equal(strictUsageTotal({}), false, 'unset must be off');
    assert.equal(strictUsageTotal({ [ENV_KEY]: '0' }), false);
    assert.equal(strictUsageTotal({ [ENV_KEY]: '1' }), true);
    // Anything else is off — a typo must not silently change billing shape.
    assert.equal(strictUsageTotal({ [ENV_KEY]: 'true' }), false,
      'only the literal 1 enables it; a truthy-looking typo must not flip billing shape');
  });

  it('cascade: total exceeds prompt+completion by exactly the cache-write', () => {
    const u = buildUsageBody(SERVER_USAGE, [], 'x');
    assert.equal(u.prompt_tokens, 1000, 'fresh + cache_read');
    assert.equal(u.completion_tokens, 40);
    assert.equal(u.total_tokens, 1540, 'prompt + completion + cache_write');
    assert.equal(u.total_tokens - (u.prompt_tokens + u.completion_tokens), 500,
      'the gap IS the cache-write — this is the #118 contract, not drift');
    assert.equal(u.cache_creation_input_tokens, 500,
      'and it ships on the Anthropic extension field, never inside prompt_tokens');
  });

  it('connect: same shape from the same inputs', () => {
    const u = normalizeConnectUsage(CONNECT_USAGE);
    assert.equal(u.prompt_tokens, 1000);
    assert.equal(u.total_tokens, 1540);
    assert.equal(u.cache_creation_input_tokens, 500);
  });
});

describe('WINDSURFAPI_STRICT_USAGE_TOTAL=1: the identity is restored', () => {
  beforeEach(() => { process.env[ENV_KEY] = '1'; });

  it('cascade: total == prompt + completion', () => {
    const u = buildUsageBody(SERVER_USAGE, [], 'x');
    assert.equal(u.total_tokens, u.prompt_tokens + u.completion_tokens,
      'OpenAI arithmetic identity must hold exactly');
    assert.equal(u.total_tokens, 1040);
  });

  it('connect: total == prompt + completion', () => {
    const u = normalizeConnectUsage(CONNECT_USAGE);
    assert.equal(u.total_tokens, u.prompt_tokens + u.completion_tokens);
    assert.equal(u.total_tokens, 1040);
  });

  it('cache-write is still REPORTED, just not summed into the total', () => {
    // The flag changes one arithmetic, not what information is available. A consumer that
    // wants full cost can still compute it.
    const u = buildUsageBody(SERVER_USAGE, [], 'x');
    assert.equal(u.cache_creation_input_tokens, 500,
      'dropping the field as well would make full cost unrecoverable downstream');
    assert.equal(u.cascade_breakdown.cache_write_tokens, 500);
    const c = normalizeConnectUsage(CONNECT_USAGE);
    assert.equal(c.cache_creation_input_tokens, 500);
  });

  it('the per-bucket fields are untouched by the flag', () => {
    // The flag must not become a second way to change prompt_tokens — that was the
    // pre-#118 defect it would re-introduce.
    const strict = buildUsageBody(SERVER_USAGE, [], 'x');
    delete process.env[ENV_KEY];
    const loose = buildUsageBody(SERVER_USAGE, [], 'x');
    assert.equal(strict.prompt_tokens, loose.prompt_tokens, 'prompt_tokens must not move');
    assert.equal(strict.completion_tokens, loose.completion_tokens);
    assert.deepEqual(strict.prompt_tokens_details, loose.prompt_tokens_details);
    assert.equal(strict.cache_creation_input_tokens, loose.cache_creation_input_tokens);
  });
});

describe('cost accounting stays honest under BOTH shapes', () => {
  // The load-bearing property. If accounting metered on total_tokens, enabling the flag
  // would silently under-report every operator's spend.
  it('the same request bills the same regardless of the flag', () => {
    const a1 = seed('loose');
    delete process.env[ENV_KEY];
    recordAccountSpend(a1.apiKey, buildUsageBody(SERVER_USAGE, [], 'x'));
    const looseTally = getAccountInternal(a1.id)._totalSpend.totalTokens;

    const a2 = seed('strict');
    process.env[ENV_KEY] = '1';
    recordAccountSpend(a2.apiKey, buildUsageBody(SERVER_USAGE, [], 'x'));
    const strictTally = getAccountInternal(a2.id)._totalSpend.totalTokens;

    assert.equal(strictTally, looseTally,
      `spend tally moved from ${looseTally} to ${strictTally} when the flag flipped. `
      + 'Opting into a cosmetic wire change must never alter what the operator is billed '
      + 'for — they would pay for cache-writes that vanish from their own chart.');
    assert.equal(strictTally, 1540, 'and the honest figure is the full cost');
  });

  it('fullBillableTokens recovers the full cost from either shape', () => {
    delete process.env[ENV_KEY];
    const loose = buildUsageBody(SERVER_USAGE, [], 'x');
    process.env[ENV_KEY] = '1';
    const strict = buildUsageBody(SERVER_USAGE, [], 'x');

    assert.equal(fullBillableTokens(loose), 1540);
    assert.equal(fullBillableTokens(strict), 1540,
      'the strict shape hides cache-write from total_tokens, so it must be recovered '
      + 'from cache_creation_input_tokens');
    assert.notEqual(strict.total_tokens, fullBillableTokens(strict),
      'precondition: under the flag these two genuinely differ, or this test proves nothing');
  });

  it('a usage block with no cache fields still bills its total (pre-existing paths)', () => {
    // Estimated usage, the env-token path and special-agent produce blocks with no cache
    // breakdown at all. Those must be unaffected.
    const plain = { prompt_tokens: 30, completion_tokens: 7, total_tokens: 37 };
    assert.equal(fullBillableTokens(plain), 37);
    const a = seed('plain');
    recordAccountSpend(a.apiKey, plain);
    assert.equal(getAccountInternal(a.id)._totalSpend.totalTokens, 37);
  });

  it('a malformed usage block can never produce a NEGATIVE spend total', () => {
    // The tally is cumulative, so it must be monotonic. The inline version this replaced
    // ended in `|| (prompt + completion)`, which was unreachable for real usage AND the only
    // path able to emit a negative: a negative bucket makes the max 0, and `0 ||` then falls
    // through to the negative sum. Upstream numbers are not ours to trust.
    assert.equal(fullBillableTokens({ prompt_tokens: -500, completion_tokens: -10 }), 0);
    assert.equal(fullBillableTokens({ total_tokens: -999 }), 0);
    assert.equal(fullBillableTokens({ prompt_tokens: 10, completion_tokens: -3 }), 10,
      'a negative bucket must be clamped, not subtracted from a sibling');
    assert.equal(fullBillableTokens({ prompt_tokens: 'x', completion_tokens: null }), 0,
      'non-numeric input must not produce NaN, which would poison the running total');

    const a = seed('neg');
    recordAccountSpend(a.apiKey, { prompt_tokens: -500, completion_tokens: -10, total_tokens: -510 });
    assert.equal(getAccountInternal(a.id)._totalSpend.totalTokens, 0,
      'the cumulative tally must never move backwards');
  });

  it('a usage block with neither total nor cache fields falls back to the buckets', () => {
    assert.equal(fullBillableTokens({ prompt_tokens: 5, completion_tokens: 6 }), 11);
    assert.equal(fullBillableTokens(null), 0);
    assert.equal(fullBillableTokens({}), 0);
  });
});

describe('every protocol front honours the flag, not just two of them', () => {
  // The partial-path check. When the flag shipped it bound the Cascade and connect usage
  // builders; special-agent (Devin CLI / ACP) forwarded whatever the runner reported, so
  // with the flag ON that front could still emit total != prompt + completion. A flag that
  // holds on some fronts and not others is worse than no flag — the client cannot tell
  // which response it is looking at.
  it('special-agent honours the flag even when the runner reports a non-identity total', async () => {
    const sa = await import('../src/special-agent.js');
    const pick = sa.__testing?.pickUsage;
    assert.ok(typeof pick === 'function',
      'special-agent must expose pickUsage for test — otherwise this front can only be '
      + 'checked by reading, which is how it was missed the first time');

    // A runner reporting a total that is NOT the sum of its parts. Whether real runners do
    // this is not the point: the flag's contract is about what WE emit.
    const raw = { inputTokens: 100, outputTokens: 40, totalTokens: 999 };
    const messages = [{ role: 'user', content: 'hello' }];

    delete process.env[ENV_KEY];
    const loose = pick(raw, messages, 'answer');
    assert.equal(loose.total_tokens, 999,
      'default must forward the runner\'s own total unchanged');

    process.env[ENV_KEY] = '1';
    const strict = pick(raw, messages, 'answer');
    assert.equal(strict.total_tokens, strict.prompt_tokens + strict.completion_tokens,
      'with the flag on this front must satisfy the identity too');
    assert.equal(strict.total_tokens, 140);
    assert.equal(strict.prompt_tokens, 100, 'and the buckets themselves must not move');
    assert.equal(strict.completion_tokens, 40);
  });

  it('all three usage builders agree on the identity under the flag', async () => {
    process.env[ENV_KEY] = '1';
    const sa = await import('../src/special-agent.js');
    const cascade = buildUsageBody(SERVER_USAGE, [], 'x');
    const connect = normalizeConnectUsage(CONNECT_USAGE);
    const acp = sa.__testing.pickUsage(
      { inputTokens: 100, outputTokens: 40, totalTokens: 999 }, [{ role: 'user', content: 'hi' }], 'a',
    );
    for (const [name, u] of [['cascade', cascade], ['connect', connect], ['acp', acp]]) {
      assert.equal(u.total_tokens, u.prompt_tokens + u.completion_tokens,
        `${name} breaks the identity while the flag is on — the flag must be all-or-nothing`);
    }
  });
});

describe('the estimated-usage path has no cache-write, so both shapes agree', () => {
  it('total == prompt + completion either way', () => {
    // buildUsageBody's fallback arm (no serverUsage) already satisfies the identity, so
    // the flag must be a no-op there rather than subtracting something that is not present.
    const messages = [{ role: 'user', content: 'hello world' }];
    delete process.env[ENV_KEY];
    const loose = buildUsageBody(null, messages, 'some answer');
    process.env[ENV_KEY] = '1';
    const strict = buildUsageBody(null, messages, 'some answer');
    assert.equal(loose.total_tokens, loose.prompt_tokens + loose.completion_tokens);
    assert.deepEqual(strict, loose, 'the flag must not perturb the estimated path at all');
  });
});
