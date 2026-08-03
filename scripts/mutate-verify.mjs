#!/usr/bin/env node
//
// Mutation verification harness.
//
// Mutation verification is this repo's default way of proving a test actually tests
// something: re-introduce the defect, confirm the assertions fail by a specific count.
// Everyone hand-rolls the loop, and the hand-rolled version has bitten repeatedly. This
// script exists to make those specific failures impossible rather than remembered.
//
// What it refuses to do, and why each guard is here:
//
//   1. REFUSES TO RUN ON A DIRTY TREE. The loop's own cleanup (`git checkout -- src/`)
//      restores tracked files from the index, so an UNCOMMITTED fix sitting next to the
//      mutation is destroyed by the first restore. Every later mutation then measures
//      "fix missing" instead of "mutation applied" — and that failure looks exactly like
//      the mutation being caught, so it reads as success. Recorded in AUDIT-LEDGER round 4,
//      then hit again in round 8 by the person who wrote it down. A tool can just check.
//
//   2. PROVES THE BASELINE IS NON-ZERO FIRST. A mutation "SURVIVED" is only meaningful if
//      the suite passed before it. Four false SURVIVED verdicts in round 3 came from a
//      suite that was not running at all (wrong path, module-load env, import-time const).
//
//   3. FAILS LOUDLY ON A MISSING OR AMBIGUOUS ANCHOR. A `.replace()` whose anchor does not
//      match is a silent no-op: tests pass, and the mutation is reported as SURVIVED when
//      nothing was ever mutated. Anchors must match exactly once.
//
//   4. RESTORES FROM HEAD, NOT THE INDEX. `git checkout -- <file>` reads the INDEX, so if
//      anything was staged mid-run the restore reinstates the staged content instead of
//      HEAD. Round 7 lost a revert this way. This always uses `git checkout HEAD --`.
//
// Usage:
//   node scripts/mutate-verify.mjs <spec.json> [--keep-going]
//
// Spec format:
//   {
//     "tests": ["test/foo.test.js"],           // suite to run (required)
//     "expectBaselinePass": 12,                // optional: assert the exact baseline
//     "mutations": [
//       {
//         "name": "half 1 reverted",
//         "file": "src/auth.js",
//         "anchor": "exact source text, must appear exactly once",
//         "replacement": "what to put there",
//         "expectCaught": true                 // default true; false = documented SURVIVOR
//       }
//     ]
//   }
//
// Exit code 0 only when every mutation matched its expectation.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
}

/**
 * Exit 2 = the harness could not produce a trustworthy verdict (bad spec, dirty tree,
 * truncated run). Exit 1 = the harness worked and a mutation behaved unexpectedly. Keeping
 * those distinct matters because CI must be able to tell "your test has a gap" from
 * "the tool broke"; an uncaught crash also exits 1 by default, so main() traps that too.
 */
function die(msg) {
  console.error(`${RED}mutate-verify: ${msg}${RESET}`);
  process.exit(2);
}

/** Guard 1 + 4: a dirty tree makes every restore destructive. Refuse, do not warn. */
function assertCleanTree() {
  const status = git(['status', '--porcelain']);
  if (!status) return;
  console.error(`${RED}mutate-verify: refusing to run — the working tree is dirty.${RESET}`);
  console.error('');
  console.error('  Every mutation is undone with `git checkout HEAD -- <file>`, which would');
  console.error('  destroy the uncommitted changes below. If one of them is the fix being');
  console.error('  verified, the mutations afterwards measure "fix missing" rather than');
  console.error('  "mutation applied" — and that failure is indistinguishable from the');
  console.error('  mutation being caught, so it reads as success.');
  console.error('');
  console.error('  Commit the fix first, then re-run. (AUDIT-LEDGER round 4, hit again in 8.)');
  console.error('');
  for (const line of status.split('\n')) console.error(`    ${line}`);
  process.exit(2);
}

/**
 * A mutation's target must be a TRACKED file inside the repo.
 *
 * Without this the harness happily writes to anything the spec names — including a path
 * outside the repo, or an untracked one inside it. Either is unrecoverable: the restore is
 * `git checkout HEAD -- <path>`, which fails for both, and the failure escapes before the
 * final tree check runs. Reproduced with file: "../outside.txt".
 */
