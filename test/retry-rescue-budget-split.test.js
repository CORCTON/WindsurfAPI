// #240 — retry-on-empty and the thinking-only rescue are two speculative arms with two
// budgets, and until this file they shared one counter.
//
// `streamChatWithEmptyRetry` reaches its next iteration with `continue` inside
// `for (let attempt = 0; ; attempt++)`. The rescue arm has always had its own
// `rescueAttempt`/`rescueMax` pair, but the EMPTY arm's budget was measured against the
// loop counter — so every rescue iteration silently spent it. One-way: the empty arm
// never touched `rescueAttempt`.
//
// Measured before the fix, at the defaults (RETRY_ON_EMPTY_MAX=2, RESCUE_MAX=2):
//
//   two rescues, then an empty completion  -> 3 upstream calls, client got ""
//   the same empty with no rescue before it -> 2 upstream calls, client got the answer
//
// Reported by warelik with 66 days of production logs (158 empty-retry events, 6 rescue
// events, zero attributable exhaustions) — the edge had never fired in production, which
// is why this is pinned by tests rather than discovered by one.
//
// What must NOT change is the TOTAL: 1 + max + rescueMax upstream calls per client
// request. That ceiling is the account protection (the fable paid E2E: retries that never
// heal only triple upstream load into a 3h rate limit), and it was already reachable
// before the split — in the empty-first order. The split makes the empty budget
// independent of ORDER, not larger. Both directions are asserted below, because a change
// that fixed the starvation by raising the ceiling would look identical in a test that
// only checked the starvation.

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { toChatCompletion, __setStreamChatForTest } from '../src/devin-connect-openai.js';
import { log } from '../src/config.js';

const TOOLS = [{ type: 'function', function: { name: 'read_file', parameters: {} } }];

// isEmptyCompletion needs sawContent === false: no content AND no reasoning deltas.
const EMPTY = [{ type: 'finish', reason: 'stop', usage: { completion_tokens: 4 } }];
// The rescue trigger is `sawReasoning && !sawText` with no tool calls.
const REASONING_ONLY = [
  { type: 'reasoning', text: 'I should call read_file' },
  { type: 'finish', reason: 'stop', usage: null },
];
const ANSWER = [
  { type: 'content', text: 'the real answer' },
  { type: 'finish', reason: 'stop', usage: null },
];

afterEach(() => {
  __setStreamChatForTest(null);
  delete process.env.DEVIN_CONNECT_RETRY_ON_EMPTY_MS;
  delete process.env.DEVIN_CONNECT_RETRY_ON_EMPTY_MAX;
  delete process.env.DEVIN_CONNECT_RESCUE_MAX;
});

/**
 * Drive one client request against a scripted sequence of upstream turns.
 * The last entry repeats if the loop asks for more turns than were scripted, so a
 * scenario that is meant to exhaust a budget does not accidentally end because the
 * script ran out.
 */
async function run(turns, { env = {}, maxRetries = 0 } = {}) {
  process.env.DEVIN_CONNECT_RETRY_ON_EMPTY_MS = '0';
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  let calls = 0;
  __setStreamChatForTest(async function* () {
    const turn = turns[Math.min(calls, turns.length - 1)];
    calls++;
    for (const ev of turn) yield ev;
  });
  const res = await toChatCompletion(
    { model: 'swe-1-7', messages: [{ role: 'user', content: 'go' }], tools: TOOLS },
    { emulateTools: true, maxRetries },
  );
  return { calls, content: res.body?.choices?.[0]?.message?.content ?? null };
}

