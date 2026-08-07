// Gemini declares Schema.type as an UPPERCASE enum; everything downstream compares
// the lowercase JSON-Schema spelling.
//
// WHY THIS FILE EXISTS. Nothing in the repo normalized it (`grep -c toLowerCase
// src/handlers/gemini.js` returned 0 on a7326da), so a spec-conforming Gemini client's
// tool schema was opaque to every consumer that inspects `type`. Measured on that
// commit, one narrative and two equivalent schemas:
//
//   tool from Gemini  {type:'OBJECT', properties:{command:{type:'STRING'}}}
//     -> extractIntentFromNarrative produced NOTHING
//   same tool lowercase
//     -> {"command":"ls -la"}
//
// The consumer is intent-extractor's indexTools, which gates on
// `params?.type === 'object'`; with 'OBJECT' it resolves no primary parameter, so NLU
// recovery is silently unavailable for Gemini callers — the models that need it most
// (GLM/Kimi narrate instead of emitting, and the recovery is ON by default for them).
//
// Note the original bug report described a wrongly-NAMED argument (`{"input":...}`)
// rather than an absent one. That symptom changed when layer 1 began dropping
// unresolvable slots instead of inventing `_value`. Same root cause; the failure just
// got quieter, which is why it is worth a guard rather than a one-line patch.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { geminiToOpenAI } from '../src/handlers/gemini.js';
import { extractIntentFromNarrative } from '../src/handlers/intent-extractor.js';

const ASK = 'please list the files in the repo';
const NARRATIVE = 'Let me run shell_exec("ls -la") now.';

function geminiBody(parameters, key = 'parameters') {
  return {
    contents: [{ role: 'user', parts: [{ text: ASK }] }],
    tools: [{ functionDeclarations: [{ name: 'shell_exec', description: 'run a shell command', [key]: parameters }] }],
  };
}
const convert = (body) => geminiToOpenAI(body, 'gemini-3.0-pro').tools?.[0]?.function?.parameters;

describe('gemini schema type normalization', () => {
  it('rewrites the uppercase enum to the JSON-Schema spelling, nested', () => {
    const p = convert(geminiBody({
      type: 'OBJECT',
      properties: {
        command: { type: 'STRING' },
        opts: { type: 'OBJECT', properties: { retries: { type: 'INTEGER' }, tags: { type: 'ARRAY', items: { type: 'STRING' } } } },
      },
      required: ['command'],
    }));
    assert.equal(p.type, 'object');
    assert.equal(p.properties.command.type, 'string');
    assert.equal(p.properties.opts.type, 'object', 'nested objects too, not just the top level');
    assert.equal(p.properties.opts.properties.retries.type, 'integer');
    assert.equal(p.properties.opts.properties.tags.items.type, 'string', 'and through `items`');
  });

  it('the whole point: a Gemini-sourced tool now yields the SAME args as its lowercase twin', () => {
    // This is the assertion that would have caught the defect. The two schemas are
    // semantically identical, so any difference in the extracted arguments is the
    // vocabulary mismatch and nothing else.
    const upper = extractIntentFromNarrative(NARRATIVE, geminiToOpenAI(geminiBody({
      type: 'OBJECT', properties: { command: { type: 'STRING' } }, required: ['command'],
    }), 'gemini-3.0-pro').tools, { lastUserText: ASK });
    const lower = extractIntentFromNarrative(NARRATIVE, [{
      type: 'function',
      function: {
        name: 'shell_exec', description: 'run a shell command',
        parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      },
    }], { lastUserText: ASK });

    assert.equal(upper.length, 1, 'a Gemini-sourced tool must be usable by the recovery path at all');
    assert.equal(lower.length, 1, 'precondition: the lowercase twin resolves');
    assert.deepEqual(JSON.parse(upper[0].argumentsJson), { command: 'ls -la' });
    assert.deepEqual(JSON.parse(upper[0].argumentsJson), JSON.parse(lower[0].argumentsJson),
      'the two spellings must be indistinguishable downstream');
  });

  it('leaves an unrecognized type alone rather than inventing one', () => {
    // TYPE_UNSPECIFIED is real Gemini vocabulary with no JSON-Schema equivalent.
    // Mapping it to something would be a guess; a consumer ignoring it is correct.
    const p = convert(geminiBody({ type: 'TYPE_UNSPECIFIED', properties: { x: { type: 'WEIRD' } } }));
    assert.equal(p.type, 'TYPE_UNSPECIFIED');
    assert.equal(p.properties.x.type, 'WEIRD');
  });

  it('handles the union form', () => {
    const p = convert(geminiBody({ type: 'OBJECT', properties: { x: { type: ['STRING', 'NULL'] } } }));
    assert.deepEqual(p.properties.x.type, ['string', 'null']);
  });

  it('NEGATIVE CONTROL: an already-lowercase schema is unchanged', () => {
    // parametersJsonSchema is JSON-Schema by definition, so running the normalizer
    // over it must be a no-op — otherwise this fix would be corrupting the shape it
    // was supposed to leave alone.
    const original = { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] };
    assert.deepEqual(convert(geminiBody(structuredClone(original), 'parametersJsonSchema')), original);
  });

  it('NEGATIVE CONTROL: a `type` that is not a schema type is untouched', () => {
    // `type` also names non-schema things. Here it is a property NAME whose value
    // happens to be a string — rewriting it would corrupt the caller's schema.
    const p = convert(geminiBody({
      type: 'OBJECT',
      properties: { type: { type: 'STRING', description: 'the record type, e.g. STRING or OBJECT' } },
    }));
    assert.equal(p.type, 'object');
    assert.equal(p.properties.type.type, 'string', 'the inner declaration is a real schema type');
    assert.match(p.properties.type.description, /STRING or OBJECT/,
      'prose mentioning the enum names must not be rewritten');
  });
});
