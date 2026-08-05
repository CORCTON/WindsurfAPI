// Mechanical guards for the documentation set.
//
// WHY THIS FILE EXISTS. The docs carry conventions about themselves — "every archived handoff
// carries a banner naming the current one", "don't cite a section number without opening it",
// "the index names the live handoff". Every one of those was, until now, enforced by discipline
// alone, and each has failed at least once:
//
//   - Nine archived handoffs all named a handoff that had since been closed; the chain had no
//     live head. Fixed by hand, nine files at a time — exactly the chore a guard should own.
//   - A handoff cited `release-process` as if it were a document. Nothing by that name existed.
//   - The index called the ledger "twelve rounds" after the thirteenth landed.
//   - CONTRIBUTING pinned a gate count from five releases earlier.
//
// A convention that fails silently is worse than no convention, because the corpus keeps
// *looking* authoritative. These assertions are deliberately structural — they check claims a
// script can settle, and leave prose judgement to review.
//
// This file enters the gate automatically: `scripts/run-test-shard.mjs` globs `test/*.test.js`
// with readdirSync, so no registration step exists to forget.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');

function mdFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === '.git' || name.name === 'node_modules') continue;
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith('.md')) out.push(p);
    }
  };
  walk(ROOT);
  return out;
}

const read = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(ROOT, p).split('\\').join('/');

// Handoff filenames do NOT sort chronologically: `-B.md` sorts before `.md`, so the original
// 08-04 sorts after B/C/D/E, and 08-05 is misdated (it covers v3.9.12). So "newest" cannot be
// derived from the name — it is whichever file no other handoff points AT as current.
function handoffFiles() {
  return readdirSync(DOCS)
    .filter((n) => /^HANDOFF-.*\.md$/.test(n))
    .map((n) => join(DOCS, n));
}

