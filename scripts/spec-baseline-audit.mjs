#!/usr/bin/env node
// Re-measure every spec's expectBaselinePass and report drift.
//
// WHY THIS EXISTS SEPARATELY FROM spec-static-check.mjs
//
// The static check (anchors/shape) reads files and is ~0.3s. Baseline VALUE is a
// different animal: it requires actually running each spec's test files and comparing
// the pass count. That is expensive (all specs ~40 min) — too slow for per-PR CI, but
// exactly right as the POST-MERGE sweep that the repo already knows it needs
// (pr-gate --all-specs, SKILL.md step 5).
//
// History this exists to catch (all were invisible to `npm test`):
//   - retry-rescue-budget-split: 82 & 87 were both right alone, 88 merged (#242+#243)
//   - reasoning-continuity: 289 -> 300 (#243/#248 added tests to shared files)
//   - session-continuity-compaction-survival: 35 -> 48 (#242's tests)
//   - reasoning-dedup-incremental: 13 -> 18 (off-switch tests)
//
// Usage:
//   node scripts/spec-baseline-audit.mjs [spec-name-filter]
//
// Exit 0: every spec's baseline matches measured. Exit 1: drift found (prints the fix).
// Intended to run on master after merges (release workflow or post-merge gate).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SPEC_DIR = join(process.cwd(), 'test', 'mutations');
const filter = process.argv[2];

const C = process.stdout.isTTY
  ? { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' }
  : { red: '', green: '', yellow: '', dim: '', bold: '', reset: '' };

// Same invocation and same regex as mutate-verify's runSuite and pr-gate's measureBaseline.
// If this measured a count differently, a disagreement with the harness would be
// unexplainable — and the whole point is to report the TRUE number.
function measure(tests) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.FORCE_COLOR;
  let out = '';
  try {
    out = execFileSync(process.execPath,
      ['--import', './test/setup-env.mjs', '--test', '--test-force-exit', ...tests],
      { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
  }
  const sum = (re) => [...out.matchAll(re)].reduce((n, m) => n + Number(m[1]), 0);
  return { pass: sum(/^ℹ pass (\d+)$/gm), fail: sum(/^ℹ fail (\d+)$/gm) };
}

const specs = readdirSync(SPEC_DIR)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !filter || f.includes(filter))
  .sort();

let drift = 0;
let total = 0;

for (const name of specs) {
  const spec = JSON.parse(readFileSync(join(SPEC_DIR, name), 'utf8'));
  if (typeof spec.expectBaselinePass !== 'number') continue;
  const tests = spec.tests || [];
  if (!tests.length) continue;
  total++;

  // Skip specs whose files don't exist — the static check reports those; don't crash here.
  if (tests.some((t) => !existsSync(join(process.cwd(), t)))) {
    console.log(`${C.yellow}~${C.reset} ${name}  (missing test file — see spec-static-check)`);
    continue;
  }

  const { pass, fail } = measure(tests);
  const ok = pass === spec.expectBaselinePass && fail === 0;
  if (ok) {
    console.log(`${C.green}✓${C.reset} ${name}  (${pass})`);
  } else {
    drift++;
    console.log(`${C.red}✗${C.reset} ${name}  expected=${spec.expectBaselinePass} measured=${pass} (fail=${fail})`);
    console.log(`     fix: change expectBaselinePass to ${pass}`);
  }
}

console.log(`\n${C.bold}spec-baseline-audit${C.reset}: ${total - drift}/${total} match, ${drift} drifted`);
process.exit(drift ? 1 : 0);
