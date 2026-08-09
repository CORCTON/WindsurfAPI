// Unit tests for the incremental reasoning/content duplicate suppression module
// (src/reasoning-dedup.js) — the T4 rework. These cover the release behavior
// directly at the string level; no SSE harness needed.
//
// Policy under test:
//   - while content byte-matches a prefix of the accumulated reasoning it may
//     be held in a tiny buffer that lives fractions of a second;
//   - the moment content diverges from the reasoning prefix, everything held
//     so far plus the current chunk is emitted and the stream passes through
//     with no further delay;
//   - suppression fires ONLY at settle() when the accumulated content equals
//     the FULL reasoning byte-for-byte AND the caller explicitly requested
//     thinking (reasoning_content visible to them). A strict prefix
//     (content shorter, stream ends there) is released, never suppressed;
//   - release() is the failure path: it returns the held tail unconditionally.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStreamReasoningDedup, isReasoningDedupEnabled } from '../src/reasoning-dedup.js';

describe('reasoning-dedup (incremental)', () => {
  it('diverges on the FIRST content chunk — one non-prefix chunk is emitted immediately, not held', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('ab');
    assert.deepEqual(d.feed('xy'), { emit: 'xy', hold: false });
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
  });

  it('diverges mid-stream — matching chunks held, then emit = held + chunk at once; later chunks pass through', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('abcde');
    assert.deepEqual(d.feed('ab'), { emit: '', hold: true });
    assert.deepEqual(d.feed('c'), { emit: '', hold: true });
    assert.deepEqual(d.feed('X'), { emit: 'abcX', hold: false });
    // Already diverged → passthrough forever, even if a chunk would match a
    // prefix again ('ab' IS a prefix of 'abcde' but must NOT be re-held).
    assert.deepEqual(d.feed('ab'), { emit: 'ab', hold: false });
    assert.deepEqual(d.feed('zz'), { emit: 'zz', hold: false });
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
  });

  it('divergence latches — after the first mismatch, chunks that match the reasoning prefix still pass through immediately (no re-hold, no stream delay)', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('abcde');
    assert.deepEqual(d.feed('ab'), { emit: '', hold: true });
    assert.deepEqual(d.feed('X'), { emit: 'abX', hold: false });
    // 'abc' is a prefix of 'abcde' — with a latched divergence it must be
    // emitted in this same frame, never held for a later release.
    assert.deepEqual(d.feed('abc'), { emit: 'abc', hold: false });
    assert.deepEqual(d.feed('yz'), { emit: 'yz', hold: false });
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
  });

  it('full identity when wantThinking: false (default) — content chunks together == reasoning, all held, settle emits held', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('Let me think carefully');
    assert.deepEqual(d.feed('Let me '), { emit: '', hold: true });
    assert.deepEqual(d.feed('think'), { emit: '', hold: true });
    assert.deepEqual(d.feed(' carefully'), { emit: '', hold: true });
    assert.deepEqual(d.settle(), { emit: 'Let me think carefully', suppressed: false });
  });

  it('full identity when wantThinking: true — content chunks together == reasoning, all held, settle suppresses', () => {
    const d = createStreamReasoningDedup({ wantThinking: true });
    d.noteReasoning('Let me think carefully');
    assert.deepEqual(d.feed('Let me '), { emit: '', hold: true });
    assert.deepEqual(d.feed('think'), { emit: '', hold: true });
    assert.deepEqual(d.feed(' carefully'), { emit: '', hold: true });
    assert.deepEqual(d.settle(), { emit: '', suppressed: true });
  });

  it('reasoning cut off earlier than content — content extends past the end of the reasoning, everything emitted, nothing suppressed', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('ab');
    assert.deepEqual(d.feed('a'), { emit: '', hold: true });
    // 'ab' is still a prefix of 'ab' → held.
    assert.deepEqual(d.feed('b'), { emit: '', hold: true });
    // 'abc' is NOT a prefix of 'ab' → divergence at exactly this moment.
    assert.deepEqual(d.feed('c'), { emit: 'abc', hold: false });
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
  });

  it('empty reasoning — feed passes through immediately', () => {
    const d = createStreamReasoningDedup();
    assert.deepEqual(d.feed('hello'), { emit: 'hello', hold: false });
    assert.deepEqual(d.feed('world'), { emit: 'world', hold: false });
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
  });

  it('multi-chunk prefix — a long prefix split across many chunks stays held, then release works', () => {
    const d = createStreamReasoningDedup({ wantThinking: true });
    const reasoning = 'The quick brown fox jumps over the lazy dog — a long reasoning string.';
    d.noteReasoning(reasoning);
    for (const ch of reasoning) {
      assert.deepEqual(d.feed(ch), { emit: '', hold: true });
    }
    assert.deepEqual(d.settle(), { emit: '', suppressed: true });

    // Release variant: same long held prefix, then a diverging chunk.
    const d2 = createStreamReasoningDedup();
    d2.noteReasoning('abcdefghijklmnop');
    for (const ch of 'abcdefghij'.split('')) {
      assert.deepEqual(d2.feed(ch), { emit: '', hold: true });
    }
    assert.deepEqual(d2.feed('XYZ'), { emit: 'abcdefghijXYZ', hold: false });
    assert.deepEqual(d2.settle(), { emit: '', suppressed: false });
  });

  it('non-stream path — no feed/noteReasoning used, settle is a no-op; chat.js non-stream response path carries no dedup', () => {
    const d = createStreamReasoningDedup();
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
    // The instance stays usable after settle.
    assert.deepEqual(d.feed('x'), { emit: 'x', hold: false });

    // The non-stream handler must not reference the dedup at all: it buffers
    // the whole answer and flushes it once, so there is nothing to dedup.
    const chatSource = readFileSync(new URL('../src/handlers/chat.js', import.meta.url), 'utf8');
    const nonStreamStart = chatSource.indexOf('async function nonStreamResponse');
    const streamStart = chatSource.indexOf('function streamResponse');
    assert.ok(nonStreamStart !== -1, 'nonStreamResponse must exist');
    assert.ok(streamStart !== -1 && streamStart > nonStreamStart, 'streamResponse must follow nonStreamResponse');
    assert.ok(!chatSource.slice(nonStreamStart, streamStart).includes('reasoningDedup'),
      'non-stream path must be untouched by the dedup');
  });

  it('empty-string chunk handling — feed("") returns { emit: "", hold: false } and does not disturb holding', () => {
    const d = createStreamReasoningDedup({ wantThinking: true });
    d.noteReasoning('ab');
    assert.deepEqual(d.feed(''), { emit: '', hold: false });
    d.noteReasoning(''); // ignored
    assert.deepEqual(d.feed('ab'), { emit: '', hold: true });
    assert.deepEqual(d.settle(), { emit: '', suppressed: true });
  });

  it('strict prefix — content ends where the reasoning continues: settle() RELEASES the held tail (never an empty answer)', () => {
    // The one shape that used to produce an empty client reply: the answer
    // restates the first sentence of the reasoning and the stream ends there.
    const d = createStreamReasoningDedup();
    d.noteReasoning('The answer is 42 because of X.');
    assert.deepEqual(d.feed('The answer '), { emit: '', hold: true });
    assert.deepEqual(d.feed('is 42'), { emit: '', hold: true });
    // Content is a byte-identical STRICT prefix of the reasoning, stream ends.
    assert.deepEqual(d.settle(), { emit: 'The answer is 42', suppressed: false });
  });

  it('release() — failure path returns the held tail unconditionally, even a full duplicate', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('exact duplicate');
    assert.deepEqual(d.feed('exact duplicate'), { emit: '', hold: true });
    // settle() would suppress this; the failure path must not.
    assert.equal(d.release(), 'exact duplicate');
    // Cleared: a later settle() is a no-op.
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
    assert.equal(d.release(), '');
  });

  it('held cap — crossing HELD_CAP latches divergence and flushes instead of holding an unbounded buffer', () => {
    const d = createStreamReasoningDedup();
    const big = 'a'.repeat(1024 * 1024 + 1);
    d.noteReasoning(big + 'tail');
    // Candidate exceeds the 1 MiB cap while still a prefix of the reasoning.
    assert.deepEqual(d.feed(big), { emit: big, hold: false });
    // Divergence latched: even a matching chunk passes through now.
    assert.deepEqual(d.feed('a'), { emit: 'a', hold: false });
    assert.deepEqual(d.settle(), { emit: '', suppressed: false });
  });
});

