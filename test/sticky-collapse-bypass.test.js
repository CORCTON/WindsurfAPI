// stickyBindByUserOnly collapses all of a caller's binding dimensions into one slot.
// This file pins the THIRD consequence of that, which nothing recorded before.
//
// Known consequences of the collapse, in the order they were found:
//   1. the Cascade (real modelKey) and connect (modelKey=null + selector) writes land in
//      the same slot, so a caller alternating between backends gets zero affinity;
//   2. combined with stickyNoFallback it used to form a self-sustaining hard-fail wedge
//      (fixed in v3.9.11 — the fix was in the OTHER flag, so this one still collapses);
//   3. this file: the cascade-reuse acquire path bypasses the sticky fast path entirely
//      (acquireAccountByKey resolves the reuse entry's OWNING account by apiKey — no
//      sticky lookup, therefore no clear either), and its success-path write then
//      overwrites a connect pin pointing at a DIFFERENT account, silently. Measured:
//      `fallbacks` delta 0, no [sticky] CLEAR log, no stat of any kind.
//
// This is NOT filed as a defect and is deliberately not "fixed". The collapse is exactly
// what the flag asks for, and once every dimension shares one slot, last-write-wins is a
// direct consequence rather than a bug — any "fix" would have to un-collapse the slot,
// i.e. disable the flag. What is worth pinning is the SCOPE (default-off is unaffected)
// and the INVISIBILITY (no counter moves), because an earlier handoff recorded this as a
// general defect of the cascade path, which measurement refuted.
//
// STICKY_SESSION_ENABLED is a module-load const, so it must be set before the first
// import. node:test gives each file its own process.

process.env.STICKY_SESSION_ENABLED = '1';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = await import('../src/auth.js');
const sticky = await import('../src/account/sticky-session.js');
const rc = await import('../src/runtime-config.js');

const CALLER = 'api:cafebabecafebabecafebabecafebabe:user:collapse-1';
const SELECTOR = 'swe-1-6-slow';   // connect dimension
const MODELKEY = 'claude-sonnet-4.6'; // cascade dimension

const created = [];
function seed(label) {
  const a = auth.addAccountByKey(
    `devin-session-token$cb-${label}-${Math.random().toString(36).slice(2)}`, label,
  );
  created.push(a.id);
  return auth.getAccountInternal(a.id);
}

beforeEach(() => {
  rc.setExperimental({ stickyBindByUserOnly: false });
  sticky.resetAllBindings();
  created.length = 0;
});
afterEach(() => {
  // setExperimental takes a PATCH OBJECT — setExperimental('k', false) is a silent no-op
  // that would leak the flag into every later test in this process.
  rc.setExperimental({ stickyBindByUserOnly: false });
  while (created.length) auth.removeAccount(created.pop());
});

/**
 * The bypass: cascade reuse resolves the entry's OWNING account directly by apiKey.
 * No sticky lookup happens, so the "bound account unusable" branch — the only place a
 * pin is ever cleared — cannot run.
 */
function cascadeReuseTurn(owner) {
  const acct = auth.acquireAccountByKey(owner.apiKey, MODELKEY);
  assert.ok(acct, 'precondition: the reuse entry owner must be acquirable');
  assert.equal(acct.id, owner.id, 'precondition: acquireAccountByKey resolves by apiKey');
  assert.equal(acct._sticky, undefined,
    'precondition: this path is NOT a sticky hit — that is the bypass being tested');
  // What the cascade success path writes: (callerKey, modelKey, ...) with selector omitted.
  sticky.setStickyBinding(CALLER, MODELKEY, acct.id, acct.apiKey);
  auth.releaseAccountById(acct.id);
  return acct;
}

