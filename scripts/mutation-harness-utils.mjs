import {
  accessSync, constants, lstatSync, readFileSync, readlinkSync,
  realpathSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync, renameSync,
  cpSync, existsSync, mkdtempSync, rmSync, readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep, delimiter } from 'node:path';
import { tmpdir } from 'node:os';

const GIT_CANDIDATES = [
  '/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git',
  '/run/current-system/sw/bin/git', '/nix/var/nix/profiles/default/bin/git',
];
const executable = path => {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
};
const gitCandidate = GIT_CANDIDATES.find(executable);
if (!gitCandidate) throw new Error('mutation harness requires git at a trusted absolute path');
export const REAL_GIT = realpathSync(gitCandidate);

const SAFE_TMP_ROOT = (() => {
  try {
    if (lstatSync('/tmp').isDirectory()) return '/tmp';
  } catch {}
  return tmpdir();
})();
const SAFE_HOME = '/nonexistent/windsurfapi-harness-home';
const TRUSTED_TOOL_DIRS = [...new Set([
  dirname(REAL_GIT),
  dirname(process.execPath),
  '/usr/bin', '/bin', '/usr/sbin', '/sbin',
].filter(path => {
  try { return lstatSync(path).isDirectory(); } catch { return false; }
}))];
const TRUSTED_PATH = TRUSTED_TOOL_DIRS.join(delimiter);

/**
 * Return a hermetic child environment for mutation suites.
 *
 * This intentionally starts from a fixed allowlist rather than copying
 * process.env. Mutation tests must never inherit account credentials, proxy
 * routing, application auth switches, or a real DATA_DIR from the operator's
 * shell. `overrides` is retained for call-site compatibility, but ambient
 * values are deliberately ignored; the suite itself can set any test fixture
 * state after it starts.
 */
