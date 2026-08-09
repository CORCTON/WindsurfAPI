// Explicit prompt caching — GetChatMessageRequest #13 system_prompt_cache_options.
//
// The epistemic situation matters more than the code here, so it is worth stating:
//
// MEASURED (paid Teams account, repo history): a cache HIT costs ~17.8% of a miss
// (#220), and caching is per-ACCOUNT keyed on the prompt PREFIX — NOT on the session
// id. Both #220 A/Bs scored hits while devin-connect.js emitted a fresh randomUUID
// session id per request, and chat.js:2004 records the three-account experiment
// (same body on a second account = WRITE, repeat on the first = READ). So implicit
// caching already works and sticky sessions already supply the account stability.
//
// NOT MEASURED: that #13 is the tag for system_prompt_cache_options, or that asking
// for EPHEMERAL beats what we get implicitly. #13 comes from third-party .proto
// DECLARATION ORDER, and prost allows tag gaps, so declaration order is not a wire
// tag.
//
// Hence the switch is default-OFF and these tests pin that hardest: the OFF path must
// put NO #13 on the wire, because every operator who never sets the variable is on it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGetChatMessageRequest,
  buildSystemPromptCacheOptions,
  isPromptCacheEnabled,
} from '../src/devin-connect.js';
import { parseFields, getField } from '../src/proto.js';

const ON = { DEVIN_CONNECT_PROMPT_CACHE: '1' };
// Long enough to clear the "not worth a cache write" floor.
const LONG_PROMPT = 'You are a careful assistant. Follow the user instructions exactly. '.repeat(3);

function request(env, systemPrompt) {
  return buildGetChatMessageRequest({
    token: 'devin-session-token$a.b.c',
    model: 'm',
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'x' }],
    env,
    deviceSeed: 'stable',
  });
}
const hasField13 = (proto) => parseFields(proto).some((f) => f.field === 13);

describe('isPromptCacheEnabled — default OFF, exact "1" only', () => {
  it('is off when unset or empty', () => {
    // Unset is the state of every existing deployment. This adds a field to a wire
    // that already works, so silence must mean off.
    assert.equal(isPromptCacheEnabled({}), false);
    assert.equal(isPromptCacheEnabled({ DEVIN_CONNECT_PROMPT_CACHE: '' }), false);
  });

  it('rejects truthy-looking values that are not "1"', () => {
    // Guards the Number()/falsy rewrite that silently flipped sibling knobs (#241,
    // #242): '0' and 'false' must not read as on.
    for (const v of ['0', 'false', 'true', 'on', 'yes', '00']) {
      assert.equal(isPromptCacheEnabled({ DEVIN_CONNECT_PROMPT_CACHE: v }), false,
        `"${v}" must not enable a wire-changing switch`);
    }
    assert.equal(isPromptCacheEnabled(ON), true);
  });
});

describe('buildSystemPromptCacheOptions', () => {
  it('returns null when the switch is off, whatever the prompt', () => {
    // Null rather than an empty buffer is what keeps the default wire unchanged:
    // the caller spreads nothing instead of emitting a zero-length #13.
    assert.equal(buildSystemPromptCacheOptions(LONG_PROMPT, {}), null);
  });

  it('returns an EPHEMERAL(1) varint when on with a substantial prompt', () => {
    const buf = buildSystemPromptCacheOptions(LONG_PROMPT, ON);
    assert.ok(Buffer.isBuffer(buf), 'expected a sub-message buffer');
    assert.equal(getField(parseFields(buf), 1, 0)?.value, 1,
      'cache mode must be EPHEMERAL = 1');
  });

  it('returns null for a prompt too short to be worth a cache write', () => {
    // A write costs roughly an order of magnitude more than a read (chat.js:2004),
    // so requesting a cache for a trivial prompt is a pure loss, not a no-op.
    for (const p of ['', '   ', 'hi', 'You are helpful.']) {
      assert.equal(buildSystemPromptCacheOptions(p, ON), null,
        `a ${p.length}-char prompt must not request caching`);
    }
  });

  it('returns null for a non-string prompt instead of throwing', () => {
    // This runs on the request path; a caller passing null must not 500 the turn.
    for (const p of [null, undefined, 42, {}, []]) {
      assert.equal(buildSystemPromptCacheOptions(p, ON), null);
    }
  });

  it('does not count whitespace toward the floor', () => {
    assert.equal(buildSystemPromptCacheOptions(' '.repeat(200), ON), null,
      'a whitespace-only prompt has no prefix to cache');
  });
});

describe('request wire: #13 appears only when enabled', () => {
  it('emits NO field 13 when the switch is off', () => {
    // The load-bearing assertion. Field ABSENCE is checked rather than byte-equality
    // because two identical buildGetChatMessageRequest calls already differ (a
    // pre-existing random field), so a byte comparison would fail for the wrong
    // reason and prove nothing.
    assert.equal(hasField13(request({}, LONG_PROMPT)), false);
  });

  it('emits field 13 when the switch is on and the prompt is substantial', () => {
    const proto = request(ON, LONG_PROMPT);
    assert.equal(hasField13(proto), true);
    const inner = getField(parseFields(proto), 13, 2).value;
    assert.equal(getField(parseFields(inner), 1, 0)?.value, 1, 'EPHEMERAL inside #13');
  });

  it('emits NO field 13 when on but the prompt is below the floor', () => {
    assert.equal(hasField13(request(ON, 'hi')), false);
  });

  it('keeps the request fields ascending with #13 present', () => {
    // #13 sits between #8 (completion config) and #15 (model config). Ascending
    // order is what every other field here maintains.
    const nums = parseFields(request(ON, LONG_PROMPT)).map((f) => f.field);
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b), `not ascending: ${nums}`);
    assert.ok(nums.indexOf(13) > nums.indexOf(8), '#13 must follow #8');
    assert.ok(nums.indexOf(13) < nums.indexOf(15), '#13 must precede #15');
  });

  it('leaves every other field intact when enabled', () => {
    // A new field must not displace or drop an existing one.
    const off = new Set(parseFields(request({}, LONG_PROMPT)).map((f) => f.field));
    const on = new Set(parseFields(request(ON, LONG_PROMPT)).map((f) => f.field));
    for (const f of off) assert.ok(on.has(f), `field ${f} disappeared when caching was enabled`);
    assert.deepEqual([...on].filter((f) => !off.has(f)), [13],
      'enabling the switch must add exactly #13 and nothing else');
  });
});
