// Registry guard: every DEFAULT-ON behaviour switch must have an off path someone tested.
//
// WHY
//
// A switch that defaults ON is a behaviour change already shipped to every deploy. Its
// off switch is the only thing standing between "we found a bad shape in production" and
// "roll back the release". #247 shipped as the sole default-on change in a five-PR batch
// with no kill switch at all, and its failure shape was content loss — the switch was
// added afterwards, by the maintainer, not by the PR.
//
// The gap this pins is narrower and more common than "no switch exists": the switch
// exists, and NOTHING EXERCISES IT OFF. Measured when this test was written, of the ten
// default-on switches in src/:
//
//   LS_AUTO_RESTART                              0 tests
//   LS_MEMORY_GUARD                              0 tests
//   RESPONSE_STORE_ENABLED                       0 tests
//   WINDSURFAPI_NLU_RETRY                        0 tests
//   WINDSURFAPI_BACKGROUND_MAINTENANCE_SKIP_BUSY tests exist, none set it to '0'
//
// An untested off path is a kill switch nobody has ever pulled. It is exactly the shape
// that fails when it is finally needed, at the worst moment, with no way to tell whether
// the switch or the incident broke the deploy.
//
// HOW THIS IS ENFORCED
//
// The list below is a LEDGER, not a discovery mechanism. A new default-on switch fails
// the completeness check until someone adds it here deliberately — the point is that
// shipping one is a decision, not an accident. Each entry is either:
//
//   tested: true   — a test sets it to '0' and asserts the off behaviour
//   waived: '<why>' — deliberately unguarded, with the reason recorded
//
// A waiver is not a free pass: it is a line in a file the next reviewer reads.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');
const TEST_DIR = join(process.cwd(), 'test');

// ── the ledger ──────────────────────────────────────────────────────────────
// Keep alphabetical. `tested` claims a test drives the OFF path; the test below
// verifies that claim rather than trusting it.
const LEDGER = {
  DEVIN_CLI_USE_ACCOUNT_POOL: { tested: true },
  DROUGHT_RESTRICT_PREMIUM: { tested: true },
  LS_AUTO_RESTART: {
    waived: 'supervisor restart policy — exercising off means asserting a crashed LS is '
      + 'NOT revived, which needs a real child process; covered by lsp-capacity-matrix at '
      + 'the layer above.',
  },
  // Both found only after this file's discovery patterns were widened to accept `??`.
  RESPONSE_CACHE_ENABLED: {
    waived: 'off means "do not serve a cached response". No test drives it — the switch '
      + 'was invisible to this ledger until the ?? form was covered, so the gap is newly '
      + 'visible rather than newly created. Worth a test; recorded honestly until then.',
  },
  WINDSURFAPI_ENV_LIFT: { tested: true },
  LS_MEMORY_GUARD: {
    waived: 'the off path is "do not kill an LS over RSS" — proving that requires driving '
      + 'a real process past a memory threshold. Deliberately unguarded.',
  },
  LS_PREWARM_DEFAULT: { tested: true },
  // Both read at module load in handlers/chat.js (:834, :835), so a test would need to
  // re-import the module with the env set — the reason neither has one today.
  OPUS47_STRICT_REUSE: {
    waived: 'module-load constant in handlers/chat.js:835; off relaxes strict cascade '
      + 'reuse for opus-4.7. Same subsystem as issue #245 (reuse isolation) — worth a '
      + 'test when that is next touched. Known gap.',
  },
  OPUS47_TOOL_EMULATED_REUSE: {
    waived: 'module-load constant in handlers/chat.js:834, read as a default parameter by '
      + 'shouldUseCascadeReuse(:941) — that function IS reachable with an explicit '
      + 'allowToolReuse:false, so the behaviour is testable even though the switch is not. '
      + 'Known gap.',
  },
  RESPONSE_STORE_ENABLED: {
    waived: 'off means /v1/responses stops persisting; the store has its own spec '
      + '(response-store-four-defects.json) but nothing drives the disabled branch. '
      + 'Known gap — worth a test, not a blocker today.',
  },
  WINDSURFAPI_BACKGROUND_MAINTENANCE_SKIP_BUSY: {
    waived: 'off means maintenance runs even while requests are in flight — asserting '
      + 'that reliably needs a timing fixture. Known gap.',
  },
  // #250 — off means a leading think-tagged content span stays in the content
  // channel on the Cascade stream path (byte-identical egress, no reroute). The
  // off path IS tested: cascade-think-reroute.test.js drives it to '0' and
  // asserts the marker bytes stay verbatim in content.
  WINDSURFAPI_CASCADE_THINK_REROUTE: { tested: true },
  // Found by a hand audit, not by this ledger: it is spelled
  // `String(env.X || '1') === '0'` as an early return, which the two original
  // discovery patterns (both anchored on `!== '0'`) could not see. The third pattern
  // now anchors on the `|| '1'` fallback instead. Off path IS tested —
  // client-identity-neutralize.test.js drives it with '0' at three sites.
  WINDSURFAPI_NEUTRALIZE_CLIENT_ID: { tested: true },
  WINDSURFAPI_NLU_RETRY: {
    waived: 'off disables the narrative retry nudge; the behaviour is covered indirectly '
      + 'by nlu-negation-and-arg-slot.json but not via the switch. Known gap.',
  },
  WINDSURFAPI_REASONING_DEDUP: { tested: true },
  WINDSURFAPI_STRICT_MODEL: { tested: true },
};