function assertMutableTarget(file) {
  if (isAbsolute(file)) die(`mutation target must be a repo-relative path, got "${file}"`);
  const rel = relative(process.cwd(), resolve(file));
  if (rel.startsWith('..')) die(`mutation target escapes the repo: "${file}"`);
  let tracked = '';
  try {
    tracked = git(['ls-files', '--error-unmatch', '--', rel]);
  } catch {
    die(`mutation target is not tracked by git: "${file}". The restore step is `
      + '`git checkout HEAD -- <file>`, which cannot recover an untracked file, so the '
      + 'mutation would be permanent.');
  }
  if (!tracked) die(`mutation target is not tracked by git: "${file}"`);
  return rel;
}

/**
 * Test paths are spliced into node's argv, so an entry beginning with `-` would be parsed
 * as a node OPTION — `--import` there is arbitrary code execution while the baseline still
 * prints green. Specs are committed files rather than user input, so this is a footgun
 * rather than an attack surface, but it costs one line to close.
 */
function assertPlainTestPaths(tests) {
  for (const t of tests) {
    if (typeof t !== 'string' || t.startsWith('-')) {
      die(`spec.tests entry "${t}" starts with "-"; it would be parsed as a node option, `
        + 'not a test file');
    }
  }
}

/** Run the suite; return { pass, fail, total, ok }. */
function runSuite(tests) {
  const args = ['--import', './test/setup-env.mjs', '--test', '--test-force-exit', ...tests];
  let out = '';
  try {
    out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // node --test exits non-zero when tests fail; the output is still what we need.
    out = `${e.stdout || ''}${e.stderr || ''}`;
  }
  const sum = (re) => [...out.matchAll(re)].reduce((n, m) => n + Number(m[1]), 0);
  const pass = sum(/^ℹ pass (\d+)$/gm);
  const fail = sum(/^ℹ fail (\d+)$/gm);
  const names = [...out.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]);
  return { pass, fail, total: pass + fail, ok: fail === 0 && pass > 0, failedNames: [...new Set(names)] };
}

