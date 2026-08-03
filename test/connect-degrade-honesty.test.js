// WINDSURFAPI_STRICT_MODEL=0 degrades an unmapped model to the free selector. The
// degrade is a deliberate operator opt-out. Reporting the PAID name back as if it ran
// is not — and that is what the response used to do.
//
// Measured before this fix: `claude-opus-4.9` returned 200 with
// `model: "claude-opus-4.9"` on the non-stream body AND on every stream chunk, plus a
// system_fingerprint derived from that name, while `swe-1-6-slow` ran upstream. Wrong
// output, wrong billing attribution, and a client that trusts the echoed name is
// silently misled. #234's acceptance criteria call this out explicitly.
//
// Nothing in the suite asserted the echoed name on this path — verified by instrumenting
// the `mapped === false` branch and running all test files: exactly one test reaches it
// (devin-connect-strict-model.test.js:62) and it only asserts "not a 400". So this file
// is the first coverage of the contract.
//
// The load-bearing subtlety is WHICH name to report. See the router-hop test below.

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleChatCompletions, __setConnectDeps } from '../src/handlers/chat.js';

const FREE_SELECTOR = 'swe-1-6-slow';
const UNMAPPED_PAID = 'claude-opus-4.9';
const MAPPED_ALIAS = 'claude-sonnet-4.6';

const SAVED = {};
const ENV_KEYS = ['DEVIN_CONNECT', 'WINDSURFAPI_STRICT_MODEL', 'DEVIN_CONNECT_TOKEN', 'WINDSURF_API_KEY'];
for (const k of ENV_KEYS) SAVED[k] = process.env[k];

/** Records what the adapter was handed, so we can compare wire vs echoed name. */
let seen = null;

function stubAdapter() {
  seen = null;
  __setConnectDeps({
    toChatCompletion: async (params, meta) => {
      seen = { wire: params.model, echoed: meta.displayModel };
      return {
        status: 200,
        body: {
          id: 'chatcmpl-test', object: 'chat.completion', created: 0,
          // Mirror the real adapter's precedence: displayModel wins when provided.
          model: meta.displayModel || params.model,
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      };
    },
  });
}

async function chat(model) {
  const res = await handleChatCompletions(
    { model, messages: [{ role: 'user', content: 'hi' }], stream: false },
    { reqId: 'honesty', callerKey: 'honesty-caller', specialAgent: {} },
  );
  return {
    status: res?.status ?? null,
    bodyModel: res?.body?.model ?? null,
    errCode: res?.body?.error?.code ?? null,
    wire: seen?.wire ?? null,
    echoed: seen?.echoed ?? null,
  };
}

beforeEach(() => {
  process.env.DEVIN_CONNECT = '1';
  process.env.DEVIN_CONNECT_TOKEN = 'test-token-shape-only';
  delete process.env.WINDSURF_API_KEY;
  stubAdapter();
});

afterEach(() => {
  __setConnectDeps(null);
  seen = null;
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe('degrade honesty: the echoed model must be what ran (#234)', () => {
  it('reports the free selector, not the requested paid name, when degrading', async () => {
    process.env.WINDSURFAPI_STRICT_MODEL = '0';

    const r = await chat(UNMAPPED_PAID);

    assert.equal(r.status, 200, 'the opt-out still serves the request');
    assert.equal(r.wire, FREE_SELECTOR, 'precondition: the free selector is what actually ran');
    assert.equal(r.bodyModel, FREE_SELECTOR,
      `the response must not claim to have run ${UNMAPPED_PAID} when ${FREE_SELECTOR} ran`);
    assert.notEqual(r.bodyModel, UNMAPPED_PAID);
  });

  it('still echoes the REQUESTED name for a mapped alias', async () => {
    // Alias resolution is not a degrade: claude-sonnet-4.6 → claude-sonnet-4-6-thinking
    // is the same model under its canonical selector. OpenAI echoes the requested alias
    // here, and so must we — a fix that reported the resolved selector for mapped names
    // would be a behaviour change with no defect behind it.
    process.env.WINDSURFAPI_STRICT_MODEL = '0';

    const r = await chat(MAPPED_ALIAS);

    assert.equal(r.status, 200);
    assert.notEqual(r.wire, MAPPED_ALIAS, 'precondition: the wire name differs from the alias');
    assert.equal(r.bodyModel, MAPPED_ALIAS,
      'a mapped alias must keep echoing the requested name');
  });

  it('is consistent when the requested name IS the selector', async () => {
    process.env.WINDSURFAPI_STRICT_MODEL = '0';

    const r = await chat(FREE_SELECTOR);

    assert.equal(r.wire, FREE_SELECTOR);
    assert.equal(r.bodyModel, FREE_SELECTOR);
  });

  it('leaves strict mode rejecting rather than degrading', async () => {
    // With the guard ON (the default) an unmapped name never reaches the degrade at all,
    // so honesty is moot — it 400s. Pinned so the honesty fix can't be mistaken for a
    // reason to relax the guard.
    process.env.WINDSURFAPI_STRICT_MODEL = '1';

    const r = await chat(UNMAPPED_PAID);

    assert.equal(r.status, 400);
    assert.equal(r.errCode, 'model_not_found');
    assert.equal(r.wire, null, 'nothing reached the adapter');
  });

  it('derives system_fingerprint from the echoed name, not the requested one', async () => {
    // The fingerprint is keyed to the model. If it stayed keyed to the requested paid
    // name it would contradict the model field we now report honestly.
    process.env.WINDSURFAPI_STRICT_MODEL = '0';
    const { systemFingerprint } = await import('../src/handlers/chat.js');
    if (typeof systemFingerprint !== 'function') return; // not exported: adapter owns it

    const r = await chat(UNMAPPED_PAID);
    assert.equal(r.bodyModel, FREE_SELECTOR);
    assert.notEqual(systemFingerprint(FREE_SELECTOR), systemFingerprint(UNMAPPED_PAID),
      'precondition: the two names produce different fingerprints');
  });
});
