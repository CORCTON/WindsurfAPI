// The mutation harness's own verdict logic, which nothing covered until now.
//
// scripts/mutate-verify.mjs is what the ledger's trust rests on: "a test that has never
// failed is not a test" is only meaningful if the thing reporting CAUGHT/SURVIVED is itself
// right. It has now been wrong in both directions inside one round:
//
//   1. it reported a TRUNCATED run as a clean SURVIVED (a mutation containing
//      `process.exit(0)` yielded pass=1 fail=0 against a baseline of 4 — verdict SURVIVED
//      while three assertions never executed);
//   2. the guard added for (1) then ABORTED on mutations that were genuinely CAUGHT,
//      because it compared test counts without checking whether anything had failed. A
//      syntax-error mutation reports pass=0 fail=1 — caught, correctly — and the guard
//      killed the run, printed a message asserting "nothing failed" that was false in that
//      very case, ignored --keep-going, and skipped every later mutation.
//
// Both directions are pinned here. The shape of the bug is worth naming: a guard written
// from ONE reproduction and then applied unconditionally.
//
// These tests drive the real script as a subprocess against real spec files in a tmpdir,
// mutating a throwaway fixture module rather than anything under src/ — the harness refuses
// to touch untracked files, so the fixture is created, committed to a scratch clone, and the
// clone is thrown away. That is heavier than stubbing, and it is the point: the failure modes
// above were both in the interaction between the spec, git, and node's reporter, none of
// which a stub reproduces.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.cwd();
let clone;
let specDir;