export function harnessEnv(_overrides = {}) {
  const env = {
    PATH: TRUSTED_PATH,
    HOME: SAFE_HOME,
    XDG_CONFIG_HOME: SAFE_HOME,
    XDG_DATA_HOME: SAFE_TMP_ROOT,
    XDG_CACHE_HOME: SAFE_TMP_ROOT,
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    TMPDIR: SAFE_TMP_ROOT,
    TMP: SAFE_TMP_ROOT,
    TEMP: SAFE_TMP_ROOT,
    NO_COLOR: '1',
    WINDSURFAPI_SKIP_DOTENV: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_SYSTEM = '/dev/null';
  delete env.NODE_TEST_CONTEXT;
  delete env.FORCE_COLOR;
  return env;
}

/**
 * A machine-readable Node test reporter.  Parsing the human `spec` reporter is
 * unsafe: a test can print a forged `ℹ pass 999` line and make a truncated run
 * look complete.  The runner sends structured events to this reporter; ordinary
 * test stdout/stderr is never yielded, so only the runner can author these
 * records.  The final (file-less) summary is the authoritative aggregate.
 */
export default async function* mutationReporter(source) {
  for await (const event of source) {
    if (event?.type === 'test:summary' && event.data?.file == null && event.data?.counts) {
      yield `@@MUTATION_SUMMARY ${JSON.stringify(event.data)}\n`;
    } else if (event?.type === 'test:fail') {
      // Keep the structured failure details for infrastructure classification
      // (network-deny and uncaught child failures), without exposing arbitrary
      // test output as a count signal.
      let data;
      try { data = JSON.stringify(event.data); } catch { data = '{}'; }
      yield `@@MUTATION_FAIL ${data}\n`;
    }
  }
}

/** Parse only records emitted by mutationReporter; never count user text. */
export function parseMutationReporterOutput(stdout = '', stderr = '', executionFailure = null) {
  let summary = null;
  let summaryCount = 0;
  const failures = [];
  for (const line of String(stdout).split('\n')) {
    if (line.startsWith('@@MUTATION_SUMMARY ')) {
      summaryCount++;
      try {
        const candidate = JSON.parse(line.slice('@@MUTATION_SUMMARY '.length));
        // The reporter emits exactly one aggregate summary.  Treat duplicate or
        // malformed records as infrastructure failure instead of silently letting
        // the last line win (a forged/partial stream must never become evidence).
        if (summary == null && candidate && typeof candidate === 'object') summary = candidate;
      } catch {}
    } else if (line.startsWith('@@MUTATION_FAIL ')) {
      try { failures.push(JSON.parse(line.slice('@@MUTATION_FAIL '.length))); } catch {}
    }
  }
  const counts = summary?.counts || {};
  const count = (name) => Number.isInteger(counts[name]) && counts[name] >= 0
    ? counts[name] : null;
  const pass = count('passed');
  const fail = count('failed');
  const tests = count('tests');
  const skipped = count('skipped');
  const cancelled = count('cancelled');
  const todo = count('todo');
  const countsComplete = [pass, fail, tests, skipped, cancelled, todo].every(Number.isInteger);
  const summarySuccess = summary?.success;
  const summaryShape = summary != null
    && summaryCount === 1
    && countsComplete
    && (summarySuccess === true || summarySuccess === false);
  const arithmetic = countsComplete
    && tests === pass + fail + skipped + cancelled + todo;
  const abnormalExecution = executionFailure != null && (
    executionFailure.signal != null
    || executionFailure.killed === true
    || executionFailure.status == null
    || ['ENOBUFS', 'ETIMEDOUT', 'EPIPE'].includes(executionFailure.code)
  );
  const failureText = `${stdout}\n${stderr}\n${failures.map(JSON.stringify).join('\n')}`;
  const infrastructureFailure = !summaryShape
    || !arithmetic
    || abnormalExecution
    // A successful runner followed by a non-zero process exit is an abnormal
    // child termination, not a caught mutation.
    || (executionFailure?.status != null && executionFailure.status !== 0 && summarySuccess === true)
    // A forged/partial reporter stream can otherwise claim success with a
    // failure count (or claim failure while all tests passed).  Keep the
    // runner's success bit correlated with the aggregate counts.
    || (summarySuccess !== (fail === 0 && cancelled === 0))
    || /\b(?:NETWORK_)?STUB_MISS\b|unexpected git:|failureType:\s*['"](?:uncaughtException|unhandledRejection)['"]|(?:uncaughtException|unhandledRejection)\s*:/i.test(failureText);
  const failedNames = failures
    .map(item => typeof item?.name === 'string' ? item.name : '')
    .filter(Boolean);
  return {
    raw: String(stdout),
    pass,
    fail,
    tests,
    skipped,
    cancelled,
    todo,
    infrastructureFailure,
    executionFailure,
    summary,
    summaryCount,
    failedNames: [...new Set(failedNames)],
  };
}

export function repoGitRaw(root, args) {
  return execFileSync(REAL_GIT, args, {
    cwd: root,
    env: harnessEnv(),
    encoding: 'utf8',
  });
}

export function repoGit(root, args) {
  return repoGitRaw(root, args).trim();
}

function fileDigest(path) {
  let stat;
  try { stat = lstatSync(path); }
  catch (err) { if (err?.code === 'ENOENT') return 'missing'; throw err; }
  if (stat.isSymbolicLink()) return `symlink:${stat.mode}:${readlinkSync(path)}`;
  if (!stat.isFile()) return `mode:${stat.mode}:size:${stat.size}`;
  return `file:${stat.mode}:sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

/** Snapshot Git state and bytes of every tracked/untracked/ignored path except noise. */
export function workspaceSnapshot(root) {
  const status = repoGitRaw(root, [
    'status', '--porcelain=v1', '--untracked-files=all', '-z',
  ]);
  // Include ignored files too: an ignored runtime file can be mutated without
  // appearing in ordinary status, which would otherwise let a test pass while
  // leaving owner data changed. Skip only known dependency/index trees whose
  // contents are external noise rather than repository state.
  const ignoredNoise = path => path.startsWith('node_modules/')
    || path.startsWith('.opencode/node_modules/')
    || path.startsWith('.codegraph/')
    || path.startsWith('.claude/worktrees/');
  // `ls-files -coi` means "only ignored" and therefore drops ordinary tracked
  // and untracked paths.  Take the visible set and the ignored set separately;
  // a dirty tracked file must be represented by bytes, not merely by its status.
  const paths = [...new Set([
    ...repoGitRaw(root, ['ls-files', '-co', '--exclude-standard', '-z'])
      .split('\0').filter(Boolean),
    ...repoGitRaw(root, ['ls-files', '-oi', '--exclude-standard', '-z'])
      .split('\0').filter(Boolean),
  ])]
    .filter(path => !ignoredNoise(path)).sort();
  const files = paths.map(path => [path, fileDigest(resolve(root, path))]);
  const head = repoGit(root, ['rev-parse', 'HEAD']);
  const headSymref = (() => {
    try { return repoGitRaw(root, ['symbolic-ref', '-q', 'HEAD']); } catch { return ''; }
  })();
  const index = createHash('sha256').update(repoGitRaw(root, ['diff', '--cached', '--binary', '--no-ext-diff'])).digest('hex');
  const indexEntries = createHash('sha256').update(repoGitRaw(root, ['ls-files', '--stage', '-z'])).digest('hex');
  // Do not enumerate a hand-picked set of namespaces. Tests which write
  // refs/custom/*, refs/notes/*, refs/replace/*, or a future namespace must be
  // observable just like heads/tags/remotes. `refs` is the complete namespace.
  const refs = createHash('sha256').update(repoGitRaw(root, [
    'for-each-ref', '--format=%(refname)%00%(objectname)%00%(symref)', 'refs',
  ])).digest('hex');
  const reflogs = createHash('sha256').update(repoGitRaw(root, [
    'reflog', '--all', '--date=raw', '--format=%H%x00%gD%x00%gs%x00%gd',
  ])).digest('hex');
  const remotes = createHash('sha256').update(repoGitRaw(root, ['remote', '-v'])).digest('hex');
  const gitDir = resolve(root, repoGit(root, ['rev-parse', '--git-dir']));
  const commonDir = resolve(root, repoGit(root, ['rev-parse', '--git-common-dir']));
  const config = fileDigest(join(gitDir, 'config'));
  const adminNames = [
    'HEAD', 'FETCH_HEAD', 'ORIG_HEAD', 'MERGE_HEAD', 'CHERRY_PICK_HEAD',
    'REVERT_HEAD', 'BISECT_HEAD', 'BISECT_LOG', 'BISECT_NAMES',
    'BISECT_START', 'BISECT_EXPECTED_REV', 'AUTO_MERGE', 'REBASE_HEAD',
    'MERGE_MSG', 'SQUASH_MSG', 'packed-refs', 'shallow', 'index.lock',
    'config', 'config.worktree', 'commondir', 'gitdir',
  ];
  const admin = [...new Set([gitDir, commonDir])].flatMap(dir => adminNames.map(name => [
    `${dir}/${name}`, fileDigest(join(dir, name)),
  ]));
  // The named list above covers known pseudorefs.  This second digest covers
  // future pseudorefs, sequencer/rebase state, hooks, info/exclude, lock files,
  // and custom ref directories without descending into the object database.
  const adminTrees = [...new Set([gitDir, commonDir])].map(dir => [
    `${dir}/admin`, directoryDigest(dir, (relPath) => {
      const top = relPath.split('/')[0];
      // The raw index file contains a mutable stat cache. A correct
      // `git checkout HEAD -- <target>` restore can refresh those cache bytes
      // even when every staged entry and cached diff is identical. Index
      // semantics are already captured above by `ls-files --stage` plus
      // `diff --cached`; keep `index.lock` visible, but ignore only the raw
      // cache-bearing `index` file here.
      return top === 'objects' || top === 'refs' || top === 'logs' || relPath === 'index';
    }),
    `${dir}/refs`, directoryDigest(join(dir, 'refs')),
    `${dir}/logs`, directoryDigest(join(dir, 'logs')),
  ]);
  const logs = [...new Set([gitDir, commonDir])].map(dir => [
    `${dir}/logs`, directoryDigest(join(dir, 'logs')),
  ]);
  return JSON.stringify({
    status, head, headSymref, index, indexEntries, refs, reflogs, remotes, config,
    admin, adminTrees, logs, files,
  });
}

function directoryDigest(path, skip = () => false) {
  const hash = createHash('sha256');
  let rootStat;
  try { rootStat = lstatSync(path); }
  catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    hash.update('missing\0');
    return hash.digest('hex');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    hash.update(`${fileDigest(path)}\0`);
    return hash.digest('hex');
  }
  // Missing, empty and mode-changed directories are distinct states.  The old
  // empty hash made creation of `.git/sequencer/`, an empty ref namespace, or
  // another administrative directory invisible to the side-effect guard.
  hash.update(`directory:${rootStat.mode}\0`);
  const walk = (current, relPath = '') => {
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); }
    catch (err) { if (err?.code === 'ENOENT') { hash.update('vanished\0'); return; } throw err; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(current, entry.name);
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (skip(childRel, entry)) continue;
      let childStat;
      try { childStat = lstatSync(child); }
      catch (err) {
        if (err?.code === 'ENOENT') { hash.update(`${childRel}\0vanished\0`); continue; }
        throw err;
      }
      hash.update(`${childRel}\0mode:${childStat.mode}\0`);
      if (childStat.isDirectory() && !childStat.isSymbolicLink()) walk(child, childRel);
      else hash.update(`${fileDigest(child)}\0`);
    }
  };
  walk(path);
  return hash.digest('hex');
}

/**
 * Materialize the current checkout into a disposable, self-contained clone.
 *
 * Mutation suites are allowed to exercise Git, ignored files, fixture remotes,
 * and arbitrary test-created state. Running them in the Owner checkout and
 * merely comparing a post-run hash is not isolation: a non-target side effect
 * has no saved bytes to restore. This helper clones the committed history,
 * overlays every visible current tracked/untracked file (except Owner-only
 * OpenCode and legacy Claude worktree state), and gives the clone a temporary
 * local origin. The caller owns cleanup().
 */
export function materializeMutationWorkspace(sourceRoot) {
  const parent = mkdtempSync(join(SAFE_TMP_ROOT, 'windsurfapi-mutation-workspace-'));
  const scratch = join(parent, 'repo');
  const remote = join(parent, 'origin.git');
  const run = (args, options = {}) => execFileSync(REAL_GIT, args, {
    cwd: options.cwd || scratch,
    env: harnessEnv(),
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  const forbidden = path => path === '.opencode' || path.startsWith('.opencode/')
    || path === '.claude/worktrees' || path.startsWith('.claude/worktrees/');
  const requiredHarnessFiles = [
    'scripts/mutation-harness-utils.mjs',
    'scripts/mutation-network-deny.mjs',
  ];
  try {
    execFileSync(REAL_GIT, ['clone', '--local', '--no-hardlinks', sourceRoot, scratch], {
      cwd: parent, env: harnessEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });

    const visible = new Set(repoGitRaw(sourceRoot, ['ls-files', '-co', '--exclude-standard', '-z'])
      .split('\0').filter(Boolean).filter(path => !forbidden(path)));
    // These two files are the evidence boundary itself.  Copy current Owner
    // bytes even when an older HEAD or ignore rule would otherwise omit them,
    // and fail closed when either preload/reporter is unavailable.
    for (const path of requiredHarnessFiles) {
      try { assertContainedRegularFile(sourceRoot, path); }
      catch { throw new Error(`materialized mutation workspace requires regular ${path}`); }
      visible.add(path);
    }
    for (const path of visible) {
      const source = resolve(sourceRoot, path);
      if (!existsSync(source)) continue; // deleted tracked paths are removed below
      const target = resolve(scratch, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target, { dereference: false, force: true });
    }
    const deleted = repoGitRaw(sourceRoot, ['ls-files', '-d', '-z'])
      .split('\0').filter(Boolean).filter(path => !forbidden(path));
    for (const path of deleted) rmSync(resolve(scratch, path), { force: true, recursive: true });

    // `git clone` materializes tracked HEAD before the overlay.  Filtering only
    // overlay paths therefore is not enough: a historically tracked Owner state
    // directory would survive in the disposable clone.  Remove both forbidden
    // trees explicitly, whether they came from HEAD, the index, or current bytes.
    rmSync(join(scratch, '.opencode'), { recursive: true, force: true });
    const claudeRoot = join(scratch, '.claude');
    try {
      const claudeStat = lstatSync(claudeRoot);
      if (claudeStat.isSymbolicLink()) {
        // Never traverse a checkout-controlled parent symlink while deleting.
        rmSync(claudeRoot, { force: true });
      } else if (claudeStat.isDirectory()) {
        rmSync(join(claudeRoot, 'worktrees'), { recursive: true, force: true });
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err;
    }

    // The Owner's OpenCode state is intentionally never copied or committed.
    mkdirSync(join(scratch, '.git', 'info'), { recursive: true });
    writeFileSync(join(scratch, '.git', 'info', 'exclude'), '.opencode/\n.claude/worktrees/\n', { encoding: 'utf8' });
    run(['config', 'user.name', 'WindsurfAPI mutation harness']);
    run(['config', 'user.email', 'mutation-harness@example.invalid']);
    // The preload and reporter must also exist in the synthetic restore point,
    // even if an older checkout's ignore rules hide a newly introduced file.
    run(['add', '-f', '--', ...requiredHarnessFiles]);
    run(['add', '-A']);
    try { run(['diff', '--cached', '--quiet'], { stdio: 'ignore' }); }
    catch { run(['commit', '-m', 'mutation harness materialized workspace']); }

    execFileSync(REAL_GIT, ['init', '--bare', remote], {
      cwd: parent, env: harnessEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    run(['remote', 'set-url', 'origin', remote]);
    run(['push', '--force', 'origin', 'HEAD:refs/heads/master']);
    run(['fetch', 'origin', 'master']);
    return {
      root: scratch,
      cleanup: () => rmSync(parent, { recursive: true, force: true }),
    };
  } catch (err) {
    rmSync(parent, { recursive: true, force: true });
    throw err;
  }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (err) { return err?.code !== 'ESRCH'; }
}

/** Acquire one repository-wide mutation lock; cooperative parallel runs fail closed. */
export function acquireMutationLock(root) {
  const commonDirRaw = repoGit(root, ['rev-parse', '--git-common-dir']);
  const commonDir = resolve(root, commonDirRaw);
  const lockDir = join(commonDir, 'codex', 'mutation-harness.lock');
  mkdirSync(dirname(lockDir), { recursive: true });
  const owner = `${process.pid}\n`;
  let createdLockDir = false;
  try {
    mkdirSync(lockDir, { mode: 0o700 });
    createdLockDir = true;
    writeFileSync(join(lockDir, 'owner'), owner, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } catch (err) {
    let stale = false;
    try {
      const pid = Number(readFileSync(join(lockDir, 'owner'), 'utf8').trim());
      stale = Number.isSafeInteger(pid) && pid > 0 && !pidAlive(pid);
    } catch {}
    if (!stale) {
      // If mkdir succeeded but owner creation failed for an unrelated reason,
      // do not leave an empty lock directory that blocks every future run. Only
      // remove a directory proven to have been created by this process and only
      // when it still has no owner file.
      if (createdLockDir) {
        try { accessSync(join(lockDir, 'owner')); }
        catch { try { rmdirSync(lockDir); } catch {} }
      }
      throw new Error(`mutation harness lock is already held: ${lockDir}`);
    }
    // Claim recovery atomically before touching the stale directory. Without
    // O_EXCL two contenders can both observe the dead owner; one can recreate
    // a fresh lock while the other removes that new owner's directory (ABA).
    const claimPath = join(lockDir, 'recovery');
    try {
      writeFileSync(claimPath, `${process.pid}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch {
      throw new Error(`could not claim stale mutation harness lock: ${lockDir}`);
    }
    let verifyPid = 0;
    try {
      verifyPid = Number(readFileSync(join(lockDir, 'owner'), 'utf8').trim());
    } catch {
      throw new Error(`could not verify stale mutation harness lock: ${lockDir}`);
    }
    if (!Number.isSafeInteger(verifyPid) || verifyPid <= 0 || pidAlive(verifyPid)) {
      throw new Error(`mutation harness lock changed during stale recovery: ${lockDir}`);
    }
    const quarantine = `${lockDir}.stale-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      renameSync(lockDir, quarantine);
      unlinkSync(join(quarantine, 'owner'));
      unlinkSync(join(quarantine, 'recovery'));
      rmdirSync(quarantine);
    } catch {
      throw new Error(`could not quarantine stale mutation harness lock: ${lockDir}`);
    }
    mkdirSync(lockDir, { mode: 0o700 });
    writeFileSync(join(lockDir, 'owner'), owner, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (readFileSync(join(lockDir, 'owner'), 'utf8') !== owner) return;
      unlinkSync(join(lockDir, 'owner'));
      rmdirSync(lockDir);
    } catch {}
  };
  process.once('exit', release);
  return release;
}

export function assertContainedRegularFile(root, file) {
  if (typeof file !== 'string' || !file || file.startsWith('-') || file.includes('\0')) throw new Error(`invalid mutation target: ${file}`);
  // macOS commonly exposes temporary directories through `/var` while
  // realpath returns `/private/var`. Canonicalize the root as well as the
  // target or a valid in-repo file is falsely classified as escaping.
  const canonicalRoot = realpathSync(root);
  const lexical = resolve(canonicalRoot, file);
  const rel = relative(canonicalRoot, lexical);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || /^[A-Za-z]:[\\/]/.test(rel)) {
    throw new Error(`mutation target escapes repository: ${file}`);
  }
  const stat = lstatSync(lexical);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`mutation target is not a regular file: ${file}`);
  const real = relative(canonicalRoot, realpathSync(lexical));
  if (!real || real === '..' || real.startsWith(`..${sep}`) || /^[A-Za-z]:[\\/]/.test(real)) {
    throw new Error(`mutation target resolves outside repository: ${file}`);
  }
  return lexical;
}
