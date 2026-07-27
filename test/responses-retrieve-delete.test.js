// GET / DELETE /v1/responses/{id}.
//
// Handoff item 7: the store already had deleteResponse and the full conversation,
// but neither endpoint was wired, so a client holding a response id could chain from
// it and never read or drop it. Both are scoped exactly like the chaining lookup —
// an id is readable only by the callerKey that minted it, and an untrustworthy
// `:client:<ip+ua>` identity cannot read anything, because behind a reverse proxy
// every end user collapses onto the same fingerprint (SEC-W2).

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetResponse, handleDeleteResponse } from '../src/handlers/responses.js';
import * as store from '../src/response-store.js';

const CALLER = 'api:retrievekey0000000000000000000:user:alice';
const OTHER = 'api:retrievekey0000000000000000000:user:bob';

const CONVERSATION = [
  { role: 'user', content: 'what is 2+2' },
  { role: 'assistant', content: 'It is 4.' },
];

beforeEach(() => store.resetResponseStore());

describe('GET /v1/responses/{id}', () => {
  it('returns the stored conversation as a Responses object', () => {
    store.putResponse('resp_abc', CONVERSATION, CALLER, { model: 'claude-sonnet-4.6' });
    const r = handleGetResponse('resp_abc', { context: { callerKey: CALLER } });
    assert.equal(r.status, 200);
    assert.equal(r.body.object, 'response');
    assert.equal(r.body.id, 'resp_abc');
    assert.equal(r.body.status, 'completed');
    assert.equal(r.body.model, 'claude-sonnet-4.6');
    assert.equal(r.body.output_text, 'It is 4.');
    assert.equal(r.body.output[0].type, 'message');
    assert.equal(r.body.output[0].content[0].text, 'It is 4.');
  });

  it('reports the response creation time, not the read time', () => {
    // The store holds createdAt; reporting Date.now() here would make every
    // retrieval look like a brand-new response.
    store.putResponse('resp_time', CONVERSATION, CALLER);
    const r = handleGetResponse('resp_time', { context: { callerKey: CALLER } });
    const now = Math.floor(Date.now() / 1000);
    assert.ok(Math.abs(r.body.created_at - now) <= 5, 'created_at must be a real timestamp');
  });

  it('surfaces stored tool calls as function_call items', () => {
    store.putResponse('resp_tc', [
      { role: 'user', content: 'read a file' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'Read', arguments: '{"p":"a.txt"}' } }],
      },
    ], CALLER);
    const r = handleGetResponse('resp_tc', { context: { callerKey: CALLER } });
    const call = r.body.output.find(i => i.type === 'function_call');
    assert.ok(call, 'the tool call must round-trip');
    assert.equal(call.name, 'Read');
    assert.equal(call.arguments, '{"p":"a.txt"}');
  });

  it('404s an unknown id', () => {
    const r = handleGetResponse('resp_nope', { context: { callerKey: CALLER } });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'response_not_found');
  });

  it('404s another caller\'s id — never reveals that it exists', () => {
    store.putResponse('resp_alice', CONVERSATION, CALLER);
    const r = handleGetResponse('resp_alice', { context: { callerKey: OTHER } });
    assert.equal(r.status, 404, 'a foreign id must be indistinguishable from a missing one');
    assert.ok(!JSON.stringify(r.body).includes('It is 4'), 'and must not leak any content');
  });

  it('404s for an untrustworthy :client: identity even when the id exists', () => {
    // Behind a reverse proxy two different end users derive a byte-identical
    // `:client:<ip+ua>` callerKey, so honouring it here would hand user B user A's
    // conversation. Default multi-tenant mode treats it as non-isolating.
    const clientKey = 'api:retrievekey0000000000000000000:client:deadbeefdeadbeef';
    store.putResponse('resp_guess', CONVERSATION, clientKey);
    const r = handleGetResponse('resp_guess', { context: { callerKey: clientKey } });
    assert.equal(r.status, 404);
  });

  it('404s when the caller has no identity at all', () => {
    store.putResponse('resp_x', CONVERSATION, CALLER);
    assert.equal(handleGetResponse('resp_x', { context: { callerKey: '' } }).status, 404);
    assert.equal(handleGetResponse('resp_x', {}).status, 404);
  });
});

describe('DELETE /v1/responses/{id}', () => {
  it('deletes the response and reports the OpenAI deletion shape', () => {
    store.putResponse('resp_del', CONVERSATION, CALLER);
    const r = handleDeleteResponse('resp_del', { context: { callerKey: CALLER } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { id: 'resp_del', object: 'response.deleted', deleted: true });
    assert.equal(store.getResponse('resp_del', CALLER).ok, false, 'and it must really be gone');
  });

  it('releases the byte accounting', () => {
    store.putResponse('resp_bytes', CONVERSATION, CALLER);
    assert.ok(store.getResponseStoreStats().bytes > 0);
    handleDeleteResponse('resp_bytes', { context: { callerKey: CALLER } });
    assert.equal(store.getResponseStoreStats().bytes, 0);
  });

  it('404s an unknown id rather than reporting a phantom success', () => {
    const r = handleDeleteResponse('resp_ghost', { context: { callerKey: CALLER } });
    assert.equal(r.status, 404);
    assert.notEqual(r.body.deleted, true);
  });

  it('cannot delete another caller\'s response', () => {
    store.putResponse('resp_alice2', CONVERSATION, CALLER);
    const r = handleDeleteResponse('resp_alice2', { context: { callerKey: OTHER } });
    assert.equal(r.status, 404);
    assert.equal(store.getResponse('resp_alice2', CALLER).ok, true,
      'the owner\'s response must survive a foreign delete attempt');
  });

  it('a deleted response is no longer chainable', () => {
    store.putResponse('resp_chain', CONVERSATION, CALLER);
    handleDeleteResponse('resp_chain', { context: { callerKey: CALLER } });
    assert.equal(store.getResponse('resp_chain', CALLER).ok, false);
  });
});