// The off-switch. This is the only default-ON behaviour change in the
// session-fidelity batch and its failure shape is content loss, so an operator
// must be able to disable it without a redeploy.
describe('isReasoningDedupEnabled — off-switch (default ON)', () => {
  it('defaults to ON when the variable is absent', () => {
    assert.equal(isReasoningDedupEnabled({}), true);
  });

  it('only the exact string "0" disables it', () => {
    assert.equal(isReasoningDedupEnabled({ WINDSURFAPI_REASONING_DEDUP: '0' }), false);
    assert.equal(isReasoningDedupEnabled({ WINDSURFAPI_REASONING_DEDUP: '1' }), true);
  });

  it('an EMPTY value keeps it ON, not off', () => {
    // `.env` with a bare `WINDSURFAPI_REASONING_DEDUP=` must not silently
    // disable a default-on safety path. Number('') === 0 passing a `>= 0`
    // check has silently disabled a knob in this repo before (#241, #242).
    //
    // Measured note on the guard's strength: dropping the `|| '1'` fallback is
    // an EQUIVALENT transform, not an escaped defect — `String('')` is `''`,
    // which already `!== '0'`. So this assertion pins the *contract* (empty
    // means on) rather than that one expression; it would catch a rewrite to
    // `Number(...)` or `!env.X`, which are the shapes that actually broke
    // sibling knobs. Recorded here so the next reader does not mistake a
    // surviving mutation on line 88 for a hole.
    assert.equal(isReasoningDedupEnabled({ WINDSURFAPI_REASONING_DEDUP: '' }), true);
    assert.equal(isReasoningDedupEnabled({ WINDSURFAPI_REASONING_DEDUP: '00' }), true);
    assert.equal(isReasoningDedupEnabled({ WINDSURFAPI_REASONING_DEDUP: 'false' }), true);
  });

  it('a Number()-style rewrite would be caught (the shape that broke sibling knobs)', () => {
    // Drives the contract the comment above names: if someone "simplifies"
    // the check to Number()/falsy semantics, an empty or '00' value flips to
    // disabled. Pinning it behaviourally so the refactor fails here.
    const numberStyle = (env) => Number(env.WINDSURFAPI_REASONING_DEDUP ?? 1) !== 0;
    assert.equal(numberStyle({ WINDSURFAPI_REASONING_DEDUP: '' }), false,
      'Number("") === 0 — this is the trap; the real implementation must not behave this way');
    assert.notEqual(
      isReasoningDedupEnabled({ WINDSURFAPI_REASONING_DEDUP: '' }),
      numberStyle({ WINDSURFAPI_REASONING_DEDUP: '' }),
    );
  });

  // Behavioural, not a source grep: drive the two wirings chat.js builds
  // (dedup instance vs null) and assert what reaches the wire. If the
  // switch stopped being honoured, the first assertion fails.
  it('OFF passes the duplicate through; ON suppresses it', () => {
    const R = 'The answer is 42.';
    const wire = (env) => {
      const dedup = isReasoningDedupEnabled(env)
        ? createStreamReasoningDedup({ wantThinking: true })
        : null;
      const sent = [];
      dedup?.noteReasoning(R);
      for (const chunk of [R.slice(0, 5), R.slice(5)]) {
        if (dedup) {
          const { emit, hold } = dedup.feed(chunk);
          if (!hold && emit) sent.push(emit);
        } else {
          sent.push(chunk);
        }
      }
      const settled = dedup?.settle() ?? { emit: '', suppressed: false };
      if (settled.emit) sent.push(settled.emit);
      return { text: sent.join(''), suppressed: settled.suppressed };
    };

    // Disabled: the client gets the whole answer even though it duplicates
    // the reasoning channel — identical to a stream with no dedup at all.
    assert.deepEqual(wire({ WINDSURFAPI_REASONING_DEDUP: '0' }), { text: R, suppressed: false });
    // Default: suppressed, because wantThinking is true.
    assert.deepEqual(wire({}), { text: '', suppressed: true });
  });
});
