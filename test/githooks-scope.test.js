// The git hooks' documented SCOPE, asserted instead of described.
//
// .githooks/pre-commit carries a table of which git operations it blocks. That table has
// drifted from actual behaviour TWICE in one round:
//
//   1. it claimed to enforce "no commits authored on master", when git never consults
//      pre-commit for cherry-pick or revert at all;
//   2. the correction then claimed git runs no post-commit for revert — measured with a
//      broken probe whose revert never created a commit, so nothing could have run.
//
// Prose that has been wrong twice should be executable. Each row of the table is one
// assertion here, run against real git operations in a throwaway repo — the hooks are copied
// in and core.hooksPath is set locally, so nothing touches the developer's own config and the
// test passes whether or not they have opted in.
//
// Deliberately NOT asserted: that a plain commit on master is blocked in THIS repo. That
// depends on the developer having run `git config core.hooksPath .githooks`, which is opt-in
// by design, and a test that failed for people who had not opted in would be worse than no
// test.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.cwd();
let repo;

/** Run a git command in the scratch repo; never throws, returns { code, out }. */
function git(...args) {
  // stdout AND stderr, on success as well as failure. The hooks write to stderr, and
  // execFileSync's return value is stdout only — so reading just the return value made every
  // post-commit assertion below fail while the hook was working correctly. Redirecting
  // stderr into stdout with 2>&1 semantics via `stdio` is the reliable way to see both.
  const opts = { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    const proc = spawnSync('git', args, opts);
    return { code: proc.status ?? 0, out: `${proc.stdout || ''}${proc.stderr || ''}` };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
/** Commit a file, bypassing hooks — for building fixtures. */
function seedCommit(name, body, msg) {
  writeFileSync(join(repo, name), body);
  git('add', name);
  return git('commit', '--no-verify', '-q', '-m', msg);
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'hooks-scope-'));
  mkdirSync(join(repo, '.githooks'));
  for (const h of ['pre-commit', 'post-commit']) {
    const src = join(REPO, '.githooks', h);
    assert.ok(existsSync(src), `${h} must exist to be tested`);
    // cpSync's `mode` is a COPY-mode flag (0-7), not a file mode — passing 0o755 there
    // throws ERR_OUT_OF_RANGE. The exec bit has to be set separately, and it matters: git
    // silently ignores a hook that is not executable, which would make every assertion below
    // pass for the wrong reason.
    const dest = join(repo, '.githooks', h);
    copyFileSync(src, dest);
    chmodSync(dest, 0o755);
  }
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 't@example.invalid');
  git('config', 'user.name', 'hooks scope test');
  git('config', 'core.hooksPath', '.githooks');
  seedCommit('base.txt', 'base\n', 'base');
});

after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

describe('pre-commit BLOCKS these', () => {
  it('a plain commit on master', () => {
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    git('add', 'a.txt');
    const r = git('commit', '-m', 'should be blocked');
    assert.notEqual(r.code, 0, 'the commit must fail');
    assert.match(strip(r.out), /refusing to author a commit on master/);
    git('reset', '-q', 'HEAD', 'a.txt');
  });

  it('--amend on master', () => {
    const r = git('commit', '--amend', '-m', 'amended');
    assert.notEqual(r.code, 0, 'amend authors a commit too, so it must be blocked');
    assert.match(strip(r.out), /refusing/);
  });

  it('a conflicted merge, with advice that actually works in that state', () => {
    // The row that was wrong: the ordinary advice is `git switch -c`, which git itself
    // rejects mid-merge. The hook must detect the in-flight operation and say something
    // followable instead.
    git('switch', '-q', '-c', 'side');
    seedCommit('conflict.txt', 'side\n', 'side version');
    git('switch', '-q', 'master');
    seedCommit('conflict.txt', 'master\n', 'master version');
    git('merge', 'side');                       // conflicts
    writeFileSync(join(repo, 'conflict.txt'), 'resolved\n');
    git('add', 'conflict.txt');
    try {
      const r = git('commit', '-m', 'resolve');
      assert.notEqual(r.code, 0, 'finishing a merge on master must still be refused');
      const out = strip(r.out);
      assert.match(out, /refusing to finish this operation/,
        'the hook must recognise the in-flight operation, not print the ordinary advice');
      // The followable-advice property, stated precisely. `git switch -c` DOES appear — but
      // only after `merge --abort`, which makes it reachable. What must not happen is
      // `switch -c` offered as the FIRST step, which is what git rejects outright. An earlier
      // version of this assertion banned the string entirely and failed on correct output.
      const abortAt = out.indexOf('merge --abort');
      const switchAt = out.indexOf('switch -c');
      assert.ok(abortAt !== -1, 'the hook must offer a command that works in this state');
      assert.ok(switchAt === -1 || switchAt > abortAt,
        '`git switch -c` must come AFTER `merge --abort`; git refuses it mid-merge, so '
        + 'presenting it first sends the reader into a command that cannot work');
    } finally {
      // Must run even on assertion failure: leaving the repo mid-merge cascades into every
      // later test in this file (measured — four of them failed on the leftover MERGE_HEAD).
      git('merge', '--abort');
      git('branch', '-D', 'side');
    }
  });
});

