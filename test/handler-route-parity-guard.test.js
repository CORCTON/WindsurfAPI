// Structural guard: the four protocol routes must stay aligned.
//
// /v1/messages, /v1/responses and /v1beta (gemini) all delegate to
// handleChatCompletions but each owns a translation layer. So a change made at the
// chat layer has to be mirrored on every route — and twice now it was not:
//
//   #188  fixed sticky binding for the Cascade streaming path only; the
//         DEVIN_CONNECT path stayed a permanent no-op until #230.
//   O1    made the trailing usage-only frame opt-in via
//         stream_options.include_usage, updating messages + responses but not
//         gemini — so every Gemini streaming response shipped with no usage at all
//         (fixed in v3.8.0).
//
// A source-level guard is the right tool here: the drift is "one route forgot to
// do what the others do", which no per-route behavioural test would catch (each
// route's own tests kept passing).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROUTES = ['messages', 'responses', 'gemini'];
const src = Object.fromEntries(
  ROUTES.map(r => [r, readFileSync(new URL(`../src/handlers/${r}.js`, import.meta.url), 'utf8')]),
);

describe('route parity — streaming usage frame opt-in', () => {
  for (const route of ROUTES) {
    // The streaming delegation is a single line in all three routes:
    //   { ...body, stream: true, __route: '<r>', stream_options: {...} }
    const delegationLine = () => {
      const line = src[route].split('\n').find(l => /stream:\s*true,\s*__route:/.test(l));
      assert.ok(line, `${route}: could not find the streaming delegation line`);
      return line;
    };

    it(`${route} asks the chat layer for the usage frame`, () => {
      // Every route's translator consumes chunk.usage to build its own terminal
      // usage block, so all three must opt in regardless of what the downstream
      // client asked for.
      assert.match(delegationLine(), /include_usage:\s*true/,
        `${route} does not thread stream_options.include_usage — its terminal usage `
        + 'block will be empty (this is exactly how gemini lost usage entirely).');
    });

    it(`${route} merges rather than clobbers a caller-supplied stream_options`, () => {
      assert.match(delegationLine(), /\.\.\.\(\w+\.stream_options \|\| \{\}\)/,
        `${route} must spread the caller's stream_options before overriding include_usage`);
    });
  }
});

describe('route parity — mid-stream error classification', () => {
  // Strip comments first: a check for "does this file consume the classifier's
  // result" must not be satisfied by prose mentioning it (this file's sibling
  // guards were found accepting exactly that).
  const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  for (const route of ROUTES) {
    it(`${route} resolves the DEVIN_CONNECT code through connectErrorToHttp`, () => {
      // Reading err.type alone collapses CAPACITY (503, retryable) / RATE_LIMITED
      // (429) / MODEL_BLOCKED (402, terminal) into one flat error type, throwing
      // away a distinction the classifier already computed. responses.js did
      // exactly this until v3.8.0.
      assert.match(src[route], /import \{[^}]*connectErrorToHttp[^}]*\} from '\.\/chat\.js'/,
        `${route} must import the shared classifier`);

      // `includes('connectErrorToHttp(')` is NOT enough: a call whose RESULT is
      // discarded satisfies it while the defect is fully restored. Measured — the
      // pre-v3.8.0 flat-err.type defect plus one dead reference
      // (`const _unused = (c) => connectErrorToHttp(c);`) left this suite at 10/10.
      //
      // Checking "is the result assigned" is not enough either, because that dead
      // reference IS an assignment. So follow the value one step further: the name
      // it is bound to must be READ somewhere after the binding. A lambda nobody
      // invokes, or a variable nobody reads, fails that.
      const body = stripComments(src[route]);
      const calls = [...body.matchAll(/connectErrorToHttp\s*\(/g)];
      assert.ok(calls.length > 0, `${route} imports the classifier but never calls it`);

      // For each call, walk back to the enclosing statement and pull the names it
      // binds (plain or destructured).
      const boundNames = new Set();
      for (const m of calls) {
        // Walk back to the enclosing STATEMENT, not just the current line: the
        // real call sites are multi-line ternaries whose `const x =` sits a line
        // above the call, so a line-scoped look-back finds no binding and would
        // fail on correct source.
        const stmtStart = Math.max(
          body.lastIndexOf(';', m.index),
          body.lastIndexOf('{', m.index),
          body.lastIndexOf('}', m.index),
        );
        const stmt = body.slice(stmtStart + 1, m.index);
        const destructured = stmt.match(/(?:const|let|var)\s*\{([^}]*)\}\s*=/);
        if (destructured) {
          for (const part of destructured[1].split(',')) {
            const name = part.split(':').pop().trim();
            if (/^[\w$]+$/.test(name)) boundNames.add(name);
          }
          continue;
        }
        const plain = stmt.match(/(?:const|let|var)\s+([\w$]+)\s*=/);
        if (plain) boundNames.add(plain[1]);
      }

      // A name that is only defined and never read is a dead binding.
      const read = [...boundNames].filter((name) => {
        const uses = body.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || [];
        return uses.length > 1;
      });

      assert.ok(
        read.length > 0,
        `${route} calls connectErrorToHttp but nothing reads the result `
        + `(bound: ${[...boundNames].join(', ') || 'nothing'}). A discarded call keeps the string `
        + 'present — and the pre-v3.8.0 defect (reading a flat err.type) intact.',
      );
    });
  }
});

describe('route parity — every delegating route is covered by this guard', () => {
  it('no new handler streams through handleChatCompletions without being listed here', () => {
    // If someone adds a fourth protocol front, it must be added to ROUTES above —
    // otherwise it silently escapes every parity check in this file (which is how
    // gemini slipped past the O1 usage-frame change).
    const delegating = readdirSync(new URL('../src/handlers', import.meta.url))
      .filter(f => f.endsWith('.js') && f !== 'chat.js')
      .filter(f => /stream:\s*true,\s*__route:/.test(
        readFileSync(new URL(`../src/handlers/${f}`, import.meta.url), 'utf8'),
      ))
      .map(f => f.replace(/\.js$/, ''))
      .sort();

    assert.deepEqual(delegating, [...ROUTES].sort(),
      'a handler streams through handleChatCompletions but is not in this guard\'s '
      + 'ROUTES list — add it so the usage-frame and error-classification checks apply');
  });
});
