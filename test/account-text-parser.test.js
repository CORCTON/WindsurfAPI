import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyToken,
  isValidEmail,
  looksLikeToken,
  parseAccountText,
  unwrapPastedSecret,
} from '../src/dashboard/account-text-parser.js';

// WHY THIS FILE EXISTS. account-text-parser.js was one of four src/ files never named in
// test/, and the only one where that was a real gap: 440 lines of pure string parsing, no
// network and no side effects, reached directly from the dashboard's account-import path
// (src/dashboard/api.js). It is also the code that decides what counts as a credential —
// `devin-session-token$…`, `auth1_…`, and bare Firebase refresh JWTs each take a different
// path downstream, and it holds two silent `catch {}` blocks, so a misparse shows up as
// "the import did nothing" rather than as an error.
//
// Assertions are on behaviour with realistic-shaped fixtures. Every credential-looking value
// here is a `ws-fixture-*` literal or an obviously fake padded string: nothing that resembles
// a live token, and deliberately not the `sk-*` shape, which secret-scan flags.

const LONG = (prefix, n = 140) => prefix + 'x'.repeat(Math.max(0, n - prefix.length));

describe('classifyToken', () => {
  it('recognises the session-token prefix this repo actually issues', () => {
    // The `$` in `devin-session-token$<JWT>` is the character that once slipped past
    // secret-scan's own character class, so it is worth pinning that it classifies here.
    assert.equal(classifyToken('devin-session-token$ws-fixture-abc.def.ghi'), 'session');
    assert.equal(classifyToken('  devin-session-token$ws-fixture-abc  '), 'session', 'trims');
  });

  it('requires auth1_ tokens to reach the length floor', () => {
    assert.equal(classifyToken(`auth1_${'y'.repeat(30)}`), 'auth1');
    // 19 chars total: prefix present but under the >= 20 floor, so NOT auth1. It is also
    // under the refresh floor, so it lands on unknown rather than silently becoming refresh.
    assert.equal(classifyToken('auth1_yyyyyyyyyyyyy'), 'unknown');
  });

  it('treats a long opaque blob as a refresh token', () => {
    assert.equal(classifyToken(LONG('ws-fixture-refresh-')), 'refresh');
  });

  it('holds the refresh length floor at >100, so short opaque strings stay unknown', () => {
    // Without this the floor is unpinned: every other fixture here is far past 100 chars, so
    // relaxing `length > 100` to `> 5` survived a mutation run. A low floor would promote
    // ordinary short identifiers to credentials.
    assert.equal(classifyToken('x'.repeat(101)), 'refresh', '101 chars is over the floor');
    assert.equal(classifyToken('x'.repeat(100)), 'unknown', 'exactly 100 must not qualify');
    assert.equal(classifyToken('ws-fixture-short'), 'unknown');
  });

  it('classifies a long three-part JWT as refresh', () => {
    const jwt = `${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}`;
    assert.equal(classifyToken(jwt), 'refresh');
  });

  it('rejects the shapes that must NOT be mistaken for credentials', () => {
    assert.equal(classifyToken(''), 'unknown');
    assert.equal(classifyToken('   '), 'unknown');
    assert.equal(classifyToken(undefined), 'unknown');
    // An email is long enough to trip a naive length check; the @ exclusion is what stops it.
    assert.equal(classifyToken(`${'ws-fixture-'.repeat(12)}@example.test`), 'unknown');
    // Contains a space, so it is prose, not a token.
    assert.equal(classifyToken(LONG('this is a sentence ')), 'unknown');
    // `devin-` prefixed but not the session form: explicitly excluded from refresh.
    assert.equal(classifyToken(LONG('devin-something-else-')), 'unknown');
  });
});

describe('unwrapPastedSecret', () => {
  it('passes a bare session token through', () => {
    assert.equal(unwrapPastedSecret('  devin-session-token$ws-fixture-abc  '), 'devin-session-token$ws-fixture-abc');
  });

  it('pulls token= out of a show-auth-token URL', () => {
    const url = 'https://windsurf.com/show-auth-token?token=devin-session-token$ws-fixture-from-url';
    assert.equal(unwrapPastedSecret(url), 'devin-session-token$ws-fixture-from-url');
  });

  it('pulls access_token out of a hash fragment', () => {
    const url = 'https://windsurf.com/windsurf/signin#access_token=devin-session-token$ws-fixture-hash';
    assert.equal(unwrapPastedSecret(url), 'devin-session-token$ws-fixture-hash');
  });

  it('throws ERR_NO_TOKEN_IN_INPUT when the URL has no token param', () => {
    assert.throws(
      () => unwrapPastedSecret('https://windsurf.com/show-auth-token?state=abc'),
      /ERR_NO_TOKEN_IN_INPUT/,
    );
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const e of [
      'ws-fixture@example.test',
      'ws.fixture+tag@sub.example.test',
      'ws-fixture_1@example.co.uk',
    ]) {
      assert.equal(isValidEmail(e), true, e);
    }
  });

  it('rejects non-strings and out-of-range lengths', () => {
    assert.equal(isValidEmail(null), false);
    assert.equal(isValidEmail(undefined), false);
    assert.equal(isValidEmail(12345), false);
    assert.equal(isValidEmail('a@b'), false, 'under the 5-char floor');
    assert.equal(isValidEmail(`${'a'.repeat(250)}@example.test`), false, 'over 254');
  });

  it('rejects separators, which is what keeps pasted lists from parsing as one address', () => {
    // The dashboard accepts pasted blobs, so a value carrying a delimiter means the caller
    // split on the wrong thing — accepting it would attach one account to another's token.
    for (const bad of [
      'a@example.test b@example.test',
      'a@example.test,b@example.test',
      'a@example.test;b@example.test',
      'a@example.test，b@example.test',
      'a@example.test；b@example.test',
      'a@example.test\tb@example.test',
    ]) {
      assert.equal(isValidEmail(bad), false, bad);
    }
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['noatsign.example.test', '@example.test', 'a@', 'a@example', 'a@.test']) {
      assert.equal(isValidEmail(bad), false, bad);
    }
  });
});

