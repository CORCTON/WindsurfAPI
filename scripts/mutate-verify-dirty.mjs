#!/usr/bin/env node
//
// Mutation verification WITHOUT requiring a clean tree.
//
// `mutate-verify.mjs` is the one to use. Reach for this one only while a fix is
// still uncommitted — which is exactly when the main harness refuses to run, and
// refuses for a good reason (its guard 1).
//
// ── WHAT GUARD 1 PROTECTS, AND WHY IT CANNOT SIMPLY BE DROPPED ───────────────
//
// The main harness restores with `git checkout HEAD -- src/` after every mutation.
// On a dirty tree that destroys the UNCOMMITTED fix sitting next to the mutation,
// so every later mutation measures "fix missing" rather than "mutation applied" —
// and that failure is INDISTINGUISHABLE from the mutation being caught, so it
// reads as success. AUDIT-LEDGER round 4 recorded it; round 8 hit it again, by the
// person who had written it down.
//
// So this script may not just delete the guard. Every protection guard 1 bought
// has to be bought again by other means:
//
//   guard 1 gave us            this script's replacement                strength
//   ────────────────────────   ──────────────────────────────────────   ────────
//   HEAD is an authoritative   a cp backup taken AFTER the baseline     equal*
//   copy of every mutated      run and BEFORE the first write
//   file
//
//   `git checkout` either      after restoring, every file is           STRONGER
//   works or throws            compared byte-for-byte against its
//                              backup; a mismatch is a hard failure
//
//   a clean tree, so no        nothing — this is the entire point of     WEAKER
//   uncommitted work exists    the script
//   to lose
//
//   recovery after a crash     backups live outside the repo and are     see below
//                              restored on SIGINT/SIGTERM/SIGHUP and
//                              on uncaughtException
//
//   * "Equal" holds only if the backup point is right: after the baseline (or the
//     baseline measures somebody else's tree) and before the first write (or the
//     backup already contains a mutation). Nothing enforces that ordering except
//     the order of the statements below. Do not move them.
//
// THE ONE GAP THAT IS NOT CLOSED. `kill -9` runs no handler, so the tree is left
// MUTATED and the backups sit in os.tmpdir(), which a reboot clears. The main
// harness recovers from this with `git checkout HEAD -- src/`; this one cannot.
// That is why every run prints `BACKUP <file> -> <path>` before touching anything:
// those lines are the manual recovery path.
//
//     cp <printed path> <file>
//
// Usage:
//   node scripts/mutate-verify-dirty.mjs <spec.json>
//
// Spec format is identical to mutate-verify.mjs. Exit code 0 only when every
// mutation matched its expectation.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = process.argv[2];
if (!specPath) {
  console.error('usage: node scripts/mutate-verify-dirty.mjs <spec.json>');
  process.exit(2);
}

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const files = [...new Set(spec.mutations.map(m => m.file))];

// Guard 3's equivalent, and it runs FIRST. An anchor matching zero times makes
// `.replace()` a no-op, and a no-op mutation necessarily SURVIVES — which reads as
// "the guard has a hole" when nothing was ever mutated.
let fatal = false;
for (const m of spec.mutations) {
  const src = readFileSync(resolve(ROOT, m.file), 'utf8');
  const hits = src.split(m.anchor).length - 1;
  if (hits !== 1) {
    console.log(`ANCHOR_BAD hits=${hits} :: ${m.name.slice(0, 70)}`);
    fatal = true;
  }
}
if (fatal) { console.log('RESULT=ANCHOR_FAILURE'); process.exit(2); }

function runTests() {
  const args = ['--import', './test/setup-env.mjs', '--test', '--test-force-exit', ...spec.tests];
  try {
    return execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { return `${e.stdout || ''}${e.stderr || ''}`; }
}

// Each file's `ℹ pass N` line appears exactly once, so SUMMING is safe. Per-file
// ATTRIBUTION is not: the shard runner interleaves tags (`[test/x] [test/x] ℹ
// tests 9`), so slicing counts by filename credits them to the wrong file. This
// reads totals only. ANSI is stripped first — a coloured summary line does not
// match an anchored regex, which is how FORCE_COLOR once made the harness report
// pass=0 against a fully green suite.
const counts = (raw) => {
  const out = raw.replace(/\x1b\[[0-9;]*m/g, '');
  return {
    pass: [...out.matchAll(/^ℹ pass (\d+)$/gm)].reduce((s, m) => s + +m[1], 0),
    fail: [...out.matchAll(/^ℹ fail (\d+)$/gm)].reduce((s, m) => s + +m[1], 0),
  };
};

// Guard 2's equivalent: a SURVIVED verdict means nothing unless the suite was
// green first, at the exact count the spec declares.
const base = counts(runTests());
console.log(`BASELINE pass=${base.pass} fail=${base.fail} declared=${spec.expectBaselinePass ?? '(none)'}`);
if (base.fail !== 0) { console.log('RESULT=BASELINE_RED'); process.exit(2); }
if (spec.expectBaselinePass != null && base.pass !== spec.expectBaselinePass) {
  console.log('RESULT=BASELINE_MISMATCH');
  process.exit(2);
}

// The backup point. After the baseline, before the first write. See the header.
const BAKDIR = resolve(tmpdir(), 'windsurfapi-mutate-dirty');
mkdirSync(BAKDIR, { recursive: true });
const bak = {};
for (const f of files) {
  bak[f] = resolve(BAKDIR, `bak-${f.replace(/[\\/.]/g, '_')}`);
  copyFileSync(resolve(ROOT, f), bak[f]);
  console.log(`BACKUP ${f} -> ${bak[f]}`);
}
const restore = () => { for (const f of files) copyFileSync(bak[f], resolve(ROOT, f)); };

let restoring = false;
const emergency = (why) => {
  if (restoring) return;
  restoring = true;
  try { restore(); console.log(`EMERGENCY_RESTORE ok (${why})`); }
  catch (e) { console.log(`EMERGENCY_RESTORE FAILED (${why}): ${e.message} — restore by hand from the BACKUP lines above`); }
  process.exit(130);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => emergency(sig));
process.on('uncaughtException', (e) => emergency(`uncaught: ${e.message}`));

let bad = 0;
for (const m of spec.mutations) {
  const p = resolve(ROOT, m.file);
  writeFileSync(p, readFileSync(p, 'utf8').replace(m.anchor, m.replacement));
  const r = counts(runTests());
  restore();
  const caught = r.fail > 0;
  const ok = caught === (m.expectCaught !== false);
  if (!ok) bad++;
  console.log(`${ok ? 'OK' : 'UNEXPECTED'} ${caught ? 'CAUGHT' : 'SURVIVED'} fail=${r.fail} pass=${r.pass} :: ${m.name.slice(0, 90)}`);
}
restore();

// git's "checkout either works or throws" becomes an explicit comparison, because
// cp is not an authoritative copy and must not be assumed to have succeeded.
for (const f of files) {
  if (readFileSync(resolve(ROOT, f), 'utf8') !== readFileSync(bak[f], 'utf8')) {
    console.log(`RESTORE_FAILED ${f} — restore by hand: cp ${bak[f]} ${f}`);
    process.exit(2);
  }
}
console.log(`RESULT=${bad === 0 ? 'ALL_AS_EXPECTED' : `${bad}_UNEXPECTED`} total=${spec.mutations.length}`);
process.exit(bad === 0 ? 0 : 1);
