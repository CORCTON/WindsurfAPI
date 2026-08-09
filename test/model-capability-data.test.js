// Upstream model capability data (GetCascadeModelConfigs ClientModelConfig).
//
// The cloud catalog merge used to keep only uid/provider/credit and throw the rest
// away, so every capability question — does this model accept images, what is its
// real output ceiling, may this account's tier use it at all — was answered from a
// hardcoded table or by spending a chat roundtrip and reading the failure. The
// upstream had already sent the answers in the same response.
//
// `disabled` is the load-bearing field: it is the upstream's own "this tier may not
// use this model", and it is what makes a tier-forbidden model distinguishable from
// a transient fault. The three-state handling is the point of most of these tests:
// true = told no, false = told yes, ABSENT = not told, and absent must never read
// as either answer.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCloudModels, getModelCaps, isModelDisabledUpstream } from '../src/models.js';
import { handleChatCompletions } from '../src/handlers/chat.js';

/** One upstream ClientModelConfig row, camelCase as Connect's JSON codec emits it. */
function config(uid, extra = {}) {
  return { modelUid: uid, provider: 'MODEL_PROVIDER_ANTHROPIC', creditMultiplier: 1, ...extra };
}

// Every case uses a distinct modelUid, so injected keys never collide across tests.

describe('cloud catalog keeps upstream capability data', () => {
  it('keeps supportsImages / maxTokens / costTier instead of discarding them', () => {
    mergeCloudModels([config('CAPS_FULL_MODEL', {
      supportsImages: true,
      maxTokens: 200000,
      modelCostTier: 'MODEL_COST_TIER_PREMIUM',
      modelInfo: { maxOutputTokens: 64000 },
      maxNumChatInputTokens: 180000,
    })]);

    const caps = getModelCaps('caps-full-model');
    assert.ok(caps, 'the merged model must carry capability data');
    assert.equal(caps.supportsImages, true);
    assert.equal(caps.maxTokens, 200000);
    assert.equal(caps.maxOutputTokens, 64000, 'modelInfo.maxOutputTokens is the real output ceiling');
    assert.equal(caps.maxInputTokens, 180000);
    assert.equal(caps.costTier, 'MODEL_COST_TIER_PREMIUM');
  });

  it('resolves caps through the uid alias, not just the normalized key', () => {
    mergeCloudModels([config('ALIAS_CAPS_MODEL', { supportsImages: true })]);
    // All three spellings the catalog registers must reach the same entry.
    assert.equal(getModelCaps('alias-caps-model')?.supportsImages, true);
    assert.equal(getModelCaps('ALIAS_CAPS_MODEL')?.supportsImages, true);
    assert.equal(getModelCaps('alias_caps_model')?.supportsImages, true);
  });

  it('omits fields the upstream stayed silent on rather than defaulting them', () => {
    mergeCloudModels([config('SPARSE_CAPS_MODEL', { supportsImages: true })]);
    const caps = getModelCaps('sparse-caps-model');

    assert.equal(caps.supportsImages, true);
    // Silence must be absence. A defaulted `false`/`0` here would let a caller
    // believe the upstream vouched for something it never mentioned.
    assert.equal('disabled' in caps, false, 'absent disabled must not materialize as false');
    assert.equal('maxTokens' in caps, false, 'absent maxTokens must not materialize as 0');
    assert.equal('costTier' in caps, false);
  });

  it('returns null for a model the catalog has no upstream data for', () => {
    // A statically-catalogued model carries no upstream capability data, and
    // inventing an empty object would be indistinguishable from "told nothing".
    assert.equal(getModelCaps('definitely-not-a-real-model-xyz'), null);
    assert.equal(getModelCaps(''), null);
    assert.equal(getModelCaps(null), null);
  });

  it('drops the caps object entirely when the row carried no capability fields', () => {
    mergeCloudModels([config('NO_CAPS_MODEL')]);
    // creditMultiplier/provider/uid are not capabilities, so there is nothing to keep.
    assert.equal(getModelCaps('no-caps-model'), null);
  });
});

