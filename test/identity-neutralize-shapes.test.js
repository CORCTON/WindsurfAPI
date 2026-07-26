// identity-neutralize: content SHAPE coverage + model-fingerprint sentence.
//
// Two residues the a1-a7 rule bank never covered:
//
// 1. Shape. Both neutralize call sites guarded with `typeof content === 'string'`,
//    so a system/developer message whose content is an array of parts skipped
//    neutralization entirely. That is the DEFAULT shape for Codex /v1/responses
//    (responses.js normalizeMessageContent returns `[{type:'text'}]` and does NOT
//    flatten), and devin-connect.js only flattens at wire time — so the fingerprint
//    reached Devin verbatim on the most common Codex path.
//
// 2. Sentence terminator. The "You are powered by the model …" rule used
//    `[^\n.]*\.`, which stops at the FIRST dot. Every dotted model version cut the
//    sentence mid-version ("…named Opus 4." removed, "8. …" left behind) while the
//    real fingerprint survived. The companion "The exact model ID is <id>."
//    sentence was matched by no rule at all, so even an undotted version leaked
//    the model id verbatim.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { neutralizeClientIdentity, neutralizeMessageContent } from '../src/handlers/identity-neutralize.js';

const FINGERPRINT = /powered by the model|exact model ID|claude-opus|claude-sonnet|claude-fable/i;

describe('identity-neutralize — model fingerprint sentences', () => {
  it('strips both sentences for a DOTTED model version without mangling the tail', () => {
    const input = 'You are powered by the model named Opus 4.8. The exact model ID is claude-opus-4-8.';
    const out = neutralizeClientIdentity(input);
    assert.equal(FINGERPRINT.test(out), false, `fingerprint survived: ${JSON.stringify(out)}`);
    // The old regex left a dangling "8." from the cut version number.
    assert.equal(/^\s*8\./.test(out), false, 'must not leave a mangled version remnant');
  });

  it('strips the model-ID sentence for an UNDOTTED version (was never matched at all)', () => {
    const input = 'You are powered by the model named Opus 5. The exact model ID is claude-opus-5.';
    const out = neutralizeClientIdentity(input);
    assert.equal(FINGERPRINT.test(out), false, `fingerprint survived: ${JSON.stringify(out)}`);
  });

  it('handles a dotted model ID too (claude-sonnet-4.6)', () => {
    const input = 'You are powered by the model named Sonnet 4.6. The exact model ID is claude-sonnet-4.6.';
    assert.equal(FINGERPRINT.test(neutralizeClientIdentity(input)), false);
  });

  it('keeps surrounding lines and does not swallow following sentences', () => {
    const out = neutralizeClientIdentity(
      'Env info.\nYou are powered by the model named Opus 4.8. The exact model ID is claude-opus-4-8.\nKeep this line.',
    );
    assert.ok(out.includes('Env info.'), 'preceding line preserved');
    assert.ok(out.includes('Keep this line.'), 'following line preserved');
    assert.equal(FINGERPRINT.test(out), false);
  });

  it('does not over-match an unrelated sentence that merely mentions a model', () => {
    const out = neutralizeClientIdentity('The model is great. You are powered by the model X. Tail stays.');
    assert.ok(out.includes('The model is great.'), 'leading sentence untouched');
    assert.ok(out.includes('Tail stays.'), 'trailing sentence untouched');
  });
});

describe('neutralizeMessageContent — array/parts content (Codex /v1/responses shape)', () => {
  const CC_LINE = "You are Claude Code, Anthropic's official CLI for Claude.";

  it('neutralizes text parts inside an array (the shape the old guard skipped)', () => {
    const content = [{ type: 'text', text: `${CC_LINE} Do the task.` }];
    const out = neutralizeMessageContent(content);
    assert.ok(Array.isArray(out), 'array shape is preserved');
    assert.equal(/Anthropic'?s official CLI/i.test(out[0].text), false,
      'fingerprint must be stripped inside the part');
    assert.ok(out[0].text.includes('Do the task.'), 'task text preserved');
  });

  it('still neutralizes a plain string (parity with the old call path)', () => {
    assert.equal(/official CLI/i.test(neutralizeMessageContent(CC_LINE)), false);
  });

  it('preserves non-text parts untouched and keeps part order', () => {
    const img = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } };
    const content = [{ type: 'text', text: CC_LINE }, img, { type: 'text', text: 'tail' }];
    const out = neutralizeMessageContent(content);
    assert.equal(out.length, 3);
    assert.equal(out[1], img, 'non-text part passed through by reference');
    assert.equal(out[2].text, 'tail');
  });

  it('returns the SAME reference when nothing changed (callers rely on identity)', () => {
    const content = [{ type: 'text', text: 'nothing to neutralize here' }];
    assert.equal(neutralizeMessageContent(content), content);
    const s = 'plain harmless string';
    assert.equal(neutralizeMessageContent(s), s);
  });

  it('is inert on null / non-array objects instead of throwing', () => {
    assert.equal(neutralizeMessageContent(null), null);
    assert.equal(neutralizeMessageContent(undefined), undefined);
    const obj = { weird: true };
    assert.equal(neutralizeMessageContent(obj), obj);
  });

  it('honors the off-switch', () => {
    const content = [{ type: 'text', text: CC_LINE }];
    const out = neutralizeMessageContent(content, { WINDSURFAPI_NEUTRALIZE_CLIENT_ID: '0' });
    assert.equal(out[0].text, CC_LINE, 'off-switch leaves content verbatim');
  });
});