function main() {
  const argv = process.argv.slice(2);
  const keepGoing = argv.includes('--keep-going');
  const specPath = argv.find((a) => !a.startsWith('--'));
  if (!specPath) die('usage: node scripts/mutate-verify.mjs <spec.json> [--keep-going]');

  let spec;
  try {
    spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
  } catch (e) {
    die(`could not read spec ${specPath}: ${e.message}`);
  }
  if (!Array.isArray(spec.tests) || spec.tests.length === 0) die('spec.tests must be a non-empty array');
  if (!Array.isArray(spec.mutations) || spec.mutations.length === 0) die('spec.mutations must be a non-empty array');

  assertCleanTree();
  assertPlainTestPaths(spec.tests);
  // Validate every target BEFORE running anything, so a bad path in mutation 9 does not
  // surface only after eight mutations have already run.
  for (const m of spec.mutations) if (m?.file) assertMutableTarget(m.file);

  // Guard 2: a SURVIVED verdict is meaningless if the suite was not passing to begin with.
  console.log(`${DIM}baseline: ${spec.tests.join(' ')}${RESET}`);
  const base = runSuite(spec.tests);
  if (!base.ok) {
    die(`baseline is not green (pass=${base.pass} fail=${base.fail}). `
      + 'Every "SURVIVED" below would be meaningless. Fix the suite first.'
      + (base.failedNames.length ? `\n  failing: ${base.failedNames.join(', ')}` : ''));
  }
  if (spec.expectBaselinePass != null && base.pass !== spec.expectBaselinePass) {
    die(`baseline pass=${base.pass} but spec expects ${spec.expectBaselinePass}. `
      + 'Either the suite changed or the spec is stale — both are worth knowing before '
      + 'trusting any verdict below.');
  }
  console.log(`${GREEN}baseline ${base.pass} pass / 0 fail${RESET}\n`);

  const results = [];
  for (const m of spec.mutations) {
    const label = m.name || `${m.file} anchor`;
    if (!m.file || typeof m.anchor !== 'string' || typeof m.replacement !== 'string') {
      die(`mutation "${label}" needs file, anchor and replacement`);
    }
    const relFile = assertMutableTarget(m.file);
    const abs = resolve(relFile);
    const before = readFileSync(abs, 'utf8');
    // A signal kills the process outright, so the `finally` restore below never runs and
    // src/ is left mutated with nothing printed. Register a handler for the duration of the
    // write so Ctrl-C / CI cancellation still restores.
    const onSignal = (sig) => {
      try { git(['checkout', 'HEAD', '--', relFile]); } catch { /* best effort */ }
      console.error(`\n${RED}mutate-verify: ${sig} — restored ${relFile} before exiting.${RESET}`);
      process.exit(130);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    // Guard 3: an anchor that does not match exactly once is a silent no-op.
    const hits = before.split(m.anchor).length - 1;
    if (hits !== 1) {
      git(['checkout', 'HEAD', '--', m.file]);
      die(`mutation "${label}": anchor matched ${hits} times in ${m.file} (need exactly 1). `
        + 'A non-matching anchor would mutate nothing and report SURVIVED.');
    }

    writeFileSync(abs, before.replace(m.anchor, m.replacement));
    let r;
    try {
      r = runSuite(spec.tests);
    } finally {
      // Guard 4: HEAD, never the index.
      git(['checkout', 'HEAD', '--', relFile]);
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }

    // Guard 5: the mutated run must have executed the SAME NUMBER of tests as the baseline.
    //
    // Without this a mutation that TRUNCATES the suite is reported as a clean survivor.
    // Reproduced: a replacement containing `process.exit(0)` produced `pass=1 fail=0`
    // against a baseline of 4 — verdict SURVIVED, while three tests silently never ran. A
    // survivor is only meaningful if every assertion actually got the chance to fail, so
    // this is the same class of lie guard 2 catches for the baseline, one level down.
    if (r.total !== base.total) {
      git(['checkout', 'HEAD', '--', relFile]);
      die(`mutation "${label}" changed how many tests RAN: baseline ${base.total}, mutated `
        + `${r.total} (pass=${r.pass} fail=${r.fail}). The verdict would be meaningless — a `
        + 'truncated run reports SURVIVED because nothing failed, when in fact most '
        + 'assertions never executed. Make the mutation narrower.');
    }

    // Guard 6: the mutation must not have left OTHER files dirty. The restore only covers
    // the file we wrote; a replacement whose test run writes elsewhere would otherwise let
    // every later mutation run under exactly the condition guard 1 forbids.
    const strayAfter = git(['status', '--porcelain']);
    if (strayAfter) {
      die(`mutation "${label}" left the tree dirty after its restore:\n${strayAfter}\n`
        + '  The mutated run wrote to a file the harness did not mutate, so it cannot be '
        + 'undone automatically. Inspect and clean up before re-running.');
    }

    const expectCaught = m.expectCaught !== false;
    const caught = r.fail > 0;
    const asExpected = caught === expectCaught;
    results.push({ label, caught, expectCaught, asExpected, pass: r.pass, fail: r.fail, failedNames: r.failedNames });

    const verdict = caught ? `CAUGHT ${r.fail}` : 'SURVIVED';
    const colour = asExpected ? (caught ? GREEN : YELLOW) : RED;
    const mark = asExpected ? ' ' : '✗';
    console.log(`${colour}${mark} ${verdict.padEnd(12)}${RESET} ${label}  ${DIM}(pass=${r.pass} fail=${r.fail})${RESET}`);
    if (caught && r.failedNames.length) {
      for (const n of r.failedNames.slice(0, 4)) console.log(`${DIM}      ↳ ${n}${RESET}`);
    }
    if (!asExpected && !keepGoing) break;
  }

  // Final state must be clean, or the harness itself left debris.
  const after = git(['status', '--porcelain']);
  if (after) {
    console.error(`\n${RED}mutate-verify: tree is dirty after the run — restore failed:${RESET}`);
    console.error(after);
    process.exit(2);
  }

  const bad = results.filter((r) => !r.asExpected);
  console.log('');
  if (bad.length === 0) {
    console.log(`${GREEN}all ${results.length} mutation(s) behaved as expected; tree clean${RESET}`);
    process.exit(0);
  }
  console.log(`${RED}${bad.length} of ${results.length} mutation(s) did NOT behave as expected:${RESET}`);
  for (const r of bad) {
    console.log(`  ${r.label}: expected ${r.expectCaught ? 'CAUGHT' : 'SURVIVED'}, got ${r.caught ? 'CAUGHT' : 'SURVIVED'}`);
    if (!r.caught) {
      console.log(`${DIM}    A survivor means the assertions do not cover this defect. Either add one`);
      console.log(`    that drives the real call site, or — if it genuinely cannot be guarded —`);
      console.log(`    record WHY and what premise keeps it harmless (see round 8).${RESET}`);
    }
  }
  process.exit(1);
}

try {
  main();
} catch (e) {
  // An uncaught throw would exit 1, colliding with the legitimate "a mutation did not
  // behave as expected" code. Re-map to 2 so a crashed harness is never mistaken for a
  // real finding, and say plainly that the tree may need checking.
  console.error(`${RED}mutate-verify: crashed — ${e?.message || e}${RESET}`);
  console.error('  Run `git status --short` and restore any mutated file with '
    + '`git checkout HEAD -- <file>`.');
  process.exit(2);
}