// Shapes that mean "default ON, set to exactly '0' to disable".
//   process.env.X !== '0'
//   String(env.X || '1') !== '0'
const DEFAULT_ON_PATTERNS = [
  /(?:process\.)?env\.([A-Z][A-Z0-9_]+)\s*!==\s*'0'/g,
  /(?:process\.)?env\.([A-Z][A-Z0-9_]+)\s*\|\|\s*'1'\)\s*!==\s*'0'/g,
  // A `'1'` FALLBACK is what makes a switch default-ON, however the comparison is
  // then spelled. The two patterns above both require `!== '0'`, which missed three
  // live default-ON switches, each found by hand rather than by this ledger:
  //   String(env.WINDSURFAPI_NEUTRALIZE_CLIENT_ID || '1') === '0'   // early return
  //   String(env.RESPONSE_CACHE_ENABLED ?? env.WINDSURFAPI_RESPONSE_CACHE ?? '1')
  //   String(env.WINDSURFAPI_ENV_LIFT ?? '1').trim().toLowerCase() === '0'
  // So anchor on the fallback itself, and accept BOTH `||` and `??` — the nullish
  // form is not a stylistic variant here, it is how two of the three are written.
  // The middle allows the chained form (`env.A ?? env.B ?? '1'`) to register every
  // name in the chain, since setting any of them changes behaviour — but it may only
  // skip over further `env.X ??` links, never arbitrary text. A looser `[^)]*?`
  // matched `env.DASHBOARD_PASSWORD || ''` by running past the end of its expression
  // to a `'1'` elsewhere on the line, reporting a credential as a default-on switch.
  /(?:process\.)?env\.([A-Z][A-Z0-9_]+)\s*(?:\|\||\?\?)\s*(?:(?:process\.)?env\.[A-Z][A-Z0-9_]+\s*(?:\|\||\?\?)\s*)*'1'/g,
];

function readTree(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readTree(p));
    else if (entry.name.endsWith('.js')) out.push([p, readFileSync(p, 'utf8')]);
  }
  return out;
}

function discoverDefaultOnSwitches() {
  const found = new Set();
  for (const [, src] of readTree(SRC_DIR)) {
    for (const re of DEFAULT_ON_PATTERNS) {
      re.lastIndex = 0;
      for (const m of src.matchAll(re)) found.add(m[1]);
    }
  }
  return found;
}

const testSources = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(TEST_DIR, f), 'utf8'));

// Does any test set this knob to '0'? Covers X: '0', X = '0', X=0 and unquoted forms.
function hasOffPathTest(knob) {
  const re = new RegExp(`${knob}["']?\\s*[:=]\\s*["']?0["']?`);
  return testSources.some((src) => re.test(src));
}

describe('default-on switch registry', () => {
  const discovered = discoverDefaultOnSwitches();

  it('every default-on switch found in src/ is present in the ledger', () => {
    const missing = [...discovered].filter((k) => !(k in LEDGER)).sort();
    assert.deepEqual(missing, [],
      'a new default-on switch shipped without a ledger entry. Shipping one is a decision: '
      + 'add it to LEDGER with tested:true (and a test driving the OFF path) or waived:"<why>". '
      + `Missing: ${missing.join(', ')}`);
  });

  it('the ledger has no stale entries', () => {
    // A knob that stopped being default-on (removed, or flipped to default-off) should
    // leave the ledger, or the ledger becomes decoration that outlives the code.
    const stale = Object.keys(LEDGER).filter((k) => !discovered.has(k)).sort();
    assert.deepEqual(stale, [],
      `ledger names switches that are no longer default-on in src/: ${stale.join(', ')}`);
  });

  it('every switch claiming tested:true really has a test that sets it to 0', () => {
    const lying = Object.entries(LEDGER)
      .filter(([, v]) => v.tested)
      .map(([k]) => k)
      .filter((k) => !hasOffPathTest(k))
      .sort();
    assert.deepEqual(lying, [],
      'these claim an off-path test but no test file sets them to \'0\' — the claim is the '
      + `only thing guarding a kill switch: ${lying.join(', ')}`);
  });

  it('every waiver carries a reason', () => {
    const empty = Object.entries(LEDGER)
      .filter(([, v]) => !v.tested)
      .filter(([, v]) => typeof v.waived !== 'string' || v.waived.trim().length < 20)
      .map(([k]) => k);
    assert.deepEqual(empty, [],
      `waived without a usable reason: ${empty.join(', ')}`);
  });
});
