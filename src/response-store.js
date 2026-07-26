/**
 * Responses API server-side conversation state.
 *
 * WHY: `/v1/responses` advertises OpenAI Responses compatibility, whose defining
 * feature is that the SERVER holds the conversation. A client sends only the new
 * turn plus `previous_response_id` and the server prepends everything before it.
 *
 * Before this module `previous_response_id` was never read (grep: zero hits in
 * handlers/responses.js). A chained client therefore reached the upstream with a
 * SINGLE message every turn — the model answered each turn blind, with no error
 * and no warning, producing fluent but context-free replies the caller had no way
 * to diagnose. That silent-wrong-answer mode is the thing this fixes.
 *
 * Design:
 *   - Each stored entry holds the FULL accumulated message list for that turn
 *     (input + the assistant output), not a parent pointer. Resolution is then a
 *     single O(1) lookup instead of walking a chain, and a mid-chain eviction
 *     cannot silently truncate history — the lookup either has everything or
 *     fails loudly.
 *   - Entries are scoped by callerKey. A response id minted for one caller MUST
 *     NOT resolve for another, or tenant A could read tenant B's conversation by
 *     replaying an id. Lookup mismatch fails closed (treated as not found).
 *   - Bounded like every other in-memory table here: TTL, a hard cap, LRU
 *     eviction with a per-tenant fair share so one caller cannot flush everyone
 *     else's conversations (same lesson as account/sticky-session.js).
 *   - `store: false` on the request skips persistence, per the OpenAI contract —
 *     such a response cannot later be used as a `previous_response_id`.
 *
 * Configure via env:
 *   RESPONSE_STORE_ENABLED=0        — disable (default: on)
 *   RESPONSE_STORE_TTL_MS=3600000   — entry TTL in ms (default: 1 hour)
 *   RESPONSE_STORE_MAX=2000         — max stored responses (default: 2000)
 *   RESPONSE_STORE_MAX_MESSAGES=400 — per-conversation message cap (default: 400)
 */

import { log } from './config.js';

const ENABLED = process.env.RESPONSE_STORE_ENABLED !== '0';

const TTL_MS = (() => {
  const n = parseInt(process.env.RESPONSE_STORE_TTL_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 60 * 60 * 1000; // 1 hour
})();

const MAX_ENTRIES = (() => {
  const n = parseInt(process.env.RESPONSE_STORE_MAX || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
})();

// A runaway agent loop would otherwise grow one conversation without bound. The
// cap keeps the OLDEST turns (the system prompt and early context matter most for
// coherence) — see truncateMessages.
const MAX_MESSAGES = (() => {
  const n = parseInt(process.env.RESPONSE_STORE_MAX_MESSAGES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 400;
})();

// Map<responseId, { messages, callerKey, model, createdAt, lastAccess }>
// Map iteration order is maintained as least-recently-used order: every read and
// refresh re-inserts, so the first key is always the LRU victim (O(1) eviction).
const _entries = new Map();
const _tenantCounts = new Map();

const _stats = { stored: 0, hits: 0, misses: 0, expires: 0, evictions: 0, rejected: 0 };

export function isResponseStoreEnabled() {
  return ENABLED;
}

/**
 * Tenant identity for quota purposes: the API-key prefix of the callerKey, not
 * the whole callerKey. One API key can mint unlimited distinct callerKeys (a
 * fresh body.user per request), so quota'ing the full callerKey would not bound
 * anything.
 */
function tenantOf(callerKey) {
  const key = String(callerKey || '');
  const i = key.indexOf(':');
  if (i < 0) return key;
  const j = key.indexOf(':', i + 1);
  return j < 0 ? key : key.slice(0, j);
}

function trackInsert(callerKey) {
  const t = tenantOf(callerKey);
  _tenantCounts.set(t, (_tenantCounts.get(t) || 0) + 1);
}

function dropEntry(id) {
  const entry = _entries.get(id);
  if (!entry) return false;
  _entries.delete(id);
  const t = tenantOf(entry.callerKey);
  const n = (_tenantCounts.get(t) || 1) - 1;
  if (n > 0) _tenantCounts.set(t, n); else _tenantCounts.delete(t);
  return true;
}

function oldestId(tenant = null) {
  for (const [id, entry] of _entries) {
    if (!tenant || tenantOf(entry.callerKey) === tenant) return id;
  }
  return null;
}

// Periodic sweep so an idle process does not hold expired conversations. The
// per-lookup TTL check is the primary enforcement; this is the safety net.
let _sweepTimer = null;
function ensureSweepTimer() {
  if (_sweepTimer) return;
  _sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of [..._entries]) {
      if (now - entry.lastAccess > TTL_MS) {
        dropEntry(id);
        _stats.expires++;
      }
    }
  }, 5 * 60 * 1000).unref();
}