describe('#240 — a rescue chain must not spend the empty-retry budget', () => {
  // THE load-bearing pair. The two scenarios differ in exactly one thing: whether a
  // rescue happened earlier in the same request. Asserting the healed content as well as
  // the call count matters — a change that retried but dropped the healed answer would
  // satisfy a count-only assertion.
  it('an empty completion after a full rescue chain still gets its own retries', async () => {
    const r = await run([REASONING_ONLY, REASONING_ONLY, EMPTY, ANSWER]);
    assert.equal(r.content, 'the real answer',
      'two rescues then an empty: the empty must still be retried. Before the split the '
      + 'client received "" here, because the rescues had consumed `attempt` and the empty '
      + 'arm\'s gate `attempt < max` was already false');
    assert.equal(r.calls, 4, 'call 1+2 rescue, call 3 empty, call 4 the retry that heals');
  });

  // A control, and honestly labelled as one: no budget mutation can make it fail, because
  // the turn heals on the first retry and never reaches any ceiling. It is kept because it
  // is what makes the assertion above a measurement rather than an anecdote — without the
  // pair, "4 calls" is a number with nothing to compare against. Mutation coverage for
  // this file's real properties lives in the assertions that do bite.
  it('control: the identical empty with no preceding rescue behaves the same way', async () => {
    const r = await run([EMPTY, ANSWER]);
    assert.equal(r.content, 'the real answer');
    assert.equal(r.calls, 2,
      'the control is what made the defect visible: same empty, same budget, one fewer '
      + 'upstream call because nothing was spent before it');
  });

  it('one rescue costs the empty arm nothing (it used to cost exactly one retry)', async () => {
    const r = await run([REASONING_ONLY, EMPTY, EMPTY, ANSWER]);
    assert.equal(r.content, 'the real answer',
      'a single rescue then two empties: both empty retries must be available. Before the '
      + 'split this delivered "" — one rescue had eaten one of the two');
    assert.equal(r.calls, 4);
  });

  // The reverse direction was never broken; it is pinned so a future "symmetry" refactor
  // cannot introduce the mirror defect while the tests above stay green.
  it('and the reverse was already true: empty retries do not spend the rescue budget', async () => {
    const r = await run([EMPTY, EMPTY, REASONING_ONLY, ANSWER]);
    assert.equal(r.content, 'the real answer');
    assert.equal(r.calls, 4, 'two empty retries, then the rescue still fires');
  });
});

describe('#240 — the total ceiling is 1 + max + rescueMax and does not move', () => {
  // Criterion 2. Without these, "give the empty arm its own counter" could be satisfied
  // by simply letting both arms run unbounded.
  for (const [label, turns] of [
    ['empty first, then reasoning-only', [EMPTY, EMPTY, REASONING_ONLY]],
    ['reasoning-only first, then empty', [REASONING_ONLY, REASONING_ONLY, EMPTY]],
  ]) {
    it(`both arms exhausted (${label}) costs exactly 5 calls at the defaults`, async () => {
      // Nothing ever heals, so each arm spends its full budget: 1 + 2 + 2.
      const r = await run(turns);
      assert.equal(r.calls, 5,
        `${label}: the ceiling is 1 + RETRY_ON_EMPTY_MAX(2) + RESCUE_MAX(2). More than 5 `
        + 'means the split raised what one client request may spend upstream, which is the '
        + 'account protection the fable paid E2E bought');
    });
  }

  it('the ceiling tracks the knobs rather than being hardcoded', async () => {
    // Turn order is load-bearing in these scenarios and it is easy to get wrong: the loop
    // exits at the FIRST turn that triggers neither arm, so the empties have to come while
    // the empty budget still has room. With max=3 a fourth empty ends the request and the
    // rescue arm never gets a turn — that mistake made this assertion read 4 while the
    // ceiling was working correctly.
    const r = await run([EMPTY, EMPTY, EMPTY, REASONING_ONLY], {
      env: { DEVIN_CONNECT_RETRY_ON_EMPTY_MAX: '3', DEVIN_CONNECT_RESCUE_MAX: '1' },
    });
    assert.equal(r.calls, 5, '1 + max(3) + rescueMax(1)');
  });

  // Each arm alone must be untouched by the split — this is the regression half of
  // criterion 4, and it is what would fail if the empty counter were advanced twice.
  it('the empty arm alone is unchanged: 1 + max', async () => {
    const r = await run([EMPTY]);
    assert.equal(r.calls, 3, '1 + RETRY_ON_EMPTY_MAX(2)');
  });

  it('the rescue arm alone is unchanged: 1 + rescueMax', async () => {
    const r = await run([REASONING_ONLY]);
    assert.equal(r.calls, 3, '1 + RESCUE_MAX(2)');
  });

  // One assertion per arm, and the FIRST turn has to be the one that arm reacts to.
  // The original single version led with a reasoning-only turn while the rescue budget was
  // already 0 — that turn is neither rescuable nor empty, so the request ended on call 1
  // and the empty arm's gate was never reached. It passed with the off switch deleted from
  // the empty arm, i.e. it asserted nothing about the thing it was named after.
  it('the master off switch covers the empty arm', async () => {
    const r = await run([EMPTY], { env: { DEVIN_CONNECT_RETRY_ON_EMPTY: '0' } });
    assert.equal(r.calls, 1,
      'DEVIN_CONNECT_RETRY_ON_EMPTY=0 means "stop speculative re-issues on this account". '
      + 'The split must not give the empty arm a path around it');
    delete process.env.DEVIN_CONNECT_RETRY_ON_EMPTY;
  });

  it('the master off switch covers the rescue arm', async () => {
    const r = await run([REASONING_ONLY], { env: { DEVIN_CONNECT_RETRY_ON_EMPTY: '0' } });
    assert.equal(r.calls, 1);
    delete process.env.DEVIN_CONNECT_RETRY_ON_EMPTY;
  });
});

