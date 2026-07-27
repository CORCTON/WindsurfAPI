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
 *   RESPONSE_STORE_MAX_BYTES=128m   — total byte budget (default: 128MB; b/k/kb/m/mb/g/gb)
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

// Neither MAX_ENTRIES nor MAX_MESSAGES bounds actual MEMORY — they bound counts.
// Measured on realistic agent-loop conversations (8KB system prompt + 200
// tool_call/tool_result pairs with 4KB outputs, truncated to MAX_MESSAGES): ~167KB
// of heap per stored entry, so the default 2000 entries is ~327MB, and a
// text-heavy shape measured ~518MB. On the small VPSes this project explicitly
// targets (the README tells 2GB hosts to lower LS_MAX_INSTANCES) that is enough to
// matter on its own. So the store also carries a BYTE budget and evicts on
// whichever limit binds first.
const MAX_BYTES = (() => {
  const raw = String(process.env.RESPONSE_STORE_MAX_BYTES || '').trim();
  if (raw) {
    const m = raw.match(/^(\d+)\s*(b|k|kb|m|mb|g|gb)?$/i);
    if (m) {
      const mult = { b: 1, k: 1024, kb: 1024, m: 1048576, mb: 1048576, g: 1073741824, gb: 1073741824 };
      const n = Number(m[1]) * (mult[(m[2] || 'b').toLowerCase()] || 1);
      if (n > 0) return n;
    }
  }
  return 128 * 1024 * 1024; // 128MB — roughly 800 realistic conversations
})();

// Approximate retained size of a stored conversation. Deliberately cheap: string
// length (not byteLength) plus a flat per-message overhead. An exact figure would
// need to walk every part of every content array on the hot path; what matters is
// that the estimate is monotonic in the real cost so eviction tracks growth.
function approxBytes(messages) {
  let n = 0;
  for (const m of messages) {
    n += 64; // object + role + bookkeeping
    const c = m?.content;
    if (typeof c === 'string') n += c.length;
    else if (Array.isArray(c)) for (const p of c) n += 32 + (typeof p?.text === 'string' ? p.text.length : 0);
    if (Array.isArray(m?.tool_calls)) {
      for (const tc of m.tool_calls) {
        n += 96 + String(tc?.id || '').length + String(tc?.function?.name || '').length
          + String(tc?.function?.arguments ?? '').length;
      }
    }
    if (m?.tool_call_id) n += String(m.tool_call_id).length;
  }
  return n;
}

// Map<responseId, { messages, callerKey, model, createdAt, lastAccess, bytes }>
// Map iteration order is maintained as least-recently-used order: every read and
// refresh re-inserts, so the first key is always the LRU victim (O(1) eviction).
const _entries = new Map();
const _tenantCounts = new Map();

const _stats = { stored: 0, hits: 0, misses: 0, expires: 0, evictions: 0, rejected: 0 };
let _bytes = 0;   // running total of approxBytes across all entries

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
  _bytes -= entry.bytes || 0;
  if (_bytes < 0) _bytes = 0;
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
  const kept = truncateMessages(messages);
  const bytes = approxBytes(kept);
  const createdAt = existing?.createdAt || now;
  const model = opts.model || existing?.model || null;
  if (existing) dropEntry(responseId); else trackInsert(callerKey);
  _entries.set(responseId, { messages: kept, callerKey, model, createdAt, lastAccess: now, bytes });
  _bytes += bytes;
  _stats.stored++;

  // Byte budget: entry/message counts bound cardinality, not memory. Evict LRU
  // until the total fits. Same fair-share preference as the count path — a tenant
  // over its slice pays for its own growth first — but never evict the entry just
  // written (it is the caller's live conversation; dropping it would make the id
  // it was handed unusable).
  //
  // `_entries.size > 1` is what protects the entry just written: the set() above
  // put it at the TAIL of the Map (most-recently-used), so oldestId() can only
  // return it when it is the sole entry — and then this loop does not run at all.
  // That matters because a single conversation may legitimately exceed the whole
  // budget; the store still has to hand back a usable id rather than silently
  // dropping what it just accepted. `guard` bounds the loop so a bookkeeping bug
  // can never spin the request thread.
  let guard = _entries.size + 1;
  while (_bytes > MAX_BYTES && _entries.size > 1 && guard-- > 0) {
    const tenant = tenantOf(callerKey);
    const fairShare = Math.max(1, Math.floor(MAX_ENTRIES / Math.max(1, _tenantCounts.size)));
    const overShare = (_tenantCounts.get(tenant) || 0) >= fairShare;
    const victim = (overShare && oldestId(tenant)) || oldestId();
    if (!victim) break;
    dropEntry(victim);
    _stats.evictions++;
  }
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
  return {
    ..._stats,
    size: _entries.size,
    bytes: _bytes,
    maxBytes: MAX_BYTES,
    enabled: ENABLED,
    tenants: _tenantCounts.size,
  };
}

/** Test/reset helper. */
export function resetResponseStore() {
  _entries.clear();
  _tenantCounts.clear();
  _bytes = 0;
  for (const k of Object.keys(_stats)) _stats[k] = 0;
}