describe('pre-commit ALLOWS these', () => {
  it('a commit on a branch', () => {
    git('switch', '-q', '-c', 'feat/allowed');
    writeFileSync(join(repo, 'b.txt'), 'b\n');
    git('add', 'b.txt');
    const r = git('commit', '-m', 'on a branch');
    assert.equal(r.code, 0, `a branch commit must succeed:\n${strip(r.out)}`);
  });

  it('a fast-forward merge onto master — the release flow', () => {
    git('switch', '-q', 'master');
    const r = git('merge', '--ff-only', 'feat/allowed');
    assert.equal(r.code, 0, `--ff-only must not be blocked:\n${strip(r.out)}`);
    assert.doesNotMatch(strip(r.out), /refusing/,
      'ff-only creates no commit, so the hook must stay silent — the release flow depends on it');
    git('branch', '-d', 'feat/allowed');
  });
});

describe('post-commit WARNS on the routes pre-commit cannot intercept', () => {
  // Both rows here were stated wrongly at least once. They are the reason this file exists.
  it('cherry-pick onto master warns', () => {
    git('switch', '-q', '-c', 'tmp/pick');
    seedCommit('picked.txt', 'picked\n', 'a commit to pick');
    git('switch', '-q', 'master');
    const r = git('cherry-pick', '-x', 'tmp/pick');
    assert.equal(r.code, 0, `cherry-pick itself must succeed (pre-commit cannot stop it):\n${strip(r.out)}`);
    assert.match(strip(r.out), /authored on master by cherry-pick\/revert/,
      'post-commit must warn — pre-commit is never consulted on this route');
    git('reset', '--hard', 'HEAD~1', '-q');
    git('branch', '-D', 'tmp/pick');
  });

  it('revert on master warns — via the message shape, since REVERT_HEAD is already cleared', () => {
    // The row that was wrong TWICE: first assumed covered, then "measured" as impossible.
    // git DOES run post-commit for revert; REVERT_HEAD is simply gone by then, so the
    // `^Revert "` match is what catches it.
    const head = git('rev-parse', 'HEAD').out.trim();
    const r = git('revert', '--no-edit', head);
    assert.equal(r.code, 0, `revert must succeed (pre-commit cannot stop it):\n${strip(r.out)}`);
    assert.match(strip(r.out), /authored on master by cherry-pick\/revert/,
      'post-commit must warn on revert too; if this fails, the SCOPE tables in '
      + '.githooks/* and CONTRIBUTING.md are wrong again');
    git('reset', '--hard', 'HEAD~1', '-q');
  });

  it('a normal branch commit produces no warning', () => {
    // Guards against over-warning: post-commit must be silent off master, or it becomes noise
    // that people disable.
    git('switch', '-q', '-c', 'tmp/quiet');
    writeFileSync(join(repo, 'q.txt'), 'q\n');
    git('add', 'q.txt');
    const r = git('commit', '-m', 'quiet');
    assert.equal(r.code, 0);
    assert.doesNotMatch(strip(r.out), /authored on master/);
    git('switch', '-q', 'master');
    git('branch', '-D', 'tmp/quiet');
  });
});

describe('the hooks are inert unless opted in', () => {
  it('a plain commit on master succeeds with core.hooksPath unset', () => {
    // The hooks are opt-in by design. This asserts the opt-out actually opts out, so nobody
    // who has not run the config command is affected.
    git('config', '--unset', 'core.hooksPath');
    try {
      writeFileSync(join(repo, 'inert.txt'), 'inert\n');
      git('add', 'inert.txt');
      const r = git('commit', '-m', 'no hooks installed');
      assert.equal(r.code, 0,
        `with core.hooksPath unset the hooks must not run:\n${strip(r.out)}`);
      assert.doesNotMatch(strip(r.out), /refusing/);
    } finally {
      git('config', 'core.hooksPath', '.githooks');
    }
  });
});