describe('the hand-typed write matches the production call shape', () => {
  // This file's helper types the cascade success-path write by hand:
  //   setStickyBinding(CALLER, MODELKEY, acct.id, acct.apiKey)
  // That is faithful to chat.js today, but nothing tied it there — so a selector argument
  // added upstream (exactly what happened to the CONNECT write, which now passes one) would
  // leave every assertion in this file green while the scenario it claims to model no longer
  // existed. The producer/consumer trap, one level up: the test IS the producer here.
  //
  // A source-shape check is the right tool for this one narrow thing: the property is "my
  // fixture still mirrors the call site", which is a claim about the source, not behaviour.
  it('the cascade write sites still pass exactly four arguments, no selector', () => {
    const src = readFileSync(new URL('../src/handlers/chat.js', import.meta.url), 'utf8');

    // Balanced-paren extraction: a regex stopping at the first ')' truncates on nested calls,
    // which is how a sibling guard in this repo silently accepted a defect for months.
    const calls = [];
    const re = /setStickyBinding\(/g;
    for (const m of src.matchAll(re)) {
      let depth = 0;
      for (let i = m.index + m[0].length - 1; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) { calls.push(src.slice(m.index, i + 1)); break; }
      }
    }
    const argsOf = (call) => {
      const out = []; let depth = 0, cur = '';
      for (let i = call.indexOf('('); i < call.length; i++) {
        const ch = call[i];
        if (ch === '(' || ch === '[') { depth++; if (depth === 1) continue; }
        else if (ch === ')' || ch === ']') { depth--; if (depth === 0) { out.push(cur.trim()); return out; } }
        else if (ch === ',' && depth === 1) { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      return out;
    };

    // The two CASCADE write sites pass (callerKey, modelKey, accountId, apiKey) — no selector.
    // The CONNECT site (inside bindConnectSticky) passes five, and is deliberately excluded:
    // this file models the cascade write.
    const cascade = calls.filter((c) => !c.includes('currentApiKeyForId'));
    assert.ok(cascade.length >= 2,
      `expected the two cascade write sites, parsed ${cascade.length} of ${calls.length} total`);
    for (const c of cascade) {
      const args = argsOf(c);
      assert.equal(args.length, 4,
        `a cascade write now takes ${args.length} arguments:\n  ${c}\n`
        + 'This file\'s helper hand-types a 4-argument call, so it no longer mirrors '
        + 'production — update cascadeReuseTurn() below to match, or the scenario this file '
        + 'claims to model has quietly stopped existing.');
    }
  });
});

describe('default: the two write paths cannot collide', () => {
  it('a cascade-reuse write leaves a connect pin untouched', () => {
    // bindingKey's own comment claims this. Pinned here so a future "simplification" that
    // overloads modelKey with the selector cannot quietly break it.
    const A = seed('connect-pinned');
    const B = seed('cascade-owner');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);

    cascadeReuseTurn(B);

    const pin = sticky.peekStickyBinding(CALLER, null, SELECTOR);
    assert.ok(pin, 'the connect pin must still exist');
    assert.equal(pin.accountId, A.id,
      'the cascade write landed in the connect slot — the two dimensions have collapsed '
      + 'without the flag, which is the #230 / zero-affinity regression');
    assert.equal(sticky.getStickyStats().size, 2,
      'two distinct slots must exist: caller\\0*\\0selector and caller\\0modelKey\\0*');
  });
});

describe('stickyBindByUserOnly: the collapse makes the bypass observable', () => {
  it('a cascade-reuse write REPLACES the connect pin, and nothing records it', () => {
    rc.setExperimental({ stickyBindByUserOnly: true });
    assert.equal(rc.isExperimentalEnabled('stickyBindByUserOnly'), true,
      'precondition: the flag must actually be on, or this test proves nothing');

    const A = seed('connect-pinned');
    const B = seed('cascade-owner');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    assert.equal(sticky.peekStickyBinding(CALLER, null, SELECTOR).accountId, A.id,
      'precondition: the caller is pinned to A');

    const before = sticky.getStickyStats();
    cascadeReuseTurn(B);
    const after = sticky.getStickyStats();

    // The pin now points at B. Recorded as observed behaviour, NOT asserted as desirable:
    // with one slot per caller, last-write-wins is what the flag asks for.
    const pin = sticky.peekStickyBinding(CALLER, null, SELECTOR);
    assert.equal(pin.accountId, B.id,
      'with the collapse on, the cascade write is expected to win the single slot');
    assert.equal(after.size, 1, 'and there is only ever one slot for this caller');

    // The part that actually matters: it is invisible.
    assert.equal(after.fallbacks - before.fallbacks, 0,
      'no fallback is counted — so an operator watching sticky stats sees a conversation '
      + 'change accounts with no signal at all. This is the reason the flag stays '
      + 'experimental and default-off.');
  });

  it('the bypass never CLEARS the pin, which is why no counter moves', () => {
    // Attribution, so a future reader does not misdiagnose the invisibility. The pin is
    // overwritten by setStickyBinding, not cleared — clearStickyBinding and
    // noteStickyFallback are only reachable from getApiKey's sticky arm, and this path
    // never calls getApiKey.
    rc.setExperimental({ stickyBindByUserOnly: true });
    const A = seed('pinned');
    const B = seed('owner');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);

    const before = sticky.getStickyStats();
    cascadeReuseTurn(B);
    const after = sticky.getStickyStats();

    assert.equal(after.size, before.size,
      'the slot count is unchanged — an overwrite, not a clear followed by a create');
    assert.equal(after.creates - before.creates, 0,
      'setStickyBinding suppresses the create counter when the slot already exists, so '
      + 'even the write itself is unlogged and uncounted');
  });

  it('with the collapse OFF the same sequence is harmless — scope is the flag, not the path', () => {
    // The claim an earlier handoff got wrong: it recorded this as a general defect of the
    // cascade acquire path. It is not. Same sequence, flag off, no effect.
    const A = seed('pinned');
    const B = seed('owner');
    sticky.setStickyBinding(CALLER, null, A.id, A.apiKey, SELECTOR);
    cascadeReuseTurn(B);
    assert.equal(sticky.peekStickyBinding(CALLER, null, SELECTOR).accountId, A.id,
      'the connect pin survives — the bypass alone is not sufficient to cause the clobber');
  });
});
