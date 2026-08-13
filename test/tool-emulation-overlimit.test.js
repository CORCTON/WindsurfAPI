import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ToolCallStreamParser, TOOL_OVER_LIMIT_PLACEHOLDER } from '../src/handlers/tool-emulation.js';

// ---------------------------------------------------------------------------
// Over-limit tool_call bodies must be replaced with a placeholder instead of
// being flushed into the text stream. Raw flush pollutes the conversation
// with an unparsed blob (the client sees garbage prose instead of a tool
// call) — and for <tool_call> XML it also risks the wrapper being re-parsed
// as a real call on the next round.
// ---------------------------------------------------------------------------

const P = TOOL_OVER_LIMIT_PLACEHOLDER;

describe('over-limit tool_call bodies → placeholder, never raw text', () => {
  it('XML <tool_call> body over 65KB → placeholder, not the blob', () => {
    const parser = new ToolCallStreamParser({ dialect: 'glm47' });
    parser.feed('<tool_call>{"name":"X","arguments":{"data":"');
    let text = '';
    for (let i = 0; i < 40; i++) {
      const r = parser.feed('Z'.repeat(2000));
      if (r.text) text += r.text;
    }
    assert.ok(parser.buffer.length <= 65_536, 'buffer must stay bounded');
    assert.ok(text.includes(P), 'placeholder must appear');
    assert.ok(!text.includes('Z'.repeat(60000)), 'the blob itself must not leak as text');
  });

  it('XML <tool_call> body over 65KB with a close tag after → placeholder, call dropped', () => {
    const parser = new ToolCallStreamParser({ dialect: 'glm47' });
    parser.feed('<tool_call>{"name":"X"');
    let text = '';
    let calls = 0;
    // Force the ceiling first, then a proper close arrives — the oversized
    // call must stay dropped (no half-parsed tool call).
    for (let i = 0; i < 35; i++) { const r = parser.feed('W'.repeat(2000)); text += r.text || ''; }
    const r2 = parser.feed('}</tool_call>');
    text += r2.text || '';
    calls += (r2.toolCalls || []).length;
    assert.ok(text.includes(P), 'placeholder must appear');
    assert.equal(calls, 0, 'oversized call must not be emitted as a tool call');
    assert.ok(parser.buffer.length <= 65_536, 'buffer must stay bounded');
  });

  it('gpt_native bare-JSON sentinel over 65KB → placeholder (no raw dump)', () => {
    const parser = new ToolCallStreamParser({ dialect: 'gpt_native' });
    parser.feed('{"function_call"');
    let text = '';
    for (let i = 0; i < 40; i++) {
      const r = parser.feed('Y'.repeat(2000));
      if (r.text) text += r.text;
    }
    assert.ok(text.includes(P), 'placeholder must appear');
    assert.ok(!text.includes('Y'.repeat(60000)), 'the blob itself must not leak');
  });

  it('after XML oversize drop, the trailing close tag does NOT leak as text', () => {
    const parser = new ToolCallStreamParser({ dialect: 'glm47' });
    parser.feed('<tool_call>{"name":"X"');
    let text = '';
    for (let i = 0; i < 35; i++) { const r = parser.feed('W'.repeat(2000)); text += r.text || ''; }
    const r2 = parser.feed('}</tool_call>');
    text += r2.text || '';
    assert.ok(text.includes(P), 'placeholder appears');
    assert.ok(!text.includes('</tool_call>'), 'close tag must NOT leak as text');
    assert.ok(!text.includes('"}"'), 'close braces must NOT leak as text');
  });

  it('after gpt_native oversize drop, closing braces do NOT leak as text', () => {
    const parser = new ToolCallStreamParser({ dialect: 'gpt_native' });
    parser.feed('{"function_call":{"name":"X"');
    let text = '';
    for (let i = 0; i < 35; i++) { const r = parser.feed('V'.repeat(2000)); text += r.text || ''; }
    const r2 = parser.feed('"}}');
    text += r2.text || '';
    assert.ok(text.includes(P), 'placeholder appears');
    assert.ok(!text.includes('"}}'), 'closing braces must NOT leak');
  });

  it('B1: after XML oversize reset, subsequent model text flows normally (no zombie inToolCall)', () => {
    const parser = new ToolCallStreamParser({ dialect: 'openai_json_xml' });
    parser.feed('<tool_call>{"name":"X"');
    for (let i = 0; i < 35; i++) parser.feed('W'.repeat(2000));
    // close arrives → oversize resets
    const r1 = parser.feed('}</tool_call>');
    assert.equal(r1.text || '', '', 'close must be swallowed');
    // normal prose after close must flow
    const r2 = parser.feed('hello after the call');
    assert.equal(r2.text, 'hello after the call', 'post-reset text must not be swallowed');
    const f = parser.flush();
    assert.ok(!(f.text || '').includes('<tool_call>'), 'flush must not leak unclosed prefix');
    assert.ok(!(f.text || '').includes('W'.repeat(100)), 'flush must not leak the oversize blob');
  });

  it('B2: gpt_native oversize terminates on a lone closing brace (no infinite swallow)', () => {
    const parser = new ToolCallStreamParser({ dialect: 'gpt_native' });
    parser.feed('{"function_call":{"name":"X"');
    for (let i = 0; i < 35; i++) parser.feed('V'.repeat(2000));
    const r = parser.feed('"}}');   // unbalanced close — must terminate the drop state
    assert.equal(parser._oversizeDropped, false, 'drop state must reset');
    assert.ok(!(r.text || '').includes('"}}'), 'closing braces must not leak');
    // post-reset prose flows
    const r2 = parser.feed('ok now');
    assert.equal(r2.text, 'ok now');
  });

  it('B3: oversize swallow caps its buffer (no unbounded growth)', () => {
    const parser = new ToolCallStreamParser({ dialect: 'glm47' });
    parser.feed('<tool_call>{"name":"X"');
    for (let i = 0; i < 35; i++) parser.feed('W'.repeat(2000));
    assert.equal(parser._oversizeDropped, true);
    // 1MB of prose without close — buffer must stay bounded
    for (let i = 0; i < 500; i++) parser.feed('P'.repeat(2000));
    assert.ok(parser.buffer.length <= 65_536 * 2 + 4096, `drop-state buffer bounded, got ${parser.buffer.length}`);
  });

  it('M1: {"name" sentinel oversize → placeholder + no trailing brace leak', () => {
    const parser = new ToolCallStreamParser({ dialect: 'gpt_native' });
    parser.feed('{"name":"X","arguments":{"data":"');
    let text = '';
    for (let i = 0; i < 35; i++) { const r = parser.feed('Q'.repeat(2000)); text += r.text || ''; }
    const r = parser.feed('"}}');
    text += r.text || '';
    assert.ok(text.includes(P), 'placeholder appears');
    assert.ok(!text.includes('"}}'), 'trailing braces must not leak');
  });

  it('a small complete <tool_call> still parses normally (no false positive)', () => {
    const parser = new ToolCallStreamParser({ dialect: 'glm47' });
    parser.feed('<tool_call>{"name":"Bash","arguments":{"command":"ls"}}</tool_call>');
    const f = parser.flush();
    assert.equal((f.toolCalls || []).length, 1, 'small call parses');
    assert.ok(!(f.text || '').includes(P), 'no placeholder for healthy calls');
  });
});
