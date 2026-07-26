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
  for (const route of ROUTES) {
    it(`${route} resolves the DEVIN_CONNECT code through connectErrorToHttp`, () => {
      // Reading err.type alone collapses CAPACITY (503, retryable) / RATE_LIMITED
      // (429) / MODEL_BLOCKED (402, terminal) into one flat error type, throwing
      // away a distinction the classifier already computed. responses.js did
      // exactly this until v3.8.0.
      assert.match(src[route], /import \{[^}]*connectErrorToHttp[^}]*\} from '\.\/chat\.js'/,
        `${route} must import the shared classifier`);
      assert.ok(src[route].includes('connectErrorToHttp('),
        `${route} imports the classifier but never calls it`);
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