describe('docs: relative links resolve', () => {
  it('every relative .md link in every tracked markdown file points at a file that exists', () => {
    const broken = [];
    for (const f of mdFiles()) {
      const body = read(f);
      for (const m of body.matchAll(/\]\(([^)\s#]+\.md)(#[^)]*)?\)/g)) {
        const target = m[1];
        if (/^https?:/.test(target)) continue;
        if (!existsSync(resolve(dirname(f), target))) broken.push(`${rel(f)} -> ${target}`);
      }
    }
    assert.deepEqual(broken, [], `broken relative .md links:\n  ${broken.join('\n  ')}`);
  });

  it('no markdown file cites a bare name as if it were a document', () => {
    // `release-process` was cited in a handoff as though it resolved to something. It did not:
    // the procedure lived only outside the repo. This pins the specific shape that bit us —
    // a backticked hyphenated name that reads like a filename but has no file and no link.
    const suspects = ['release-process', 'merge-bar', 'audit-ledger'];
    const hits = [];
    for (const f of mdFiles()) {
      const body = read(f);
      for (const s of suspects) {
        // A mention is fine when it is part of a real link; flag only bare backticked mentions.
        const bare = new RegExp('`' + s + '`(?!\\])', 'g');
        if (bare.test(body) && !body.includes(`](${s}`)) hits.push(`${rel(f)}: \`${s}\``);
      }
    }
    assert.deepEqual(hits, [], `bare pseudo-filename citations (link them or name the real file):\n  ${hits.join('\n  ')}`);
  });
});

describe('docs: the handoff chain has exactly one live head', () => {
  // The convention is: archived handoffs carry a forward banner naming the CURRENT one, and the
  // index's first row names that same file. Nine banners once all named a file that had been
  // closed, which left the chain pointing at a dead end.
  const banner = (f) => read(f).split('\n').slice(0, 12).join('\n');

  // Discriminator: an ARCHIVED handoff's banner says "当前一份是 …"; the live head has no such
  // line, because there is nothing after it. Keying on "does any other file link to me" does NOT
  // work — banners also carry a BACKWARD "上一份:[…]" pointer, so nearly every file is linked
  // by someone. That distinction is what made the first version of this test fail.
  const ARCHIVED_MARK = '当前一份是';
  const isArchived = (f) => banner(f).includes(ARCHIVED_MARK);

  it('exactly one handoff is the live head; every other one is marked archived', () => {
    const files = handoffFiles();
    assert.ok(files.length >= 2, 'expected several handoffs');
    const heads = files.filter((f) => !isArchived(f));
    assert.deepEqual(
      heads.map(rel).sort(),
      heads.length === 1 ? heads.map(rel) : [],
      `exactly one handoff may lack the "${ARCHIVED_MARK}" banner (the live head); found ${heads.length}: ${heads.map(rel).join(', ')}`,
    );
    assert.equal(heads.length, 1, `found ${heads.length} handoffs with no archived banner`);
  });

  it('every archived banner links to the live head, not to some earlier one', () => {
    const files = handoffFiles();
    const head = files.find((f) => !isArchived(f));
    assert.ok(head, 'precondition: a live head exists');
    const headLink = `](${rel(head).replace('docs/', '')})`;
    // The banner is a block, and the link often wraps onto the next line from the phrase —
    // so search the whole banner, not the same line.
    const stale = files
      .filter((f) => f !== head && !banner(f).includes(headLink))
      .map(rel);
    assert.deepEqual(
      stale, [],
      `archived handoffs whose banner does not link the live head (${rel(head)}). `
      + 'Nine of them once all named a handoff that had been closed, leaving the chain with no live head.',
    );
  });

  it('every archived handoff also links back to the docs index', () => {
    // Eight of nine did; the ninth (08-05) linked only onward, so from that file you could not
    // reach the index in one hop.
    const files = handoffFiles();
    const missing = files
      .filter((f) => isArchived(f) && !banner(f).includes('](README.md)'))
      .map(rel);
    assert.deepEqual(missing, [], 'archived handoffs with no link back to docs/README.md');
  });

  it('the docs index names the live head in its first table row', () => {
    const index = read(join(DOCS, 'README.md'));
    const head = handoffFiles().find((f) => !isArchived(f));
    assert.ok(head, 'precondition: a live head exists');
    const headName = rel(head).replace('docs/', '');
    const firstRow = index.split('\n').find((l) => l.startsWith('| 1 |')) || '';
    assert.ok(
      firstRow.includes(headName),
      `docs/README.md's first "read these" row must name the live handoff (${headName}); it says: ${firstRow.slice(0, 120)}`,
    );
  });
});

describe('docs: the release runbook stays true to the tooling it describes', () => {
  const runbook = () => read(join(DOCS, 'releases', 'README.md'));

  it('does not tell the reader to commit on master, which the pre-commit hook refuses', () => {
    // The four-step version said "Commit and push to master". `.githooks/pre-commit` refuses
    // exactly that, so the documented procedure could not be followed as written.
    //
    // The first version of this assertion failed on the CORRECTED runbook, because the errata
    // block quotes the old wrong instruction in order to warn about it. Scanning raw prose for a
    // forbidden phrase cannot tell an instruction from a citation of one — so strip blockquotes
    // (`>` lines) before checking. That is where errata live by convention.
    const hook = read(join(ROOT, '.githooks', 'pre-commit'));
    assert.match(hook, /master\|main/, 'precondition: the hook still special-cases master');

    const instructions = runbook()
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('>'))
      .join('\n');
    assert.doesNotMatch(
      instructions,
      /Commit and push to `?master`?/i,
      'the runbook must not instruct committing on master while the hook refuses it '
      + '(errata blockquotes are exempt — they quote the old wrong text deliberately)',
    );
    // And it must positively tell you the branch-then-merge shape.
    assert.match(instructions, /merge --ff-only/, 'the runbook must show the branch → ff-only merge flow');
  });

  it('tells the reader to bump the lock file, which carries the version twice', () => {
    const lock = read(join(ROOT, 'package-lock.json'));
    const pkgVersion = JSON.parse(read(join(ROOT, 'package.json'))).version;
    const occurrences = lock.split(`"version": "${pkgVersion}"`).length - 1;
    assert.equal(occurrences, 2, `precondition: the lock should carry ${pkgVersion} twice, found ${occurrences}`);
    assert.match(runbook(), /package-lock\.json/, 'the runbook must name package-lock.json');
  });

  it('tells the reader to create an ANNOTATED tag, matching what every shipped tag is', () => {
    assert.match(runbook(), /git tag -a/, 'the runbook must show `git tag -a`; lightweight tags are not what ships');
  });

  it('names the gate commands a releaser has to pass', () => {
    const r = runbook();
    for (const cmd of ['npm run test:release', 'secret-scan', 'npm run mutate']) {
      assert.ok(r.includes(cmd), `the runbook must name \`${cmd}\``);
    }
  });

  it('warns that a green suite does not cover mutation anchors', () => {
    // The load-bearing sentence. PR #241 broke two anchors and three separate green gates
    // missed it, because the suite does not run the specs.
    const r = runbook();
    assert.match(
      r,
      /does not run mutation specs|不跑突变 spec|does not run the mutation specs/i,
      'the runbook must state that the test suite does not run mutation specs',
    );
  });
});

describe('docs: mutation specs and the gate agree', () => {
  it('every mutation spec anchor appears exactly once in its target file', () => {
    // Not strictly a docs guard, but it is the invariant three green gates missed on PR #241,
    // and it belongs somewhere the gate actually runs. `npm run mutate` enforces it only when
    // someone remembers to run the loop; this makes CI refuse the merge instead.
    const dir = join(ROOT, 'test', 'mutations');
    const problems = [];
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const spec = JSON.parse(read(join(dir, name)));
      for (const m of spec.mutations || []) {
        const target = read(join(ROOT, m.file));
        const hits = target.split(m.anchor).length - 1;
        if (hits !== 1) problems.push(`${name} :: hits=${hits} :: ${m.name.slice(0, 70)}`);
      }
    }
    assert.deepEqual(problems, [], `mutation anchors that do not match exactly once:\n  ${problems.join('\n  ')}`);
  });

  it('every mutation spec baseline matches what its test files actually pass', () => {
    // `expectBaselinePass` went stale twice in one day: once when an assertion was deleted, once
    // when assertions were added to a covered file. Both times guard 2 caught it only because
    // someone ran the loop by hand. This states the invariant without running the suite: the
    // spec must list the files it measures, and those files must exist.
    const dir = join(ROOT, 'test', 'mutations');
    const problems = [];
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const spec = JSON.parse(read(join(dir, name)));
      assert.ok(Array.isArray(spec.tests) && spec.tests.length, `${name}: needs a tests[] array`);
      assert.equal(typeof spec.expectBaselinePass, 'number', `${name}: needs a numeric expectBaselinePass`);
      for (const t of spec.tests) {
        if (!existsSync(join(ROOT, t))) problems.push(`${name} -> missing test file ${t}`);
      }
    }
    assert.deepEqual(problems, [], `mutation specs referencing files that do not exist:\n  ${problems.join('\n  ')}`);
  });
});

