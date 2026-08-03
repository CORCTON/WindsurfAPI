// Behavioural coverage for the dashboard's two escaping helpers.
//
// The dashboard has 178 `this.esc(` and 29 `this.escJsAttr(` call sites, and until
// now NOT ONE test executed either function. The only guard was a set of source
// assertions checking that four declaration strings exist
// (`const safeKey = this.esc(key)` and friends). Measured: replacing both bodies
// with `return String(s)` — i.e. deleting the dashboard's XSS protection outright,
// repo-wide — left dashboard-syntax at 12/12 and the whole 3100-test suite green
// apart from an unrelated environmental failure.
//
// That is the "source grep masquerading as a behaviour guard" antipattern in its
// purest form: the assertion is satisfied by the string still being in the file.
// The discriminator that catches it: if this feature were COMPLETELY broken, would
// this assertion fail? For a declaration-string match, no.
//
// Both helpers are pure, self-contained string functions, so they can be extracted
// from the HTML and actually RUN. That is what this file does. It deliberately does
// not re-assert the declaration strings — dashboard-syntax.test.js still owns those,
// and they remain useful as a cheap "the call sites still route through the helper"
// check. This file owns the question they cannot answer: does the helper still
// escape?
//
// Scope note: these are operator-facing surfaces (batch-imported account labels,
// proxy strings, system-prompt bodies), so the realistic threat is a hostile import
// or self-XSS rather than an unauthenticated remote attacker. That lowers the
// severity, not the requirement — the helpers exist precisely so those values
// cannot break out of their context.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../src/dashboard/index.html', import.meta.url), 'utf8');

// Pull one method body out of the App object literal and turn it into a callable
// function. Extracting rather than reimplementing is the point: a test that
// reimplements the escaping would keep passing while production degraded (the
// "mirror implementation" antipattern this repo has also been bitten by).
function extractMethod(name) {
  const at = HTML.indexOf(`\n  ${name}(s)`);
  assert.notEqual(at, -1, `${name}(s) must exist in the dashboard as a single-argument method`);
  const open = HTML.indexOf('{', at);
  let depth = 0;
  let end = -1;
  for (let i = open; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  assert.notEqual(end, -1, `could not delimit the body of ${name}`);
  const body = HTML.slice(open, end);
  // eslint-disable-next-line no-new-func -- executing the shipped source is the point
  return new Function('s', `return (function ${name}(s) ${body}).call(null, s);`);
}

let esc;
let escJsAttr;

before(() => {
  esc = extractMethod('esc');
  escJsAttr = extractMethod('escJsAttr');
});

describe('esc() neutralises HTML context breakouts', () => {
  it('escapes every character that can leave a text or attribute context', () => {
    // One assertion per character class, so a partial regression names itself.
    const cases = [
      ['&', '&amp;'],
      ['<', '&lt;'],
      ['>', '&gt;'],
      ['"', '&quot;'],
      ["'", '&#39;'],
    ];
    for (const [raw, encoded] of cases) {
      assert.equal(esc(raw), encoded, `esc(${JSON.stringify(raw)}) must yield ${encoded}`);
    }
  });

  it('a script-injection payload cannot survive as markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const out = esc(payload);
    assert.doesNotMatch(out, /<img/, 'the tag must not survive');
    assert.doesNotMatch(out, /[<>]/, 'no raw angle brackets may remain');
    assert.match(out, /&lt;img/, 'it must be encoded, not stripped');
  });

  it('a textarea breakout is neutralised (the system-prompt body sink)', () => {
    // Prompt bodies are stored verbatim and rendered inside <textarea>, where
    // `</textarea>` is the breakout.
    const out = esc('</textarea><img src=x onerror=alert(document.domain)>');
    assert.doesNotMatch(out, /<\/textarea>/i, 'the closing tag must not survive');
    assert.doesNotMatch(out, /[<>]/);
  });

  it('an attribute breakout is neutralised (the account-label sink)', () => {
    // Labels and emails land in `title="..."` and inline onclick handlers.
    const out = esc('" onmouseover="alert(1)');
    assert.doesNotMatch(out, /"/, 'no raw double quote may remain');
    assert.match(out, /&quot;/);
  });

  it('ampersand is escaped FIRST so encodings cannot be double-decoded', () => {
    // If `&` were escaped last, `&lt;` in the input would come out as `&lt;`
    // rather than `&amp;lt;`, and one HTML decode would revive a real `<`.
    assert.equal(esc('&lt;'), '&amp;lt;',
      'a pre-encoded entity must be re-encoded, or a single decode revives the tag');
  });

  it('null and undefined become the empty string, not "null"', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });

  it('leaves ordinary text untouched', () => {
    assert.equal(esc('claude-sonnet-4.6 (pro)'), 'claude-sonnet-4.6 (pro)');
  });
});

