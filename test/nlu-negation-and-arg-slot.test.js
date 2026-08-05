// NLU recovery: a disclaimed call is not intent, and a recovered call must name a
// parameter the tool actually declares.
//
// WHY THIS FILE EXISTS. Both layers of the defect were measured on master with
// tools=[shell_exec{command:string}] and an actionable user prompt:
//
//   'You should never write: shell_exec("rm -rf /important")'
//        -> [{name:'shell_exec', argumentsJson:'{"_value":"rm -rf /important"}', confidence:0.85}]
//   'Example of what NOT to do, never run this:\n```\nshell_exec("rm -rf /")\n```'
//        -> same shape
//   'Let me run shell_exec("ls -la") now.'                       <- GENUINE
//        -> same shape, same confidence
//
// Negation, a fenced counter-example and real intent were indistinguishable. That
// is worse than an ordinary false positive because handlers/chat.js does not
// re-prompt on recovery — it assigns `toolCalls = filtered` and clears the
// assistant text, so the fabricated call is what a client that EXECUTES tool calls
// receives, with the model's actual words ("never write this") erased.
//
// Second layer: the positional form emitted `{_value: ...}`. No tool declares
// `_value`, so a correct extraction still produced an unbindable argument.
//
// The assertions below are deliberately paired. Every suppression case has a
// matching case that MUST still extract, because over-suppression is the expensive
// direction here: this recovery is ON BY DEFAULT for GLM/Kimi (they narrate instead
// of emitting), so silently declining to recover turns a working agent loop into a
// stalled one. A test file that only proved "the bad input is now rejected" would
// pass just as well against a version that rejects everything.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractIntentFromNarrative,
  detectToolIntentInNarrative,
  maskNonActionableRegions,
} from '../src/handlers/intent-extractor.js';

const TOOLS = [{
  type: 'function',
  function: {
    name: 'shell_exec',
    description: 'run a shell command',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  },
}];

// detectToolIntentInNarrative and layer 3 both refuse to run unless the user's own
// prompt looks actionable, so every case supplies one — otherwise the assertions
// would pass for the wrong reason (the gate, not the fix).
const ASK = 'please list the files in the repo';
const extract = (text) => extractIntentFromNarrative(text, TOOLS, { lastUserText: ASK });
const detect = (text) => detectToolIntentInNarrative(text, TOOLS, { lastUserText: ASK });

describe('NLU recovery: disclaimed calls are not intent', () => {
  it('an English negation cue before the call suppresses it', () => {
    assert.deepEqual(extract('You should never write: shell_exec("rm -rf /important")'), []);
  });

  it('a Chinese negation cue suppresses it', () => {
    assert.deepEqual(extract('不要执行 shell_exec("rm -rf /")'), []);
  });

  it('a fenced block is not extracted even with NO negation cue', () => {
    // A fenced call is a quotation. Real emulated calls ride `<tool_call>` markup,
    // not prose fences, so there is nothing to lose by declining fences wholesale.
    assert.deepEqual(extract('Here is the shape:\n```\nshell_exec("rm -rf /")\n```'), []);
  });

  it('an unterminated fence (truncated stream) is still not extracted', () => {
    assert.deepEqual(extract('For example:\n```\nshell_exec("rm -rf /")'), []);
  });

  it('genuine intent still extracts — the control that gives the above meaning', () => {
    const r = extract('Let me run shell_exec("ls -la") now.');
    assert.equal(r.length, 1, 'a real call must survive the masking');
    assert.deepEqual(JSON.parse(r[0].argumentsJson), { command: 'ls -la' });
  });

  it('a negation in a LATER clause does not suppress an earlier real call', () => {
    // The cue is scoped to its own clause. A message that both acts and disclaims
    // ("I will run X. I will not delete anything.") is ordinary model prose, and an
    // anywhere-in-the-message rule would throw the real call away.
    const r = extract('Let me run shell_exec("ls -la"). I will not delete anything.');
    assert.equal(r.length, 1);
    assert.deepEqual(JSON.parse(r[0].argumentsJson), { command: 'ls -la' });
  });

  it('a negation in an EARLIER sentence does not reach a later real call', () => {
    // This is the shape that makes clause splitting load-bearing, and the one my
    // first version of this file missed: the cue comes FIRST and the genuine call
    // comes after it, in its own sentence. Without per-clause scoping the mask runs
    // from the cue to the end of the message and eats the real call — the
    // over-suppression failure mode. (Found by a mutation that widened the cue
    // scope and SURVIVED: the assertions below it only covered cue-after-call, so
    // nothing failed. The mutation was right that the guard had a hole.)
    const r = extract('Never use sudo here. Let me run shell_exec("ls -la") now.');
    assert.equal(r.length, 1, 'the call is in a later clause than the cue, so it stands');
    assert.deepEqual(JSON.parse(r[0].argumentsJson), { command: 'ls -la' });
  });

  it('a newline also ends a clause', () => {
    // Models emit bullet lists of "don't do this" followed by the real action on a
    // new line with no sentence terminator at all.
    const r = extract('- never delete files\nLet me run shell_exec("ls -la") now.');
    assert.equal(r.length, 1);
    assert.deepEqual(JSON.parse(r[0].argumentsJson), { command: 'ls -la' });
  });

  it('text BEFORE a negation cue in the same clause is still live', () => {
    // Only the span from the cue to the end of the clause is disclaimed.
    const r = extract('Run shell_exec("ls -la"), never with sudo.');
    assert.equal(r.length, 1, 'the call precedes the cue, so it stands');
    assert.deepEqual(JSON.parse(r[0].argumentsJson), { command: 'ls -la' });
  });

  it('the retry gate agrees with the extractor on all of the above', () => {
    // detectToolIntentInNarrative decides whether to spend an extra upstream call
    // asking the model to emit the tool properly. If it still saw intent in a
    // disclaimer, the retry loop would chase a call the model refused to make —
    // so both entry points must mask, not just the extractor.
    assert.equal(detect('You should never write: shell_exec("rm -rf /")'), null);
    assert.equal(detect('Here is the shape:\n```\nshell_exec("rm -rf /")\n```'), null);
    assert.equal(detect('Let me run shell_exec("ls -la") now.'), 'shell_exec');
  });
});