describe('#240 — the empty arm reports its OWN count', () => {
  // What follows pins the operator-visible NUMBER, and only that. Be precise about the
  // limit, because the neighbouring property looks like it is covered here and is not:
  //
  //   covered      — the count in the log line (`retry 1/2` after a rescue, not `2/2`)
  //   NOT covered  — the backoff MULTIPLIER, `base × <empty retries>`
  //
  // Every test in this file sets DEVIN_CONNECT_RETRY_ON_EMPTY_MS=0, so a mutation that
  // keys the backoff to `emptyAttempt + rescueAttempt` sleeps 0ms either way and survives
  // (recorded as a documented survivor in test/mutations/retry-rescue-budget-split.json).
  // A wall-clock assertion would be the obvious cover and is deliberately not written:
  // suite load inflates the correct and the mutated path together, so no margin reliably
  // separates 350ms from 700ms — ledger round 4 has the sticky TTL assertion that went red
  // three times exactly this way. The harm left uncovered is one extra 350ms wait on an
  // already multi-call request; it cannot change how many upstream calls are made.
  it('the first empty retry after a rescue logs 1/2, not 2/2', async () => {
    const warns = [];
    const original = log.warn;
    log.warn = (...args) => { warns.push(args.join(' ')); };
    try {
      await run([REASONING_ONLY, EMPTY, ANSWER]);
    } finally {
      log.warn = original;
    }
    const emptyLines = warns.filter((w) => w.includes('empty completion'));
    assert.equal(emptyLines.length, 1, `expected one empty-retry log line, got:\n${warns.join('\n')}`);
    assert.match(emptyLines[0], /retry 1\/2/,
      'the empty arm must number its own retries. Reading the shared counter would print '
      + `2/2 here and halve the reported budget after any rescue. Got: ${emptyLines[0]}`);
  });

  it('a rescue still numbers itself independently', async () => {
    const warns = [];
    const original = log.warn;
    log.warn = (...args) => { warns.push(args.join(' ')); };
    try {
      await run([EMPTY, REASONING_ONLY, ANSWER]);
    } finally {
      log.warn = original;
    }
    const rescueLines = warns.filter((w) => w.includes('rescue retry'));
    assert.equal(rescueLines.length, 1);
    assert.match(rescueLines[0], /rescue retry 1\/2/,
      `an empty retry before it must not advance the rescue count. Got: ${rescueLines[0]}`);
  });
});