describe('escJsAttr() neutralises JS-string context breakouts', () => {
  it('escapes every character that can terminate or extend a JS string literal', () => {
    const cases = [
      ['\\', '\\\\'],
      ["'", "\\'"],
      ['"', '\\"'],
      ['<', '\\x3c'],
      ['>', '\\x3e'],
      ['&', '\\x26'],
      ['\r', '\\r'],
      ['\n', '\\n'],
      // Written as escape sequences, never literally: a raw U+2028/U+2029 is a line
      // terminator, and inside a regex literal it breaks the whole source file.
      // escJsAttr's own comment warns about exactly this, and this test's first
      // draft walked straight into it.
      ['\u2028', '\\u2028'],
      ['\u2029', '\\u2029'],
    ];
    for (const [raw, encoded] of cases) {
      assert.equal(escJsAttr(raw), encoded,
        `escJsAttr(${JSON.stringify(raw)}) must yield ${encoded}`);
    }
  });

  it('a quote-breakout cannot inject a second call into an inline handler', () => {
    // The real sink: onclick="App.editAccountProxy('${escJsAttr(id)}','${escJsAttr(email)}')"
    const out = escJsAttr("a'); App.deleteAccount('victim");
    assert.doesNotMatch(out, /(?<!\\)'/, 'no unescaped single quote may remain');
    assert.match(out, /\\'/);
  });

  it('a closing script tag cannot be smuggled through', () => {
    const out = escJsAttr('</script><img src=x onerror=alert(1)>');
    assert.doesNotMatch(out, /<\/script/i);
    assert.doesNotMatch(out, /[<>]/, 'angle brackets must become \\x3c / \\x3e');
  });

  it('the backslash is escaped so a trailing one cannot eat the closing quote', () => {
    // `foo\` unescaped would make the generated `'foo\'` swallow its own terminator.
    assert.equal(escJsAttr('foo\\'), 'foo\\\\');
  });

  it('line separators cannot break the generated statement', () => {
    const out = escJsAttr('a\u2028b\nc\rd');
    assert.doesNotMatch(out, /[\u2028\u2029\r\n]/, 'no raw line terminator may remain');
  });

  it('null and undefined become the empty string', () => {
    assert.equal(escJsAttr(null), '');
    assert.equal(escJsAttr(undefined), '');
  });
});

// The same antipattern, one screen over: the drought fail-open banner.
//
// dashboard-syntax.test.js guards it with `assert.match(html, /d\.restrictionFailOpen/)`
// plus a match on the i18n key. Negating the branch condition leaves both strings
// byte-identical, so the operator can be shown the fail-open warning exactly when
// restriction is NOT failing open (and the ordinary drought text when it IS) with
// the suite fully green. The banner is the only surface for that state, and it is
// about to become more load-bearing: the free-model list it sits next to is
// backend-dependent, so an inverted banner would mislead precisely when the
// operator most needs it.
describe('the drought fail-open banner picks the message its state calls for', () => {
  // Pull just the ternary and evaluate it, rather than reimplementing the choice.
  function chooseMessage(restrictionFailOpen) {
    const at = HTML.indexOf('msg.textContent = d.restrictionFailOpen');
    assert.notEqual(at, -1, 'the fail-open branch must exist in loadDrought');
    const end = HTML.indexOf(';', HTML.indexOf('I18n.t(', at));
    const expr = HTML.slice(at + 'msg.textContent = '.length, end);
    // eslint-disable-next-line no-new-func -- executing the shipped branch is the point
    const pick = new Function('d', 'I18n', 'msg', `return ${expr};`);
    return pick(
      { restrictionFailOpen },
      { t: (k) => `i18n:${k}` },
      { textContent: 'i18n:drought.body' },
    );
  }

  it('shows the fail-open warning only when restriction is failing open', () => {
    assert.match(
      chooseMessage(true), /restrictionFailOpen/,
      'with restrictionFailOpen=true the operator must see the fail-open warning',
    );
  });

  it('shows the ordinary drought text when restriction is working normally', () => {
    assert.doesNotMatch(
      chooseMessage(false), /restrictionFailOpen/,
      'with restrictionFailOpen=false the operator must NOT be told the restriction failed open — '
      + 'an inverted condition keeps every source-level assertion satisfied while showing the '
      + 'operator the exact opposite of the truth',
    );
  });
});

// Meta-check. The whole reason this file exists is that a guard which never
// executes the helper cannot notice it being neutered. Prove the extraction is
// real rather than silently returning a stub: a stubbed-out helper would pass every
// "leaves ordinary text untouched" style assertion, so pin one property that only
// a genuinely escaping implementation has.
describe('the extraction actually runs the shipped implementation', () => {
  it('the extracted helpers are not identity functions', () => {
    const probe = `<>&"'`;
    assert.notEqual(esc(probe), probe,
      'esc() behaved like an identity function — the extraction is not reaching the real body, '
      + 'or the dashboard has lost its escaping');
    assert.notEqual(escJsAttr(probe), probe,
      'escJsAttr() behaved like an identity function');
  });

  it('both helpers are read from the shipped dashboard, not reimplemented here', () => {
    // Guards against this file drifting into a mirror implementation, which would
    // keep passing while production degraded.
    assert.match(HTML, /\n {2}esc\(s\)/, 'esc must remain a one-arg method for extraction to work');
    assert.match(HTML, /\n {2}escJsAttr\(s\)/, 'escJsAttr must remain a one-arg method');
  });
});
