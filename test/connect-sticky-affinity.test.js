// DEVIN_CONNECT prompt-cache affinity.
//
// setStickyBinding was only reached from the two Cascade success paths, so on a
// connect-only deployment STICKY_SESSION_ENABLED=1 bound nothing: getApiKey's
// lookup missed on every turn and the candidate sort (which ends on `lastUsed`
// ascending) then moved each turn of a conversation to a different account.
// Upstream prompt caches are per-account, so that re-wrote the whole accumulated
// context every turn instead of reading it back.
//
// The invariant this suite pins: the connect path acquires with modelKey=null
// (acquireConnectAccount / acquireConnectFailover both pass null), so the
// binding must be WRITTEN with null as well — bindingKey() is
// `callerKey\0(modelKey || '*')`, and a mismatch is silent (it degrades to the
// exact no-op this fix removes).
//
// ⚠️ sticky-session.js reads STICKY_SESSION_ENABLED into a module-load const, so
// the env has to be set before the first import. node:test gives each file its
// own process, so setting it at the top of this file is enough.

process.env.STICKY_SESSION_ENABLED = '1';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sticky = await import('../src/account/sticky-session.js');
const { bindConnectSticky } = await import('../src/handlers/chat.js');

const CALLER = 'api:deadbeefdeadbeefdeadbeefdeadbeef:user:abc123';

describe('connect sticky affinity — key shape must match the connect-path lookup', () => {
  beforeEach(() => sticky.resetAllBindings());

  it('binds under the null-modelKey slot the connect path looks up', () => {
    bindConnectSticky(CALLER, { id: 'acct-1', apiKey: 'sk-live-1' });
    // acquireConnectAccount / acquireConnectFailover both call getApiKey with
    // modelKey=null, so this is the only lookup that matters for the connect path.
    const bound = sticky.getStickyBinding(CALLER, null);
    assert.ok(bound, 'connect-path lookup (modelKey=null) must resolve');
    assert.equal(bound.accountId, 'acct-1');
    assert.equal(bound.apiKey, 'sk-live-1');
  });

  it('a model-scoped binding would NOT satisfy the connect lookup (regression guard)', () => {
    // Writing with a concrete modelKey is the mistake this fix has to avoid:
    // bindingKey() would be `caller\0gpt-...` while the lookup asks for
    // `caller\0*`, so every turn silently misses and rotation resumes.
    sticky.setStickyBinding(CALLER, 'gpt-5-6-sol-max', 'acct-2', 'sk-live-2');
    assert.equal(sticky.getStickyBinding(CALLER, null), null,
      'model-scoped write must not be visible to the null lookup');
  });

  it('rebinds to the account that most recently served the caller', () => {
    bindConnectSticky(CALLER, { id: 'acct-1', apiKey: 'sk-live-1' });
    bindConnectSticky(CALLER, { id: 'acct-9', apiKey: 'sk-live-9' });
    assert.equal(sticky.getStickyBinding(CALLER, null).accountId, 'acct-9',
      'after a failover hop the new account owns the cache and must be pinned');
  });
});

describe('connect sticky affinity — inert on every incomplete input', () => {
  beforeEach(() => sticky.resetAllBindings());

  it('no callerKey, no account, or no account id writes nothing', () => {
    bindConnectSticky('', { id: 'acct-1', apiKey: 'sk-1' });
    bindConnectSticky(CALLER, null);
    bindConnectSticky(CALLER, undefined);
    bindConnectSticky(CALLER, { apiKey: 'sk-1' }); // env-token fallback: no pooled id
    // getStickyStats().creates is cumulative for the module's lifetime, so assert
    // on the binding table itself rather than the counter.
    assert.equal(sticky.getStickyBinding(CALLER, null), null, 'nothing may be bound');
  });

  it('never throws — affinity is best-effort and must not fail a served request', () => {
    assert.doesNotThrow(() => bindConnectSticky(CALLER, { id: 'acct-1' }));
    assert.doesNotThrow(() => bindConnectSticky(CALLER, { id: 'acct-1', apiKey: null }));
  });
});