/** A scratch git repo with the harness, a fixture module, and a test over it. */
before(() => {
  clone = mkdtempSync(join(tmpdir(), 'mv-harness-'));
  specDir = mkdtempSync(join(tmpdir(), 'mv-spec-'));
  mkdirSync(join(clone, 'scripts'));
  mkdirSync(join(clone, 'test'));
  cpSync(join(REPO, 'scripts/mutate-verify.mjs'), join(clone, 'scripts/mutate-verify.mjs'));
  // setup-env.mjs is loaded via --import by the harness; a stub keeps the clone standalone.
  writeFileSync(join(clone, 'test/setup-env.mjs'), 'export {};\n');
  writeFileSync(join(clone, 'src.mjs'), `
export function alpha() { return 'a'; }
export function beta() { return 'b'; }
export function gamma() { return 'c'; }
export function delta() { return 'd'; }
`);
  writeFileSync(join(clone, 'test/fixture.test.js'), `
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alpha, beta, gamma, delta } from '../src.mjs';
describe('fixture', () => {
  it('alpha', () => assert.equal(alpha(), 'a'));
  it('beta',  () => assert.equal(beta(), 'b'));
  it('gamma', () => assert.equal(gamma(), 'c'));
  it('delta', () => assert.equal(delta(), 'd'));
});
`);
  const git = (...a) => execFileSync('git', a, { cwd: clone, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@example.invalid');
  git('config', 'user.name', 'harness test');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
});

after(() => {
  if (clone) rmSync(clone, { recursive: true, force: true });
  if (specDir) rmSync(specDir, { recursive: true, force: true });
});

/**
 * Run the harness on a spec; return { code, out }.
 *
 * The spec file lives OUTSIDE the clone. Writing it inside makes the tree dirty, and guard 1
 * then refuses to run — which is the guard working correctly and this test measuring nothing.
 */
function runHarness(spec, extraArgs = [], envOverrides = null) {
  const specPath = join(specDir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  const env = envOverrides ? { ...process.env, ...envOverrides } : process.env;
  try {
    const out = execFileSync(process.execPath, ['scripts/mutate-verify.mjs', specPath, ...extraArgs],
      { cwd: clone, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('a genuine catch is reported even when it changes the test count', () => {
  it('a syntax-error mutation is CAUGHT, not aborted', () => {
    // The exact case the count guard broke. pass=0 fail=1 — the suite failed, so the
    // mutation was caught; the count difference is beside the point.
    const r = runHarness({
      tests: ['test/fixture.test.js'],
      expectBaselinePass: 4,
      mutations: [{
        name: 'syntax error',
        file: 'src.mjs',
        anchor: 'export function alpha()',
        replacement: 'this is not javascript ((( export function alpha()',
      }],
    });
    const out = strip(r.out);
    assert.match(out, /CAUGHT/,
      `expected CAUGHT; the harness said:\n${out}`);
    assert.doesNotMatch(out, /changed how many tests RAN/,
      'the count guard must not fire when the suite reported a failure — that is a catch');
    assert.equal(r.code, 0, 'and the run must succeed, since the mutation behaved as expected');
  });

  it('--keep-going still reaches later mutations after such a catch', () => {
    // The count guard used to `die()` here, which skipped everything after it.
    const r = runHarness({
      tests: ['test/fixture.test.js'],
      expectBaselinePass: 4,
      mutations: [
        {
          name: 'first: syntax error (caught, count changes)',
          file: 'src.mjs',
          anchor: 'export function alpha()',
          replacement: 'bad ((( export function alpha()',
        },
        {
          name: 'second: must still run',
          file: 'src.mjs',
          anchor: "return 'b';",
          replacement: "return 'WRONG';",
        },
      ],
    }, ['--keep-going']);
    const out = strip(r.out);
    assert.match(out, /second: must still run/,
      `the second mutation never ran:\n${out}`);
  });
});

describe('a truncated run is never reported as a clean survivor', () => {
  it('a mutation that exits the process mid-suite aborts with an explanation', () => {
    // The original defect. Nothing fails, so `fail > 0` is false and the naive verdict is
    // SURVIVED — while most assertions never executed.
    const r = runHarness({
      tests: ['test/fixture.test.js'],
      expectBaselinePass: 4,
      mutations: [{
        name: 'truncates the suite',
        file: 'src.mjs',
        anchor: "export function gamma() { return 'c'; }",
        replacement: "export function gamma() { process.exit(0); }",
      }],
    });
    const out = strip(r.out);
    // Match VERDICT lines only. The abort message itself contains the word "SURVIVED"
    // (explaining what would otherwise be reported), so a bare /SURVIVED/ check fails on
    // correct behaviour — which it did on the first version of this test.
    const verdictLines = out.split('\n').filter((l) => /^\s*(CAUGHT|SURVIVED)\b/.test(l.trim()));
    assert.deepEqual(verdictLines, [],
      `a truncated run must produce NO verdict at all, got:\n${verdictLines.join('\n')}`);
    assert.match(out, /changed how many tests RAN/,
      'and the abort must say why, so the reader narrows the mutation instead of trusting it');
    assert.equal(r.code, 2, 'harness-cannot-produce-a-verdict is exit 2, not 1');
  });
});

describe('the pre-flight guards refuse rather than warn', () => {
  it('a mutation target outside the repo is refused before anything runs', () => {
    const r = runHarness({
      tests: ['test/fixture.test.js'],
      expectBaselinePass: 4,
      mutations: [{ name: 'escape', file: '../outside.txt', anchor: 'x', replacement: 'y' }],
    });
    assert.match(strip(r.out), /escapes the repo|not tracked/);
    assert.equal(r.code, 2);
  });

  it('an untracked target is refused, since the restore could not undo it', () => {
    // The file must exist and be untracked. It also makes the tree dirty, which guard 1
    // catches FIRST — so assert on either refusal: both are correct, and which one fires is
    // an ordering detail, not the property under test.
    const stray = join(clone, 'untracked.mjs');
    writeFileSync(stray, 'export const x = 1;\n');
    try {
      const r = runHarness({
        tests: ['test/fixture.test.js'],
        expectBaselinePass: 4,
        mutations: [{ name: 'untracked', file: 'untracked.mjs', anchor: 'x = 1', replacement: 'x = 2' }],
      });
      assert.match(strip(r.out), /not tracked|working tree is dirty/,
        'an untracked mutation target must never be written to — the restore cannot undo it');
      assert.equal(r.code, 2);
    } finally {
      rmSync(stray, { force: true });
    }
  });

  it('an anchor that does not match exactly once is refused', () => {
    const r = runHarness({
      tests: ['test/fixture.test.js'],
      expectBaselinePass: 4,
      mutations: [{ name: 'ambiguous', file: 'src.mjs', anchor: 'export function', replacement: 'x' }],
    });
    assert.match(strip(r.out), /matched 4 times/,
      'a multi-match anchor would mutate only the first occurrence');
    assert.equal(r.code, 2);
  });

  it('a stale expectBaselinePass is refused', () => {
    const r = runHarness({
      tests: ['test/fixture.test.js'],
      expectBaselinePass: 999,
      mutations: [{ name: 'x', file: 'src.mjs', anchor: "return 'b';", replacement: "return 'z';" }],
    });
    assert.match(strip(r.out), /baseline pass=4 but spec expects 999/);
    assert.equal(r.code, 2);
  });

  it('a test path that would be parsed as a node option is refused', () => {
    const r = runHarness({
      tests: ['--import=/tmp/evil.mjs'],
      expectBaselinePass: 4,
      mutations: [{ name: 'x', file: 'src.mjs', anchor: "return 'b';", replacement: "return 'z';" }],
    });
    assert.match(strip(r.out), /node option/);
    assert.equal(r.code, 2);
  });
});

describe('an unexpected verdict exits 1, distinct from a harness error', () => {
  it('a survivor expected to be caught exits 1', () => {
    const r = runHarness({
      tests: ['test/fixture.test.js'],
      expectBaselinePass: 4,
      mutations: [{
        name: 'comment-only change, wrongly expected to be caught',
        file: 'src.mjs',
        anchor: "export function delta() { return 'd'; }",
        replacement: "export function delta() { /* noop */ return 'd'; }",
      }],
    });
    const out = strip(r.out);
    assert.match(out, /SURVIVED/);
    assert.equal(r.code, 1,
      'exit 1 = the harness worked and a mutation misbehaved; exit 2 = the harness could not '
      + 'produce a verdict. CI has to be able to tell those apart.');
  });

  it('and the tree is left clean either way', () => {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: clone, encoding: 'utf8' });
    assert.equal(status.trim(), '',
      `the harness left the scratch repo dirty:\n${status}`);
  });
});

// A caller that exports FORCE_COLOR made the harness unusable: node wraps the summary in
// SGR codes, the anchored `ℹ pass N` counters match nothing, and EVERY run ends at guard 2
// with "baseline is not green" while the suite was in fact perfectly green.
//
// It failed safe — a zero count can never manufacture a false SURVIVED — but the message
// blamed the suite for a defect in the measurement, which is the same disguise as the
// round-3 false SURVIVEDs (`pass=0` is "not measured", never "not caught").
//
// Not hypothetical: with FORCE_COLOR=3 exported, 6 of the 10 tests in THIS file failed, so
// the repo's own gate was green only because the ambient environment happened not to set it.
//
// The env is passed explicitly rather than inherited so the assertion holds both ways: the
// bug reproduces on a machine that does not set FORCE_COLOR, and the control case stays a
// control on a machine that does.
describe('the measurement survives a colour-forcing caller', () => {
  const spec = () => ({
    tests: ['test/fixture.test.js'],
    expectBaselinePass: 4,
    mutations: [{
      name: 'beta returns the wrong letter',
      file: 'src.mjs',
      anchor: "export function beta() { return 'b'; }",
      replacement: "export function beta() { return 'z'; }",
    }],
  });

  for (const value of ['3', '1', '']) {
    it(`FORCE_COLOR=${JSON.stringify(value)} still yields a real baseline and verdict`, () => {
      const r = runHarness(spec(), [], { FORCE_COLOR: value });
      const out = strip(r.out);
      assert.doesNotMatch(out, /baseline is not green/,
        `FORCE_COLOR=${JSON.stringify(value)} zeroed the counters: the suite ran, the parser `
        + 'did not. Measured before the fix — every value except "0" colours the summary, '
        + `including the empty string.\n${out}`);
      assert.match(out, /baseline 4 pass \/ 0 fail/,
        'the baseline count must be the real one, not a colour-mangled 0');
      assert.match(out, /CAUGHT/, 'and the verdict must still be produced');
      assert.equal(r.code, 0);
    });
  }

  it('FORCE_COLOR=0 (the one value that does not colour) is unaffected', () => {
    const r = runHarness(spec(), [], { FORCE_COLOR: '0' });
    const out = strip(r.out);
    assert.match(out, /baseline 4 pass \/ 0 fail/);
    assert.equal(r.code, 0);
  });
});
