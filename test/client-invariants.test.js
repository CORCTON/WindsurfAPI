// Invariant pin for src/client.js — the boundaries a silent regression would hide.
//
// WHY THIS FILE IS ONE PLACE
//
// src/client.js is ~73 KB of transport behaviour whose assertions live scattered across
// client-content, client-panel-retry, stream-stall, stream-error,
// report-error-transient-guard, v2069/v2070/v2074/v2079-issue-fixes and
// workspace-stub-108 — eight partial files for one module, which is why it carried no
// mutation spec at all. test/mutations/client-invariants.json pins the invariants below
// through THIS file only, so a mutation verdict never depends on cross-file aggregation.
//
// WHY THESE ASSERTIONS
//
//   - WebFetch auto-approve. This decides whether a model-initiated web fetch executes
//     with no prompt in front of the user. Two independent ways to get it wrong: the
//     feature turning itself on without the enable flag, and the declared request origin
//     not binding the URL that is actually allowed through.
//   - Binary / image placeholders. Cascade has no image channel in the text history it
//     replays, so a block that falls through to JSON.stringify ships the caller's base64
//     body into the prompt.
//   - contentToString object fallback. Returning '' instead of the serialized block does
//     not throw: it deletes a whole turn from the prompt and the model answers a
//     different conversation.
//   - CASCADE_COMPACT_CLAUDE_SYSTEM=0. The documented escape hatch; if it stops working
//     the operator has no way back to "send the system prompt as written".
//   - isCascadeTransportError. Feeds isUpstreamTransientError and the warmup recovery
//     path: a false negative turns a recoverable HTTP/2 cancel into a failed request,
//     and a lost "panel state" token leaves the LS session poisoned.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCascadeTransportError,
  isReadUrlAutoApproveAllowed,
  compactSystemPromptForCascade,
  contentToString,
} from '../src/client.js';

const ENV_AUTO_APPROVE = 'WINDSURFAPI_NATIVE_TOOL_BRIDGE_WEBFETCH_AUTO_APPROVE';
const ENV_AUTO_APPROVE_ORIGINS = 'WINDSURFAPI_NATIVE_TOOL_BRIDGE_WEBFETCH_AUTO_APPROVE_ORIGINS';

