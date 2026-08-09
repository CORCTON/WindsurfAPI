import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGetChatMessageRequest, __testing } from '../src/devin-connect.js';
import { parseFields, getField } from '../src/proto.js';

// CompletionConfiguration #2/#3 tag swap.
//
// The encoder had max_tokens and max_newlines transposed: #2 received the 128000
// context window and #3 received the caller's output cap. Four independent .proto
// definitions agree the schema is #2 = max_tokens, #3 = max_newlines.
//
// The defect was invisible on the wire (both fields are plausible varints, and a
// large max_newlines is a no-op), so the request kept succeeding — while max_tokens
// sat pinned at the context window, i.e. effectively uncapped. The free-tier probe
// that varied maxTokens 16 → 1000 and saw identical output was reading exactly
// this: the cap never reached the field that enforces it.
//
// These assertions are byte-level on purpose. A test that reads the same struct
// the encoder writes cannot distinguish a swap; the tag byte is the thing at stake.

const TOKEN = 'devin-session-token$test.jwt.sig';
const { buildCompletionConfig } = __testing;

// varint tags: (field << 3) | wireType 0 → #2 = 0x10, #3 = 0x18.
const TAG_MAX_TOKENS = 0x10;
const TAG_MAX_NEWLINES = 0x18;

function completionConfigOf(proto) {
  return parseFields(getField(parseFields(proto), 8, 2).value);
}

describe('CompletionConfiguration tag map — #2 = max_tokens, #3 = max_newlines', () => {
  it('places maxTokens at #2 and contextWindow at #3', () => {
    const buf = buildCompletionConfig({ maxTokens: 777, contextWindow: 64000 });
    const fields = parseFields(buf);
    assert.equal(getField(fields, 2, 0).value, 777, '#2 must carry the output cap');
    assert.equal(getField(fields, 3, 0).value, 64000, '#3 must carry max_newlines');
  });

  it('emits the literal tag bytes 0x10 (#2) then 0x18 (#3), in that order', () => {
    // Values chosen to be single-byte varints so the tag/value pairs are exact:
    // 0x10 0x07 = #2 varint 7, 0x18 0x09 = #3 varint 9.
    const buf = buildCompletionConfig({ maxTokens: 7, contextWindow: 9 });
    const i2 = buf.indexOf(Buffer.from([TAG_MAX_TOKENS, 7]));
    const i3 = buf.indexOf(Buffer.from([TAG_MAX_NEWLINES, 9]));
    assert.ok(i2 >= 0, `expected tag 0x10 + value 7 in ${buf.toString('hex')}`);
    assert.ok(i3 >= 0, `expected tag 0x18 + value 9 in ${buf.toString('hex')}`);
    assert.ok(i2 < i3, 'field order must stay ascending (#2 before #3)');
    // The swap's signature: the cap must NOT appear behind the #3 tag.
    assert.equal(buf.indexOf(Buffer.from([TAG_MAX_NEWLINES, 7])), -1,
      'output cap must not ride max_newlines (#3) — that is the swapped wire');
    assert.equal(buf.indexOf(Buffer.from([TAG_MAX_TOKENS, 9])), -1,
      'max_newlines must not ride max_tokens (#2)');
  });

  it('defaults keep 4096 on #2 and 128000 on #3 (not the reverse)', () => {
    const fields = parseFields(buildCompletionConfig({}));
    assert.equal(getField(fields, 2, 0).value, 4096, 'DEFAULT_MAX_TOKENS on #2');
    assert.equal(getField(fields, 3, 0).value, 128000, 'DEFAULT_CONTEXT_WINDOW on #3');
  });

  it('a caller cap of 256 is enforceable: 4096 no longer leaks into #2', () => {
    // Pre-fix, #2 was always the context window, so the encoded max_tokens was
    // 128000 regardless of what the caller asked for.
    const fields = parseFields(buildCompletionConfig({ maxTokens: 256 }));
    assert.equal(getField(fields, 2, 0).value, 256);
    assert.notEqual(getField(fields, 2, 0).value, 128000);
  });

  it('end-to-end: max_tokens from a request reaches #8.#2 on the real wire', () => {
    const proto = buildGetChatMessageRequest({
      token: TOKEN, model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      completion: { maxTokens: 1024 },
    });
    const comp = completionConfigOf(proto);
    assert.equal(getField(comp, 2, 0).value, 1024);
    assert.equal(getField(comp, 3, 0).value, 128000);
  });

  it('the swap does not disturb the neighbouring calibrated fields', () => {
    // #1, #5 temperature, #7 top_k and #8 top_p come from a working live capture;
    // only #2/#3 were re-tagged.
    const comp = completionConfigOf(buildGetChatMessageRequest({
      token: TOKEN, model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      completion: { maxTokens: 64, temperature: 0.7, topP: 0.5, topK: 100 },
    }));
    assert.equal(getField(comp, 1, 0).value, 1);
    assert.equal(getField(comp, 7, 0).value, 100);
    assert.ok(Math.abs(getField(comp, 5, 1).value.readDoubleLE(0) - 0.7) < 1e-9);
    assert.ok(Math.abs(getField(comp, 8, 1).value.readDoubleLE(0) - 0.5) < 1e-9);
  });
});