describe('NLU recovery: recovered args name a declared parameter', () => {
  it('the positional form binds to the tool\'s primary declared param', () => {
    const r = extract('Let me run shell_exec("ls -la") now.');
    const args = JSON.parse(r[0].argumentsJson);
    assert.ok('command' in args, `expected the declared param, got ${JSON.stringify(args)}`);
    assert.ok(!('_value' in args), '_value is not declared by any tool and must not be emitted');
  });

  it('an explicitly named param is preserved and still scores higher', () => {
    const r = extract('Let me run shell_exec(command="ls -la") now.');
    assert.deepEqual(JSON.parse(r[0].argumentsJson), { command: 'ls -la' });
    assert.equal(r[0].confidence, 0.95, 'an explicit name is stronger evidence than an inferred slot');
  });

  it('an inferred slot scores lower than an explicit one', () => {
    // Both produce the same argumentsJson, so without this the confidence split
    // could collapse unnoticed and a guess would rank equal to a stated name.
    const inferred = extract('Let me run shell_exec("ls -la") now.')[0];
    const explicit = extract('Let me run shell_exec(command="ls -la") now.')[0];
    assert.ok(inferred.confidence < explicit.confidence,
      `inferred ${inferred.confidence} must rank below explicit ${explicit.confidence}`);
  });

  it('a tool with no resolvable param is dropped, not given an invented name', () => {
    // Dropping falls through to retry-with-correction, which asks the model to emit
    // the call properly. An invented argument name does not — it reaches the client
    // looking valid and fails at bind time.
    const noParams = [{
      type: 'function',
      function: { name: 'ping_it', description: 'ping', parameters: { type: 'object', properties: {} } },
    }];
    const r = extractIntentFromNarrative('Let me run ping_it("now") please.', noParams, { lastUserText: ASK });
    assert.deepEqual(r, [], 'no declarable slot -> no extraction');
  });
});

describe('maskNonActionableRegions preserves offsets', () => {
  it('masking replaces regions with spaces rather than deleting them', () => {
    // Every layer runs its own regex over the masked text. If masking changed the
    // length, layer 2 and 3 offsets would shift relative to each other and the
    // suppression would land on the wrong span.
    const text = 'ok\n```\nshell_exec("x")\n```\ntail';
    const masked = maskNonActionableRegions(text);
    assert.equal(masked.length, text.length, 'length must be preserved');
    assert.ok(!masked.includes('shell_exec'), 'the fenced name is gone');
    assert.ok(masked.startsWith('ok'), 'text before the fence is untouched');
    assert.ok(masked.endsWith('tail'), 'text after the fence is untouched');
  });

  it('a message with nothing to mask comes back byte-identical', () => {
    const clean = 'Let me run shell_exec("ls -la") now.';
    assert.equal(maskNonActionableRegions(clean), clean);
  });
});