describe('looksLikeToken', () => {
  it('is a coarse gate, so only assert what the parser relies on', () => {
    assert.equal(looksLikeToken('devin-session-token$ws-fixture-abc'), true);
    assert.equal(looksLikeToken(''), false);
    assert.equal(looksLikeToken(null), false);
  });
});

describe('parseAccountText', () => {
  it('pairs an email with the token that follows it', () => {
    const out = parseAccountText(
      `ws-fixture-1@example.test\ndevin-session-token$${'a'.repeat(30)}\n`,
    );
    assert.equal(out.tokenPairs.length, 1);
    assert.equal(out.tokenPairs[0].email, 'ws-fixture-1@example.test');
    assert.match(out.tokenPairs[0].token, /^devin-session-token\$/);
  });

  it('pairs an email with a LABELLED password', () => {
    // A bare line after an email is NOT treated as a password — passwords are only
    // recognised behind a label (RE_LABEL_PASS) or across a ---- delimiter. That is the
    // safe direction: guessing would turn any stray line into a credential.
    const out = parseAccountText(
      'email: ws-fixture-2@example.test\npassword: ws-fixture-pass-9\n',
    );
    assert.equal(out.accounts.length, 1);
    assert.equal(out.accounts[0].email, 'ws-fixture-2@example.test');
    assert.equal(out.accounts[0].password, 'ws-fixture-pass-9');
  });

  it('accepts the Chinese labels too, since the dashboard is bilingual', () => {
    const out = parseAccountText('邮箱：ws-fixture-3@example.test\n密码：ws-fixture-pass-7\n');
    assert.equal(out.accounts.length, 1);
    assert.equal(out.accounts[0].email, 'ws-fixture-3@example.test');
    assert.equal(out.accounts[0].password, 'ws-fixture-pass-7');
  });

  it('parses the ----separated form', () => {
    const out = parseAccountText(`ws-fixture-4@example.test----ws-fixture-pass-4\n`);
    assert.equal(out.accounts.length, 1, JSON.stringify(out));
    assert.equal(out.accounts[0].email, 'ws-fixture-4@example.test');
    assert.equal(out.accounts[0].password, 'ws-fixture-pass-4');
  });

  it('does not treat a bare line after an email as a password', () => {
    const out = parseAccountText('ws-fixture-5@example.test\njust some note\n');
    assert.equal(out.accounts.length, 0, 'an unlabelled line must not become a credential');
  });

  it('keeps an unpaired token as a bare token rather than dropping it', () => {
    // Silently discarding a credential is the failure mode that reads as "import did
    // nothing", so pin that a token with no preceding email still comes out.
    const out = parseAccountText(`devin-session-token$${'b'.repeat(30)}\n`);
    assert.equal(out.tokenPairs.length, 0);
    assert.equal(out.tokens.length, 1);
    assert.match(out.tokens[0], /^devin-session-token\$/);
  });

  it('does not merge two accounts when a token is missing between them', () => {
    const out = parseAccountText(
      [
        'ws-fixture-a@example.test',
        `devin-session-token$${'c'.repeat(30)}`,
        'ws-fixture-b@example.test',
        `devin-session-token$${'d'.repeat(30)}`,
      ].join('\n'),
    );
    assert.equal(out.tokenPairs.length, 2);
    assert.deepEqual(
      out.tokenPairs.map((p) => p.email),
      ['ws-fixture-a@example.test', 'ws-fixture-b@example.test'],
    );
    assert.notEqual(out.tokenPairs[0].token, out.tokenPairs[1].token, 'no cross-wiring');
  });

  it('returns the four buckets even for input it cannot use', () => {
    for (const input of ['', '   \n\n  ', 'just some prose with no credentials at all']) {
      const out = parseAccountText(input);
      assert.deepEqual(Object.keys(out).sort(), [
        'accounts',
        'githubAccounts',
        'tokenPairs',
        'tokens',
      ]);
      for (const k of Object.keys(out)) assert.ok(Array.isArray(out[k]), `${k} is an array`);
    }
  });

  it('tolerates non-string input instead of throwing into the dashboard', () => {
    for (const bad of [null, undefined, 42, {}]) {
      assert.doesNotThrow(() => parseAccountText(bad), String(bad));
    }
  });
});