describe('isModelDisabledUpstream — three-state, silence is not a "no"', () => {
  it('is true only when the upstream explicitly said disabled', () => {
    mergeCloudModels([config('TIER_BLOCKED_MODEL', {
      disabled: true,
      disabledReason: { shortReason: 'Upgrade required', description: 'Not in your plan' },
    })]);

    assert.equal(isModelDisabledUpstream('tier-blocked-model'), true);
    assert.equal(getModelCaps('tier-blocked-model').disabledReason, 'Upgrade required',
      'the short reason is real text for what used to be an opaque "model not enabled"');
  });

  it('is false when the upstream explicitly said NOT disabled', () => {
    mergeCloudModels([config('TIER_OK_MODEL', { disabled: false })]);
    assert.equal(isModelDisabledUpstream('tier-ok-model'), false);
    assert.equal(getModelCaps('tier-ok-model').disabled, false,
      'an explicit false must be recorded — it is a real upstream answer, not silence');
  });

  it('is false when the upstream said nothing — a preflight must not refuse on silence', () => {
    // The failure shape this pins: refusing on absent data would break every
    // statically-catalogued model and every account whose catalog has not synced.
    mergeCloudModels([config('TIER_SILENT_MODEL', { supportsImages: true })]);
    assert.equal(isModelDisabledUpstream('tier-silent-model'), false);
    assert.equal(isModelDisabledUpstream('never-heard-of-this-model'), false);
  });

  it('falls back to the description when no shortReason is given', () => {
    mergeCloudModels([config('DESC_ONLY_MODEL', {
      disabled: true,
      disabledReason: { description: 'Enterprise plans only' },
    })]);
    assert.equal(getModelCaps('desc-only-model').disabledReason, 'Enterprise plans only');
  });

  it('accepts a plain-string disabledReason', () => {
    mergeCloudModels([config('STR_REASON_MODEL', { disabled: true, disabledReason: 'Region blocked' })]);
    assert.equal(getModelCaps('str-reason-model').disabledReason, 'Region blocked');
  });
});

describe('chat preflight rejects an upstream-disabled model before any roundtrip', () => {
  it('answers 402 model_blocked with the upstream reason, without calling the backend', async () => {
    // The point of the preflight: pre-change, a tier-forbidden model spent a chat
    // roundtrip and came back with a permission_denied indistinguishable from a
    // transient fault, so the pool charged a health penalty for a request that
    // could never succeed. `calls` proves no backend was touched.
    mergeCloudModels([config('PREFLIGHT_BLOCKED_MODEL', {
      disabled: true,
      disabledReason: { shortReason: 'Upgrade to Pro to use this model' },
    })]);

    let calls = 0;
    const res = await handleChatCompletions(
      { model: 'preflight-blocked-model', messages: [{ role: 'user', content: 'hi' }] },
      {
        callerKey: 'preflight-test',
        waitForAccount() { calls++; return null; },
        ensureLs: async () => { calls++; },
        cascadeChat: async () => { calls++; return { text: '', toolCalls: [] }; },
      },
    );

    assert.equal(res.status, 402, 'a tier-disabled model must be refused, not attempted');
    assert.equal(res.body?.error?.type, 'model_blocked');
    assert.match(res.body.error.message, /Upgrade to Pro/,
      'the upstream reason must reach the caller instead of an opaque failure');
    assert.equal(calls, 0, 'no account may be claimed and no backend called for a refused model');
  });

  it('does NOT reject a model the upstream said is enabled, or one it never mentioned', async () => {
    // The fail-open direction. A preflight that refused on silence would break
    // every statically-catalogued model, so these must NOT produce a 402.
    mergeCloudModels([
      config('PREFLIGHT_OK_MODEL', { disabled: false }),
      config('PREFLIGHT_SILENT_MODEL', { supportsImages: true }),
    ]);

    for (const name of ['preflight-ok-model', 'preflight-silent-model']) {
      const res = await handleChatCompletions(
        { model: name, messages: [{ role: 'user', content: 'hi' }] },
        { callerKey: 'preflight-test', waitForAccount: () => null, ensureLs: async () => {} },
      );
      assert.notEqual(res.status, 402,
        `${name} must not be refused by the tier gate (status was ${res.status})`);
    }
  });
});
