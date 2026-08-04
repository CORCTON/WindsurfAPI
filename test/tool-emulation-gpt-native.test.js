// v2.0.62 (#115) — gpt_native dialect for GPT family models on the
// /v1/responses (Codex CLI) route. Verifies dialect dispatch, the
// strong anti-refusal preamble, history serializer, and round-trip
// parsing of bare-JSON function_call output through the stream parser.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickToolDialect,
  buildToolPreambleForProto,
  ToolCallStreamParser,
  parseToolCallsFromText,
  normalizeMessagesForCascade,
} from '../src/handlers/tool-emulation.js';

describe('pickToolDialect — gpt_native gating (v2.0.62 #115)', () => {
  it('GPT family + responses route → gpt_native', () => {
    assert.equal(pickToolDialect('gpt-5.5-medium', 'openai', 'responses'), 'gpt_native');
    assert.equal(pickToolDialect('gpt-4.1-mini', 'openai', 'responses'), 'gpt_native');
    assert.equal(pickToolDialect('o3-mini', 'openai', 'responses'), 'gpt_native');
    assert.equal(pickToolDialect('o4-preview', 'openai', 'responses'), 'gpt_native');
  });

  it('GPT family + chat route → openai_json_xml (default, no surprise)', () => {
    assert.equal(pickToolDialect('gpt-5.5-medium', 'openai', 'chat'), 'openai_json_xml');
    assert.equal(pickToolDialect('gpt-4o-mini', 'openai', null), 'openai_json_xml');
    assert.equal(pickToolDialect('gpt-5.5-medium', 'openai'), 'openai_json_xml');
  });

  it('non-GPT models on responses route → openai_json_xml (gpt_native is GPT-only)', () => {
    assert.equal(pickToolDialect('claude-sonnet-4.6', 'anthropic', 'responses'), 'openai_json_xml');
    assert.equal(pickToolDialect('gemini-3.0-flash', 'google', 'responses'), 'openai_json_xml');
  });

  it('GLM and Kimi precedence beats GPT detection', () => {
    assert.equal(pickToolDialect('glm-5.1', 'zhipu', 'responses'), 'glm47');
    assert.equal(pickToolDialect('kimi-k2', 'moonshot', 'responses'), 'kimi_k2');
  });

  // GLM-5.2 arrives under both spellings — resolveConnectSelector maps `glm-5.2` and
  // `glm-5-2` to the same upstream selector, so a client may legitimately send either, and
  // clients do (#236 came in reporting `glm-5-2-none`). Every spelling must land on
  // gpt_native, because the v2.0.72 probe found this model IGNORES the glm47 XML markup:
  // the wrong dialect means plain-text answers with no tool call emitted, and a client that
  // waits forever for one.
  //
  // Bare `glm-5-2` was the one form that got it wrong — not equal to `glm-5.2`, and with no
  // trailing dash neither prefix test fired, so it fell through to glm47. Every other
  // spelling already worked, which is exactly what kept it hidden.
  it('every GLM-5.2 spelling gets gpt_native, dotted or dashed, bare or suffixed', () => {
    for (const key of [
      'glm-5.2', 'glm-5-2',
      'glm-5.2-none', 'glm-5-2-none',
      'glm-5.2-high', 'glm-5-2-high',
      'GLM-5-2', 'GLM-5.2-NONE',
    ]) {
      assert.equal(pickToolDialect(key, 'zhipu'), 'gpt_native',
        `${key} must use gpt_native — glm47 markup is ignored by this model, so the wrong `
        + 'dialect emits no tool call and stalls the client');
    }
  });

  it('and the fix does not drag other GLM models onto gpt_native', () => {
    // The dot-collapse must not widen the match. glm-4.7 and glm-5 are different models and
    // the glm47 dialect is correct for them; a `startsWith('glm-5')` style fix would have
    // swallowed glm-5 and glm-5.1 too.
    for (const key of ['glm-4.7', 'glm-4-7', 'glm-5', 'glm-5.1', 'glm-5-1']) {
      assert.equal(pickToolDialect(key, 'zhipu'), 'glm47', `${key} must stay on glm47`);
    }
  });

  it('WINDSURFAPI_FORCE_GPT_NATIVE_DIALECT=1 forces gpt_native on chat route too', () => {
    const orig = process.env.WINDSURFAPI_FORCE_GPT_NATIVE_DIALECT;
    process.env.WINDSURFAPI_FORCE_GPT_NATIVE_DIALECT = '1';
    try {
      assert.equal(pickToolDialect('gpt-5.5-medium', 'openai', 'chat'), 'gpt_native');
    } finally {
      if (orig === undefined) delete process.env.WINDSURFAPI_FORCE_GPT_NATIVE_DIALECT;
      else process.env.WINDSURFAPI_FORCE_GPT_NATIVE_DIALECT = orig;
    }
  });
});