/** Set env vars for one call, then restore exactly (including "was unset"). */
function withEnv(vars, fn) {
  const saved = new Map();
  for (const [name, value] of Object.entries(vars)) {
    saved.set(name, Object.prototype.hasOwnProperty.call(process.env, name)
      ? process.env[name]
      : undefined);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe('WebFetch auto-approve is opt-in and origin-bound', () => {
  it('stays OFF when the enable flag is unset even though origins are configured', () => {
    withEnv({ [ENV_AUTO_APPROVE]: undefined, [ENV_AUTO_APPROVE_ORIGINS]: 'https://example.com' }, () => {
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/a', ''), false);
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/a', 'https://example.com'), false);
    });
  });

  it('stays OFF for a value that is not exactly "1"', () => {
    withEnv({ [ENV_AUTO_APPROVE]: 'true', [ENV_AUTO_APPROVE_ORIGINS]: 'https://example.com' }, () => {
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/a', ''), false);
    });
  });

  it('refuses when the origin the request declares is not the URL origin', () => {
    withEnv({ [ENV_AUTO_APPROVE]: '1', [ENV_AUTO_APPROVE_ORIGINS]: 'https://example.com' }, () => {
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/a', 'https://evil.example'), false);
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/a', 'https://example.com'), true);
    });
  });

  it('treats a bare-origin allowlist entry as the whole origin, not one exact URL', () => {
    withEnv({ [ENV_AUTO_APPROVE]: '1', [ENV_AUTO_APPROVE_ORIGINS]: 'https://example.com' }, () => {
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/deep/path?q=1', ''), true);
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/#frag', ''), true);
    });
  });

  it('does not extend a path-scoped allowlist entry to its children', () => {
    withEnv({ [ENV_AUTO_APPROVE]: '1', [ENV_AUTO_APPROVE_ORIGINS]: 'https://docs.example.com/path' }, () => {
      assert.equal(isReadUrlAutoApproveAllowed('https://docs.example.com/path', ''), true);
      assert.equal(isReadUrlAutoApproveAllowed('https://docs.example.com/path/child', ''), false);
      assert.equal(isReadUrlAutoApproveAllowed('https://docs.example.com/other', ''), false);
    });
  });

  it('requires an allowlist entry and a canonical http(s) URL', () => {
    withEnv({ [ENV_AUTO_APPROVE]: '1', [ENV_AUTO_APPROVE_ORIGINS]: '' }, () => {
      assert.equal(isReadUrlAutoApproveAllowed('https://example.com/a', ''), false);
    });
    withEnv({ [ENV_AUTO_APPROVE]: '1', [ENV_AUTO_APPROVE_ORIGINS]: 'https://example.com' }, () => {
      assert.equal(isReadUrlAutoApproveAllowed('ftp://example.com/a', ''), false);
      assert.equal(isReadUrlAutoApproveAllowed('https://user:pw@example.com/a', ''), false);
      assert.equal(isReadUrlAutoApproveAllowed('', ''), false);
    });
  });
});

describe('Cascade text history cannot carry binary or image bodies', () => {
  it('replaces an unknown block whose data field is a long base64 body', () => {
    const base64 = 'A'.repeat(200);
    assert.equal(
      contentToString([{ type: 'audio', data: base64 }]),
      '[Binary content omitted from text history]',
    );
  });

  it('replaces an image block that carries no image type field', () => {
    assert.equal(
      contentToString([{ media_type: 'image/png', data: 'AAAA' }]),
      '[Image omitted from text history]',
    );
    assert.equal(
      contentToString([{ source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }]),
      '[Image omitted from text history]',
    );
  });

  it('keeps plain text blocks, images and unknown blocks distinct', () => {
    const out = contentToString([
      { type: 'text', text: 'alpha' },
      { type: 'image', image_url: 'https://example.com/x.png' },
      { type: 'tool_result', content: 'beta' },
    ]);
    assert.ok(out.startsWith('alpha'));
    assert.ok(out.includes('[Image omitted from text history]'));
    assert.ok(out.includes('"tool_result"'));
  });

  it('serializes a non-string, non-array content instead of dropping the turn', () => {
    assert.equal(contentToString({ type: 'text', text: 'hello' }), '{"type":"text","text":"hello"}');
    assert.equal(contentToString(7), '7');
    assert.equal(contentToString(null), '');
    assert.equal(contentToString(undefined), '');
    assert.equal(contentToString('plain'), 'plain');
  });
});

describe('Claude Code system-prompt compaction keeps its escape hatch', () => {
  const CC_PROMPT = [
    "You are Claude Code, Anthropic's official CLI for Claude.",
    'Tool protocol details: content_block tool_use tool_result '.repeat(120),
    'Working directory: /srv/distinctive-project',
    'Platform: linux',
  ].join('\n');

  it('compacts a long Claude Code prompt while keeping the environment facts', () => {
    withEnv({ CASCADE_COMPACT_CLAUDE_SYSTEM: undefined }, () => {
      const out = compactSystemPromptForCascade(CC_PROMPT);
      assert.ok(out.length < 2000, `expected a compact prompt, got ${out.length} chars`);
      assert.ok(out.includes('Working directory: /srv/distinctive-project'));
    });
  });

  it('returns the caller prompt nearly verbatim when the switch is "0"', () => {
    withEnv({ CASCADE_COMPACT_CLAUDE_SYSTEM: '0' }, () => {
      const out = compactSystemPromptForCascade(CC_PROMPT);
      assert.ok(
        out.length > CC_PROMPT.length * 0.9,
        `expected the un-compacted prompt (${CC_PROMPT.length} chars), got ${out.length}`,
      );
      assert.ok(out.includes('Tool protocol details'));
      assert.ok(out.includes('Working directory: /srv/distinctive-project'));
    });
  });
});

describe('Cascade transport classification covers the recovery tokens', () => {
  it('classifies HTTP/2 cancellation, session loss and panel-state loss as transport', () => {
    assert.equal(isCascadeTransportError(new Error('panel state not found for session abc')), true);
    assert.equal(isCascadeTransportError(new Error('Http2Session closed with error')), true);
    assert.equal(isCascadeTransportError(new Error('The pending stream has been canceled')), true);
    assert.equal(
      isCascadeTransportError(Object.assign(new Error('unauthenticated'), { code: 'ERR_HTTP2_STREAM_ERROR' })),
      true,
    );
  });

  it('does not classify a model-level refusal as transport', () => {
    assert.equal(isCascadeTransportError(new Error('permission_denied: model unavailable')), false);
    assert.equal(isCascadeTransportError(new Error('untrusted workspace')), false);
  });
});
