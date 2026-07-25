// Model-access policy must gate EVERY backend, not just the one it happens to
// precede in the handler.
//
// REGRESSION (2026-07-25, live-confirmed): the dashboard allowlist/blocklist gate
// sat AFTER the DEVIN_CONNECT short-circuit in _handleChatCompletionsInner. With
// DEVIN_CONNECT=1 — the default for the packaged exe and the recommended
// binary-less config — a blocked model was served normally: the request
// short-circuited into the connect branch and returned 200 before the gate ever
// ran. Reproduced end-to-end (blocklist ["gpt-5.4-mini-low"] → request returned
// content), then fixed by hoisting the gate above the short-circuit.
//
// The existing model-access tests all exercise isModelAllowed() directly, so they
// stayed green throughout the bypass — the defect was in the WIRING ORDER, not the
// predicate. These tests lock the ordering invariant itself.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAT = readFileSync(join(__dirname, '..', 'src', 'handlers', 'chat.js'), 'utf8');

describe('model-access gate covers every backend branch', () => {
  it('the isModelAllowed gate runs BEFORE the DEVIN_CONNECT short-circuit', () => {
    const gate = CHAT.indexOf('let access = isModelAllowed(routingModelKey)');
    const shortCircuit = CHAT.indexOf("selectBackend({ modelInfo }).flow === 'devin_connect'");

    assert.ok(gate !== -1, 'the model-access gate must exist in the chat handler');
    assert.ok(shortCircuit !== -1, 'the DEVIN_CONNECT short-circuit must exist');
    assert.ok(
      gate < shortCircuit,
      'model-access gate must precede the DEVIN_CONNECT short-circuit — otherwise a '
      + 'blocked model is served whenever DEVIN_CONNECT=1 (operator policy bypass)',
    );
  });

  it('the gate also precedes special-agent and Cascade routing', () => {
    const gate = CHAT.indexOf('let access = isModelAllowed(routingModelKey)');
    const specialAgent = CHAT.indexOf("backendSel.flow === 'special_agent'");
    assert.ok(specialAgent !== -1, 'special-agent routing must exist');
    assert.ok(gate < specialAgent, 'model-access gate must precede special-agent routing');
  });

  it('the DEVIN_CONNECT branch honours an access retarget instead of the raw request model', () => {
    // The connect branch resolves its selector from the RAW request name (its own
    // namespace), NOT routingModelKey — so the access fallback has to be threaded
    // in explicitly or a retargeted request would still serve the blocked model.
    assert.match(
      CHAT,
      /const reqModelName = accessFallbackModel \|\| reqModel \|\| config\.defaultModel;/,
      'the connect branch must prefer accessFallbackModel so a blocked→default retarget applies',
    );
    assert.match(
      CHAT,
      /accessFallbackModel = fallbackRaw;/,
      'the access fallback must record the operator-configured model name',
    );
  });

  it('a blocked model with no configured default is rejected 403 model_blocked', () => {
    assert.match(
      CHAT,
      /status: 403, body: \{ error: \{ message: access\.reason, type: 'model_blocked' \} \}/,
      'rejection path must return 403 model_blocked',
    );
  });
});
