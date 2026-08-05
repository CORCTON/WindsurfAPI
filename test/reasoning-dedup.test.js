// Thinking-core T4 root dedup — unit tests for the stream decision helper.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStreamReasoningDedup } from '../src/reasoning-dedup.js';

describe('createStreamReasoningDedup', () => {
  it('passes content straight through when no reasoning was seen', () => {
    const d = createStreamReasoningDedup();
    assert.equal(d.holdOrPass('hello '), 'hello ');
    assert.equal(d.holdOrPass('world'), 'world');
    assert.equal(d.settle(), '', 'nothing held → nothing to flush');
  });

  it('suppresses content that duplicates the streamed reasoning verbatim', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('step one. ');
    d.noteReasoning('step two.');
    assert.equal(d.holdOrPass('step one. '), '', 'held, not emitted');
    assert.equal(d.holdOrPass('step two.'), '');
    assert.equal(d.settle(), '', 'verbatim duplicate suppressed at settle');
  });

  it('flushes held content when it differs from the reasoning', () => {
    const d = createStreamReasoningDedup();
    d.noteReasoning('the deliberation');
    assert.equal(d.holdOrPass('the answer'), '');
    assert.equal(d.settle(), 'the answer');
  });

  it('content arriving before any reasoning emits immediately (reversed order)', () => {
    const d = createStreamReasoningDedup();
    assert.equal(d.holdOrPass('early'), 'early');
    d.noteReasoning('late reasoning');
    assert.equal(d.holdOrPass('late'), '');
    assert.equal(d.settle(), 'late', 'only the post-reasoning part was held');
  });

  it('empty inputs are inert', () => {
    const d = createStreamReasoningDedup();
    assert.equal(d.holdOrPass(''), '');
    d.noteReasoning('');
    assert.equal(d.settle(), '');
  });
});