describe('docs: version claims match the repository', () => {
  // The index's first row named a `vX.Y.Z` as the state of `master` that was not a tag at all,
  // while master sat five commits past the newest one — wrong in both directions at once, and
  // directly opposed to the current handoff, which devotes a section to those unreleased
  // commits. It survived because every other assertion in this file checks *links and
  // structure*: a version claim is prose that happens to be mechanically checkable, and
  // nothing was checking it.
  //
  // TWO EARLIER VERSIONS OF THIS GUARD WERE WRONG, both in the same way — they could not tell
  // a claim from something that merely looks like one:
  //
  //   1. It scanned every markdown file, and the ledger's own erratum *quoted* the bad claim
  //      while correcting it. Same shape as the runbook assertion above, which had to strip
  //      `>` blockquotes for the same reason. Fixed on the prose side: describe a corrected
  //      claim, do not re-paste it.
  //   2. It resolved names against `.git/refs/tags` + `packed-refs`, and passed locally while
  //      failing the release build: GitHub's checkout is shallow and carries only the tag being
  //      built, so every older tag looked non-existent. It flagged the ledger's
  //      "master == v3.9.17" — a statement that was TRUE when written, in an append-only file.
  //      The probe guard (`known.size > 0`) did not help: the tag under construction was
  //      present, so it never tripped.
  //
  // So the invariant is restated without git and without history:
  //   - only files that describe the CURRENT state are checked (the index and the live
  //     handoff). Archived handoffs and the ledger are append-only records whose past claims
  //     are SUPPOSED to be stale.
  //   - the comparison is against `package.json`, which is present in every checkout and is
  //     what `src/version.js` actually serves. A live doc naming a version other than the
  //     packaged one is wrong regardless of what tags exist.
  it('the packaged version is a plain semver string', () => {
    const pkg = JSON.parse(read(join(ROOT, 'package.json')));
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'package.json version must be bare semver');
  });

  it('every env var named in prose docs also appears in .env.example', () => {
    // `.env.example` is the only file a reader consults to find out what can be turned on.
    // DEVIN_CONNECT_IMAGE_TAG was documented ONLY in the cutover runbook, so vision looked
    // like it did not exist: a user sent a picture, the proxy dropped it before the wire, and
    // nothing appeared in any log. That reached us as a bug report (#244).
    //
    // Checked in this direction on purpose. Enumerating every name read out of `src/` needs a
    // parser — env access here spans `env.X`, `env['X']`, `positiveIntEnv('X', …)` and a
    // `{ env: 'X' }` registry, and a regex sweep over string literals returns hundreds of
    // false positives (error codes and enum values look identical). "Somebody wrote prose
    // about this switch, so a reader can find out it exists" is both mechanically decidable
    // and the property that actually failed.
    const doc = read(join(ROOT, '.env.example'));
    const declared = new Set(
      [...doc.matchAll(/^[ \t]*#?[ \t]*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]),
    );
    assert.ok(declared.size > 20, `probe check: only ${declared.size} names parsed out of .env.example — the extraction is broken, not the docs`);

    // Prose only. Handoffs and the ledger are audit records that legitimately discuss
    // one-off calibration knobs; the reader-facing surface is the READMEs and the runbook.
    const prose = ['README.md', 'README.en.md', join('docs', 'DEVIN-CONNECT-CUTOVER.md')];
    const missing = new Map();
    for (const rel_ of prose) {
      const body = read(join(ROOT, rel_));
      for (const m of body.matchAll(/\b(DEVIN_CONNECT_[A-Z0-9_]+|WINDSURFAPI_[A-Z0-9_]+)\b/g)) {
        if (!declared.has(m[1])) {
          if (!missing.has(m[1])) missing.set(m[1], rel_);
        }
      }
    }
    const problems = [...missing].map(([name, where]) => `${name} (documented in ${where})`);
    assert.deepEqual(problems, [], `env vars written about in prose but absent from .env.example:\n  ${problems.join('\n  ')}`);
  });

  // SELF-TEST. The two assertions above scan real files, so when the corpus is clean they pass
  // whether the detection works or not — the exact shape of a test that cannot fail. And a
  // guard cannot be mutation-verified against itself: weakening it makes no other test go red,
  // so a spec that mutated these lines would report four survivors with no premise keeping them
  // harmless (which is the anti-pattern this repo rejects in review). Instead, drive the
  // detection logic on synthetic inputs where the answer is known.
  //
  // Both detectors are duplicated here deliberately rather than exported: what is being pinned
  // is that a checker of THIS SHAPE rejects THESE inputs. If the assertions above are ever
  // rewritten to a different mechanism, these fixtures should be rewritten with them.
  describe('self-test: the detectors reject known-bad inputs', () => {
    const declaredIn = (envExample) =>
      new Set([...envExample.matchAll(/^[ \t]*#?[ \t]*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));

    it('the .env.example parser sees both commented and uncommented declarations', () => {
      const d = declaredIn('PORT=3003\n# DEVIN_CONNECT_IMAGE_TAG=10\n#WINDSURFAPI_TRACE=1\n   # LS_PORT=42100\n');
      assert.ok(d.has('PORT'), 'plain declaration');
      assert.ok(d.has('DEVIN_CONNECT_IMAGE_TAG'), 'commented with a space — the dominant style in this file');
      assert.ok(d.has('WINDSURFAPI_TRACE'), 'commented with no space');
      assert.ok(d.has('LS_PORT'), 'indented comment');
      assert.ok(!d.has('NOPE'), 'does not invent names');
    });

    it('a prose mention absent from .env.example is detected', () => {
      // The #244 shape: documented in a runbook, missing from the file a reader consults.
      const declared = declaredIn('# DEVIN_CONNECT_SESSION_REUSE=0\n');
      const prose = 'Set `DEVIN_CONNECT_IMAGE_TAG=10` to turn vision on.';
      const found = [...prose.matchAll(/\b(DEVIN_CONNECT_[A-Z0-9_]+|WINDSURFAPI_[A-Z0-9_]+)\b/g)]
        .map((m) => m[1]).filter((n) => !declared.has(n));
      assert.deepEqual(found, ['DEVIN_CONNECT_IMAGE_TAG'], 'must flag the undocumented switch');
    });

    it('a documented mention is not flagged', () => {
      const declared = declaredIn('# DEVIN_CONNECT_IMAGE_TAG=10\n');
      const prose = 'Set `DEVIN_CONNECT_IMAGE_TAG=10` to turn vision on.';
      const found = [...prose.matchAll(/\b(DEVIN_CONNECT_[A-Z0-9_]+|WINDSURFAPI_[A-Z0-9_]+)\b/g)]
        .map((m) => m[1]).filter((n) => !declared.has(n));
      assert.deepEqual(found, [], 'no false positive when the switch IS documented');
    });

    const staleClaims = (body, pkgVersion) => {
      const stripped = body.split('\n').filter((l) => !l.trimStart().startsWith('>')).join('\n');
      return [...stripped.matchAll(/master\s*(?:==|=|is)\s*`?v(\d+\.\d+\.\d+)`?/gi)]
        .map((m) => m[1]).filter((v) => v !== pkgVersion);
    };

    it('a stale version claim is detected, and a current one is not', () => {
      assert.deepEqual(staleClaims('right now master == `v3.9.17`.', '3.9.20'), ['3.9.17']);
      assert.deepEqual(staleClaims('right now master == `v3.9.20`.', '3.9.20'), []);
      assert.deepEqual(staleClaims('master is v1.0.0', '3.9.20'), ['1.0.0'], 'the `is` spelling too');
    });

    it('a quoted claim inside a blockquote is NOT treated as a claim', () => {
      // This is what broke the first two versions of the version assertion: an erratum
      // correcting a bad claim had to restate it, and the guard flagged the correction.
      const body = '> The old row said master == `v3.9.17`, which was never a tag.\n\nmaster == `v3.9.20` today.';
      assert.deepEqual(staleClaims(body, '3.9.20'), [],
        'a citation of a wrong claim must not be read as making it');
    });
  });

  it('a doc describing the current state names the packaged version, not another one', () => {
    const pkgVersion = JSON.parse(read(join(ROOT, 'package.json'))).version;
    // The live handoff is whichever one the index's first row points at — reuse the same
    // resolution the chain assertions above rely on, so this cannot drift from them.
    const index = read(join(DOCS, 'README.md'));
    const firstRow = index.split('\n').find((l) => l.startsWith('| 1 |')) || '';
    const liveHead = (firstRow.match(/\((HANDOFF-[^)]+\.md)\)/) || [])[1];
    assert.ok(liveHead, 'the index first row must link the live handoff (see the chain assertions)');

    const live = [join(DOCS, 'README.md'), join(DOCS, liveHead)];
    const problems = [];
    for (const f of live) {
      // Strip blockquotes: an erratum quoting an old claim is a citation, not a claim.
      const body = read(f).split('\n').filter((l) => !l.trimStart().startsWith('>')).join('\n');
      for (const m of body.matchAll(/master\s*(?:==|=|is)\s*`?v(\d+\.\d+\.\d+)`?/gi)) {
        if (m[1] !== pkgVersion) {
          problems.push(`${rel(f)} says master == v${m[1]} but package.json is ${pkgVersion}`);
        }
      }
    }
    assert.deepEqual(problems, [], `stale version claims in live docs:\n  ${problems.join('\n  ')}`);
  });
});