describe('gpt_native preamble — strong anti-refusal language', () => {
  const tools = [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
    },
  }];

  it('preamble includes function_call JSON shape, not <tool_call> XML', () => {
    const p = buildToolPreambleForProto(tools, 'auto', '', 'gpt-5.5-medium', 'openai', 'responses');
    assert.match(p, /function_call/, 'must mention function_call shape');
    assert.match(p, /"name"\s*:/, 'must show JSON shape');
    assert.match(p, /"arguments"\s*:/, 'must show arguments key');
    assert.doesNotMatch(p, /<tool_call>/, 'gpt_native must NOT use <tool_call> XML wrapper');
  });

  it('preamble has explicit anti-refusal phrasing', () => {
    const p = buildToolPreambleForProto(tools, 'auto', '', 'gpt-5.5-medium', 'openai', 'responses');
    assert.match(p, /forbidden|DO NOT|never refuse|are available|are real/i,
      'preamble must reject "I cannot read files / paste me the file" patterns');
  });

  it('preamble forbids markdown fence around the JSON', () => {
    const p = buildToolPreambleForProto(tools, 'auto', '', 'gpt-5.5-medium', 'openai', 'responses');
    assert.match(p, /NO\s+markdown|no\s+markdown|no\s+\`\`\`json|NO\s+\`\`\`/i);
  });

  it('non-responses route still gets openai_json_xml preamble (XML wrapper)', () => {
    const p = buildToolPreambleForProto(tools, 'auto', '', 'gpt-5.5-medium', 'openai', 'chat');
    assert.match(p, /<tool_call>/, 'chat route must keep XML wrapper for back-compat');
  });
});

describe('gpt_native history serializer', () => {
  it('emits {"function_call":{...}} for assistant tool_calls in history', () => {
    // normalizeMessagesForCascade reformats prior assistant tool_calls into
    // the dialect's expected on-wire form so the model sees its own past
    // calls in the same shape it's now asked to emit.
    const messages = [
      { role: 'user', content: 'weather please' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
        }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'sunny' },
    ];
    const out = normalizeMessagesForCascade(messages, [], {
      modelKey: 'gpt-5.5-medium',
      provider: 'openai',
      route: 'responses',
    });
    const assistantTurn = out.find(m => m.role === 'assistant' && typeof m.content === 'string');
    assert.ok(assistantTurn, 'assistant turn should be present after normalization');
    assert.match(assistantTurn.content, /"function_call"\s*:/);
    assert.match(assistantTurn.content, /"name"\s*:\s*"get_weather"/);
    assert.match(assistantTurn.content, /"city"\s*:\s*"Tokyo"/);
    assert.doesNotMatch(assistantTurn.content, /<tool_call>/, 'must NOT use XML wrapper for gpt_native');
  });
});

describe('gpt_native parser — stream + flush', () => {
  it('parseToolCallsFromText extracts {"function_call":{...}} bare-JSON output', () => {
    const text = 'I will check the weather.\n{"function_call":{"name":"get_weather","arguments":{"city":"Berlin"}}}';
    const r = parseToolCallsFromText(text, {
      modelKey: 'gpt-5.5-medium',
      provider: 'openai',
      route: 'responses',
    });
    assert.equal(r.toolCalls.length, 1, 'one tool call expected');
    assert.equal(r.toolCalls[0].name, 'get_weather');
    const args = JSON.parse(r.toolCalls[0].argumentsJson);
    assert.equal(args.city, 'Berlin');
  });

  it('parses bare {"name":...,"arguments":...} when GPT skips the function_call wrapper', () => {
    const text = '{"name":"Read","arguments":{"file_path":"/etc/hosts"}}';
    const r = parseToolCallsFromText(text, {
      modelKey: 'gpt-5.5-medium',
      provider: 'openai',
      route: 'responses',
    });
    assert.equal(r.toolCalls.length, 1);
    assert.equal(r.toolCalls[0].name, 'Read');
    assert.match(r.toolCalls[0].argumentsJson, /"file_path"\s*:\s*"\/etc\/hosts"/);
  });

  it('parses multiple function_call objects (parallel calls, one per line)', () => {
    const text = '{"function_call":{"name":"Read","arguments":{"file":"a.md"}}}\n'
               + '{"function_call":{"name":"Read","arguments":{"file":"b.md"}}}';
    const r = parseToolCallsFromText(text, {
      modelKey: 'gpt-5.5-medium',
      provider: 'openai',
      route: 'responses',
    });
    assert.equal(r.toolCalls.length, 2, 'two parallel calls');
    assert.equal(r.toolCalls[0].name, 'Read');
    assert.equal(r.toolCalls[1].name, 'Read');
  });

  it('plain prose without JSON falls through as text (non-tool turn)', () => {
    const text = 'Hello! How can I help you today?';
    const r = parseToolCallsFromText(text, {
      modelKey: 'gpt-5.5-medium',
      provider: 'openai',
      route: 'responses',
    });
    assert.equal(r.toolCalls.length, 0, 'no tool call');
    assert.match(r.text, /Hello!/);
  });

  it('stream parser holds back JSON sentinels until full object is closed', () => {
    const parser = new ToolCallStreamParser({
      modelKey: 'gpt-5.5-medium',
      provider: 'openai',
      route: 'responses',
    });
    // First chunk: just the start of the JSON object.
    const a = parser.feed('{"function_call":{"name":"Read",');
    assert.equal(a.toolCalls.length, 0, 'no call yet — JSON not closed');
    // Second chunk: rest of the JSON.
    const b = parser.feed('"arguments":{"file":"x.md"}}}');
    const c = parser.flush();
    const allCalls = [...a.toolCalls, ...b.toolCalls, ...c.toolCalls];
    assert.equal(allCalls.length, 1, 'one tool call after full object received');
    assert.equal(allCalls[0].name, 'Read');
  });
});