/**
 * Keep the conversation within MAX_MESSAGES, preserving the leading system
 * message(s) — dropping those loses the agent's instructions and changes
 * behaviour far more than dropping middle turns.
 */
function truncateMessages(messages) {
  if (messages.length <= MAX_MESSAGES) return messages;
  let lead = 0;
  while (lead < messages.length && messages[lead]?.role === 'system') lead++;
  const head = messages.slice(0, lead);
  const tail = messages.slice(-(MAX_MESSAGES - lead));
  return [...head, ...tail];
}

/**
 * Store the accumulated conversation under a response id.
 *
 * @param {string} responseId  the id handed back to the client
 * @param {Array}  messages    FULL conversation for this turn (input + output)
 * @param {string} callerKey   tenant/identity scope
 * @param {object} [opts]      { model?: string, store?: boolean }
 * @returns {boolean} true when persisted
 */
export function putResponse(responseId, messages, callerKey, opts = {}) {
  if (!ENABLED || !responseId || !Array.isArray(messages) || !messages.length) return false;
  // The OpenAI contract: `store: false` means this response is not retained, so
  // it can never serve as a later previous_response_id.
  if (opts.store === false) return false;
  // No caller scope means no way to isolate this conversation from another
  // tenant's — refuse rather than create a shared-readable entry.
  if (!callerKey) { _stats.rejected++; return false; }
  ensureSweepTimer();

  if (_entries.size >= MAX_ENTRIES && !_entries.has(responseId)) {
    // Fair share: a tenant already at or above its slice evicts its OWN oldest
    // conversation instead of a stranger's.
    const tenant = tenantOf(callerKey);
    const fairShare = Math.max(1, Math.floor(MAX_ENTRIES / Math.max(1, _tenantCounts.size)));
    const overShare = (_tenantCounts.get(tenant) || 0) >= fairShare;
    const victim = (overShare && oldestId(tenant)) || oldestId();
    if (victim) { dropEntry(victim); _stats.evictions++; }
  }

  const now = Date.now();
  const existing = _entries.get(responseId);
  if (existing) dropEntry(responseId); else trackInsert(callerKey);
  _entries.set(responseId, {
    messages: truncateMessages(messages),
    callerKey,
    model: opts.model || existing?.model || null,
    createdAt: existing?.createdAt || now,
    lastAccess: now,
  });
  _stats.stored++;
  return true;
}

/**
 * Resolve a previous_response_id to its accumulated conversation.
 *
 * Returns a discriminated result so the caller can fail LOUDLY on a miss. Silently
 * proceeding with just the new turn is the bug this module exists to remove: the
 * model would answer with no context and the client could not tell.
 *
 * @returns {{ ok: true, messages: Array, model: string|null }
 *          | { ok: false, reason: 'disabled'|'not_found'|'expired'|'forbidden' }}
 */
export function getResponse(responseId, callerKey) {
  if (!ENABLED) return { ok: false, reason: 'disabled' };
  if (!responseId) return { ok: false, reason: 'not_found' };
  ensureSweepTimer();

  const entry = _entries.get(responseId);
  if (!entry) { _stats.misses++; return { ok: false, reason: 'not_found' }; }

  const now = Date.now();
  if (now - entry.lastAccess > TTL_MS) {
    dropEntry(responseId);
    _stats.expires++;
    return { ok: false, reason: 'expired' };
  }

  // Cross-tenant guard: an id minted for another caller must not resolve here.
  // Fails closed and is reported as not_found so a caller cannot probe which ids
  // exist for other tenants.
  if (entry.callerKey !== callerKey) {
    _stats.rejected++;
    log.warn(`[response-store] rejected cross-caller lookup of ${String(responseId).slice(0, 24)}`);
    return { ok: false, reason: 'forbidden' };
  }

  entry.lastAccess = now;
  // Re-insert to keep Map order == LRU order.
  _entries.delete(responseId);
  _entries.set(responseId, entry);
  _stats.hits++;
  return { ok: true, messages: entry.messages, model: entry.model };
}

/** Explicit deletion (DELETE /v1/responses/{id}). Scoped like the lookup. */
export function deleteResponse(responseId, callerKey) {
  if (!ENABLED || !responseId) return false;
  const entry = _entries.get(responseId);
  if (!entry) return false;
  if (entry.callerKey !== callerKey) { _stats.rejected++; return false; }
  return dropEntry(responseId);
}

export function getResponseStoreStats() {
  return { ..._stats, size: _entries.size, enabled: ENABLED, tenants: _tenantCounts.size };
}

/** Test/reset helper. */
export function resetResponseStore() {
  _entries.clear();
  _tenantCounts.clear();
  for (const k of Object.keys(_stats)) _stats[k] = 0;
}
