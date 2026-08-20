#!/usr/bin/env node
//
// Mutation verification WITHOUT requiring a clean tree.
//
// Use this while a fix is still uncommitted. It materializes the current dirty
// bytes into a disposable clone, commits that synthetic tree locally, and runs
// every mutation there. The Owner checkout is never a mutation target, so a
// killed process, a test that writes another file/ref/config entry, or a failed
// restore cannot destroy the work being verified. `.opencode/`, legacy
// `.claude/worktrees/`, and ignored runtime data are never copied into it.
//
// Usage:
//   node scripts/mutate-verify-dirty.mjs <spec.json>
//
// Spec format is identical to mutate-verify.mjs. Exit code 0 only when every
// mutation matched its expectation.

import {
  readFileSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  harnessEnv, workspaceSnapshot, acquireMutationLock, assertContainedRegularFile,
  materializeMutationWorkspace, repoGit, parseMutationReporterOutput,
} from './mutation-harness-utils.mjs';

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let ROOT = SOURCE_ROOT;
const specPath = process.argv[2];
if (!specPath) {
  console.error('usage: node scripts/mutate-verify-dirty.mjs <spec.json>');
  process.exit(2);
}

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
if (!Array.isArray(spec.tests) || spec.tests.length === 0) {
  console.error('RESULT=SPEC_FAILURE tests must be a non-empty array');
  process.exit(2);
}
if (!Array.isArray(spec.mutations) || spec.mutations.length === 0) {
  console.error('RESULT=SPEC_FAILURE mutations must be a non-empty array');
  process.exit(2);
}
for (const testPath of spec.tests) {
  if (typeof testPath !== 'string' || testPath.startsWith('-')) {
    console.error(`RESULT=SPEC_FAILURE invalid test path: ${testPath}`);
    process.exit(2);
  }
}
const files = [...new Set(spec.mutations.map(m => m.file))];

const assertMutableTarget = (file, root = ROOT) => assertContainedRegularFile(root, file);

// Guard 3's equivalent, and it runs FIRST. An anchor matching zero times makes
// `.replace()` a no-op, and a no-op mutation necessarily SURVIVES — which reads as
// "the guard has a hole" when nothing was ever mutated.
let fatal = false;
for (const m of spec.mutations) {
  const target = assertMutableTarget(m.file, SOURCE_ROOT);
  const src = readFileSync(target, 'utf8');
  const hits = src.split(m.anchor).length - 1;
  if (hits !== 1) {
    console.log(`ANCHOR_BAD hits=${hits} :: ${m.name.slice(0, 70)}`);
    fatal = true;
  }
}
if (fatal) { console.log('RESULT=ANCHOR_FAILURE'); process.exit(2); }

// The lock belongs to the Owner repository, not the disposable clone.  Taking it
// only after materialization lets two dirty runs clone the same Owner and then
// acquire different `.git/` locks concurrently.
let releaseMutationLock;
try { releaseMutationLock = acquireMutationLock(SOURCE_ROOT); }
catch (err) { console.log(`RESULT=LOCK_FAILURE ${err.message}`); process.exit(2); }

let materialized;
try { materialized = materializeMutationWorkspace(SOURCE_ROOT); }
catch (err) {
  console.log(`RESULT=WORKSPACE_FAILURE ${err.message}`);
  process.exit(2);
}
ROOT = materialized.root;
process.once('exit', materialized.cleanup);

// Re-check anchors on the exact materialized bytes which the test child will
// execute. The source checkout is never mutated by this harness.
for (const m of spec.mutations) {
  const target = assertMutableTarget(m.file);
  const src = readFileSync(target, 'utf8');
  const hits = src.split(m.anchor).length - 1;
  if (hits !== 1) {
    console.log(`ANCHOR_BAD_MATERIALIZED hits=${hits} :: ${m.name.slice(0, 70)}`);
    fatal = true;
  }
}
if (fatal) { console.log('RESULT=ANCHOR_FAILURE'); process.exit(2); }

function runTests() {
  const args = [
    '--import', './scripts/mutation-network-deny.mjs',
    '--import', './test/setup-env.mjs',
    '--test-reporter=./scripts/mutation-harness-utils.mjs',
    '--test', '--test-force-exit', ...spec.tests,
  ];
  try {
    return {
      stdout: execFileSync(process.execPath, args, {
        cwd: ROOT, env: harnessEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
      }),
      stderr: '',
      executionFailure: null,
    };
  } catch (e) {
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      executionFailure: { status: e.status, signal: e.signal, killed: e.killed === true, code: e.code },
    };
  }
}

