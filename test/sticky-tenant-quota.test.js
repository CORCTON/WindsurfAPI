// Sticky binding table: per-tenant fair share + LRU ordering.
//
// Eviction used to be a single global LRU with no per-caller quota, so one
// tenant minting fresh callerKeys (a distinct body.user per request → a distinct
// 16-hex subKey → a distinct binding) filled the table and evicted every OTHER
// tenant's live binding — silently destroying their affinity and re-imposing the
// ~10x cache-write cost on victims. Each at-capacity insert also did a full
// O(MAX_BINDINGS) scan on the request hot path.
//
// The tenant is the callerKey's API-key prefix (`api:<hash>`), not the whole
// callerKey — that is the unit an attacker cannot mint more of.

process.env.STICKY_SESSION_ENABLED = '1';
process.env.STICKY_SESSION_MAX = '8';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const sticky = await import('../src/account/sticky-session.js');

const VICTIM = 'api:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const FLOODER = 'api:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('sticky binding table — per-tenant fair share', () => {
  beforeEach(() => sticky.resetAllBindings());

  it('a flooding tenant evicts its OWN bindings, not another tenant\'s', () => {
    // Victim holds a few live bindings.
    for (let i = 0; i < 3; i++) {
      sticky.setStickyBinding(`${VICTIM}:user:v${i}`, null, `acct-v${i}`, `sk-v${i}`);
    }
    // Flooder mints far more unique callerKeys than the table can hold.
    for (let i = 0; i < 40; i++) {
      sticky.setStickyBinding(`${FLOODER}:user:f${i}`, null, `acct-f${i}`, `sk-f${i}`);
    }

    const survived = [0, 1, 2].filter(i => sticky.getStickyBinding(`${VICTIM}:user:v${i}`, null));
    assert.ok(survived.length >= 1,
      `the victim tenant must keep at least a fair share; survived=${survived.length}`);
  });

  it('a single tenant alone can still use the whole table', () => {
    for (let i = 0; i < 8; i++) {
      sticky.setStickyBinding(`${VICTIM}:user:s${i}`, null, `acct-${i}`, `sk-${i}`);
    }
    assert.equal(sticky.getStickyStats().size, 8, 'no artificial cap when there is no contention');
  });

  it('eviction never exceeds the configured maximum', () => {
    for (let i = 0; i < 50; i++) {
      sticky.setStickyBinding(`${FLOODER}:user:x${i}`, null, `acct-${i}`, `sk-${i}`);
    }
    assert.ok(sticky.getStickyStats().size <= 8, 'MAX_BINDINGS must hold');
  });
});

describe('sticky binding table — LRU ordering', () => {
  beforeEach(() => sticky.resetAllBindings());

  it('a recently READ binding outlives an untouched older one', () => {
    const caller = i => `${VICTIM}:user:l${i}`;
    for (let i = 0; i < 8; i++) sticky.setStickyBinding(caller(i), null, `acct-${i}`, `sk-${i}`);

    // Touch the oldest so it becomes most-recently-used.
    assert.ok(sticky.getStickyBinding(caller(0), null), 'precondition: entry 0 is live');

    // One more insert from the same tenant forces exactly one eviction.
    sticky.setStickyBinding(caller(99), null, 'acct-99', 'sk-99');

    assert.ok(sticky.getStickyBinding(caller(0), null),
      'the refreshed entry must survive — a read has to count as use');
    assert.equal(sticky.getStickyBinding(caller(1), null), null,
      'the genuinely least-recently-used entry is the victim');
  });

  it('refreshing an existing binding does not double-count the tenant', () => {
    sticky.setStickyBinding(`${VICTIM}:user:same`, null, 'acct-1', 'sk-1');
    sticky.setStickyBinding(`${VICTIM}:user:same`, null, 'acct-2', 'sk-2');
    assert.equal(sticky.getStickyStats().size, 1, 'rebind is an update, not a second entry');
    assert.equal(sticky.getStickyBinding(`${VICTIM}:user:same`, null).accountId, 'acct-2');
  });

  it('clearing bindings keeps the tenant accounting consistent', () => {
    sticky.setStickyBinding(`${VICTIM}:user:c1`, null, 'acct-1', 'sk-1');
    sticky.setStickyBinding(`${VICTIM}:user:c2`, null, 'acct-2', 'sk-2');
    sticky.clearStickyBinding(`${VICTIM}:user:c1`, null);
    assert.equal(sticky.getStickyStats().size, 1);
    // Re-filling must still respect the cap (i.e. counts did not go negative).
    for (let i = 0; i < 20; i++) {
      sticky.setStickyBinding(`${VICTIM}:user:r${i}`, null, `acct-r${i}`, `sk-r${i}`);
    }
    assert.ok(sticky.getStickyStats().size <= 8);
  });
});
