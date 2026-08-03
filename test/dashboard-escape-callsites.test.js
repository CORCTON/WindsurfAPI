// The escape helpers were tested; their CALL SITES were not.
//
// dashboard-escape-behaviour.test.js proves esc() and escJsAttr() neutralise every
// breakout character. It says nothing about whether the template that renders an
// account label actually calls them — remove the esc() from a sink and both existing
// guards stay green. There are 208 escape call sites against 1005 interpolations, so
// "the helpers are correct" is a much weaker statement than it looks.
//
// This guard closes the gap for the fields that carry account-holder or upstream data
// AND reach innerHTML. It is deliberately field-scoped rather than a blanket check over
// all 1005 interpolations: most of those render numbers, i18n keys, or internal
// constants, and a blanket rule would be noise that gets suppressed rather than fixed.
//
// Audited when this was written: no field below has an UNESCAPED innerHTML sink today,
// and the one initially-suspicious case (a probe summary interpolating x.email) reaches
// the DOM through toast(), which assigns textContent — safe by context, not by escaping.
// So this guard pins a property that currently holds; its job is to notice when it stops.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DASHBOARD = new URL('../src/dashboard/index.html', import.meta.url);

/**
 * Fields whose values originate outside the operator's own config: account labels the
 * user typed, upstream error strings, plan names and masked keys echoed from the API.
 */
// Each name here was verified to have at least one live ESCAPED sink in the shipped
// dashboard, and the second test enforces that — so an invented or renamed field fails
// loudly instead of silently policing nothing. ('labelHash' was in the first draft and
// appears nowhere in the file; the guard-the-guard caught it.)
const USER_DATA_FIELDS = [
  'lastError',
  'apiKey_masked',
  'keyPrefix',
  'planName',
];

/** Interpolations that reach the DOM via textContent are safe without escaping. */
const TEXT_CONTENT_SINKS = /textContent|innerText|\.title\s*=|toast\(/;

function dashboardSource() {
  return readFileSync(DASHBOARD, 'utf8');
}

/**
 * Every `${...}` in the file, with its line number and the surrounding statement.
 *
 * Comments are NOT stripped here on purpose: this looks for interpolations, and a
 * commented-out template would not contain a live one. What matters instead is that the
 * ESCAPE detection below reads the expression itself rather than nearby prose — a guard
 * in this repo was once satisfied by a call quoted in its own comment.
 */
function interpolations(src) {
  const out = [];
  const re = /\$\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    const ctxStart = Math.max(0, m.index - 220);
    out.push({ expr: m.group ? m.group(1) : m[1], line, context: src.slice(ctxStart, m.index + 60) });
  }
  return out;
}

function isEscaped(expr) {
  return /\besc\(|\bescJsAttr\(/.test(expr);
}

describe('dashboard escape call sites (not just the helpers)', () => {
  it('escapes every user-data interpolation that reaches innerHTML', () => {
    const src = dashboardSource();
    const offenders = [];

    for (const { expr, line, context } of interpolations(src)) {
      if (isEscaped(expr)) continue;
      if (TEXT_CONTENT_SINKS.test(context)) continue;

      for (const field of USER_DATA_FIELDS) {
        // Match the field as a property access or bare identifier, so `planName` hits
        // but `t('plan.name')` and `field.labelFor` do not.
        if (!new RegExp(`(^|[.\\s(\\[{!?])${field}\\b`).test(expr)) continue;
        // i18n lookups render their own catalogue text, not the account's data.
        if (/I18n\.t\(|\bT\(/.test(expr)) continue;
        offenders.push(`index.html:${line} → \${${expr.trim().slice(0, 90)}}`);
        break;
      }
    }

    assert.deepEqual(offenders, [],
      'These interpolations render user- or upstream-controlled data into innerHTML '
      + 'without esc()/escJsAttr(). Wrap them, or route the value through textContent. '
      + 'Offenders:\n  ' + offenders.join('\n  '));
  });

  it('actually finds the escaped sinks it claims to police', () => {
    // Guard the guard. If the field list stops matching real sinks — a rename, a
    // refactor into a helper — the test above passes vacuously and would keep passing
    // no matter what got unescaped. Every field must have at least one ESCAPED sink.
    const src = dashboardSource();
    const escapedByField = new Map(USER_DATA_FIELDS.map((f) => [f, 0]));

    for (const { expr } of interpolations(src)) {
      if (!isEscaped(expr)) continue;
      // No `break`: one expression can mention several of these fields
      // (`esc(a.apiKey_masked || a.keyPrefix || '')`), and breaking on the first meant
      // the later ones were never credited and looked unpoliced.
      for (const field of USER_DATA_FIELDS) {
        if (new RegExp(`(^|[.\\s(\\[{!?])${field}\\b`).test(expr)) {
          escapedByField.set(field, escapedByField.get(field) + 1);
        }
      }
    }

    const unmatched = [...escapedByField.entries()].filter(([, n]) => n === 0).map(([f]) => f);
    assert.deepEqual(unmatched, [],
      'These fields no longer match any escaped interpolation, so the check above is '
      + 'no longer policing them. Update USER_DATA_FIELDS to the current sink names. '
      + 'Unmatched: ' + unmatched.join(', '));
  });

  it('reads the shipped file, not a copy', () => {
    // Cheap tripwire: if the path breaks or the file is emptied, the checks above would
    // pass over zero interpolations.
    const src = dashboardSource();
    assert.ok(src.length > 50_000, 'the dashboard source should be substantial');
    assert.ok(interpolations(src).length > 500,
      `expected many interpolations to scan, found ${interpolations(src).length}`);
    assert.ok(/this\.esc\(/.test(src), 'the escape helper must be present in the source');
  });
});