// Only records emitted by the structured reporter count.  Test-authored TAP,
// ANSI text, and a partial stream are intentionally ignored or fail closed.
const countsWithEvidence = ({ stdout, stderr, executionFailure }) =>
  parseMutationReporterOutput(stdout, stderr, executionFailure);

// Guard 2's equivalent: a SURVIVED verdict means nothing unless the suite was
// green first, at the exact count the spec declares.
const initialTree = workspaceSnapshot(ROOT);
const base = countsWithEvidence(runTests());
console.log(`BASELINE pass=${base.pass} fail=${base.fail} tests=${base.tests} declared=${spec.expectBaselinePass ?? '(none)'}`);
if (base.fail !== 0 || base.tests === 0 || base.infrastructureFailure
    || base.tests !== base.pass || base.skipped !== 0 || base.cancelled !== 0 || base.todo !== 0) {
  console.log('RESULT=BASELINE_UNTRUSTWORTHY');
  process.exit(2);
}
if (spec.expectBaselinePass != null && base.pass !== spec.expectBaselinePass) {
  console.log('RESULT=BASELINE_MISMATCH');
  process.exit(2);
}
if (workspaceSnapshot(ROOT) !== initialTree) {
  console.log('RESULT=BASELINE_SIDE_EFFECT');
  process.exit(2);
}

// The restore point is the synthetic HEAD in the disposable workspace. Unlike
// the old in-place cp backup, this covers every mutation target and lets the
// entire workspace be discarded after any non-target side effect.
const baselineTree = initialTree;
const restore = () => {
  for (const f of files) repoGit(ROOT, ['checkout', 'HEAD', '--', f]);
};
if (workspaceSnapshot(ROOT) !== baselineTree) {
  console.log('RESULT=BASELINE_SIDE_EFFECT');
  process.exit(2);
}

let restoring = false;
const emergency = (why) => {
  if (restoring) return;
  restoring = true;
  try { restore(); console.log(`EMERGENCY_RESTORE ok (${why})`); }
  catch (e) { console.log(`EMERGENCY_RESTORE FAILED (${why}): ${e.message}; disposable workspace will be removed`); }
  process.exit(130);
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => emergency(sig));
process.on('uncaughtException', (e) => emergency(`uncaught: ${e.message}`));

let bad = 0;
for (const m of spec.mutations) {
  const p = assertMutableTarget(m.file);
  writeFileSync(p, readFileSync(p, 'utf8').replace(m.anchor, m.replacement));
  let r;
  try { r = countsWithEvidence(runTests()); }
  finally { restore(); }
  const complete = r.tests === base.tests
    && r.pass + r.fail === base.tests
    && r.skipped === 0 && r.cancelled === 0 && r.todo === 0;
  const trustworthy = complete && !r.infrastructureFailure;
  if (workspaceSnapshot(ROOT) !== baselineTree) {
    console.log(`UNEXPECTED SIDE_EFFECT after ${m.name}`);
    console.log('RESULT=MUTATION_SIDE_EFFECT');
    process.exit(2);
  }
  if (!trustworthy) {
    console.log(`UNEXPECTED UNTRUSTWORTHY fail=${r.fail} pass=${r.pass} tests=${r.tests}/${base.tests}${r.infrastructureFailure ? ' infra=1' : ''} :: ${m.name.slice(0, 90)}`);
    console.log('RESULT=MUTATION_UNTRUSTWORTHY');
    process.exit(2);
  }
  const caught = r.fail > 0;
  const ok = caught === (m.expectCaught !== false);
  if (!ok) bad++;
  const verdict = caught ? 'CAUGHT' : 'SURVIVED';
  console.log(`${ok ? 'OK' : 'UNEXPECTED'} ${verdict} fail=${r.fail} pass=${r.pass} tests=${r.tests}/${base.tests}${r.infrastructureFailure ? ' infra=1' : ''} :: ${m.name.slice(0, 90)}`);
}
restore();
if (workspaceSnapshot(ROOT) !== baselineTree) {
  console.log('RESULT=FINAL_SIDE_EFFECT');
  process.exit(2);
}
releaseMutationLock?.();
console.log(`RESULT=${bad === 0 ? 'ALL_AS_EXPECTED' : `${bad}_UNEXPECTED`} total=${spec.mutations.length}`);
process.exit(bad === 0 ? 0 : 1);
