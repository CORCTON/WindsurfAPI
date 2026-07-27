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
    n += strBytes(m?.content);
    if (Array.isArray(m?.tool_calls)) {
      for (const tc of m.tool_calls) {
        n += 96 + strBytes(tc?.id) + strBytes(tc?.function?.name) + strBytes(tc?.function?.arguments);
      }
    }
    n += strBytes(m?.tool_call_id);
  }
  return n;
}

// Retained-size estimate for any content value. Two things this must get right,
// both found by review of the first cut:
//
//  - EVERY string field counts, not just `.text`. A Responses `input_image` is
//    normalized to `{type:'image_url', image_url:{url:'data:...;base64,...'}}`,
//    which has no `.text` — so a multi-megabyte data URI was charged a flat 32
//    bytes and the budget never fired on vision payloads (measured: 10 entries
//    holding ~20MB of base64 accounted as 960 bytes, ~15000x under).
//  - 2 bytes per character, not 1. V8 stores any non-Latin1 string as 2 bytes/char,
//    so `.length` undercounts CJK by exactly 2x. Charging 2 everywhere overcounts
//    pure ASCII by 2x, which is the safe direction for a memory bound.
function strBytes(v, depth = 0) {
  if (v == null) return 0;
  if (typeof v === 'string') return v.length * 2;
  if (typeof v === 'number' || typeof v === 'boolean') return 8;
  if (depth > 4) return 32; // guard against a pathological nesting depth
  if (Array.isArray(v)) {
    let n = 0;
    for (const item of v) n += 32 + strBytes(item, depth + 1);
    return n;
  }
  if (typeof v === 'object') {
    let n = 0;
    for (const val of Object.values(v)) n += strBytes(val, depth + 1);
    return n;
  }
  return 0;
}

// Map<responseId, { messages, callerKey, model, createdAt, lastAccess, bytes }>
// Map iteration order is maintained as least-recently-used order: every read and
// refresh re-inserts, so the first key is always the LRU victim (O(1) eviction).
const _entries = new Map();
const _tenantCounts = new Map();
// Per-tenant BYTE totals. The byte-eviction loop needs a byte-denominated fair
// share; comparing an entry COUNT against MAX_ENTRIES/tenants let a byte-bound
// writer look under-share forever and evict strangers (see the loop below).
const _tenantBytes = new Map();

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

function trackInsert(callerKey, bytes = 0) {
  const t = tenantOf(callerKey);
  _tenantCounts.set(t, (_tenantCounts.get(t) || 0) + 1);
  _tenantBytes.set(t, (_tenantBytes.get(t) || 0) + bytes);
}

function dropEntry(id) {
  const entry = _entries.get(id);
  if (!entry) return false;
  _entries.delete(id);
  _bytes -= entry.bytes || 0;
  if (_bytes < 0) _bytes = 0;
  const t = tenantOf(entry.callerKey);
  const n = (_tenantCounts.get(t) || 1) - 1;
  const b = (_tenantBytes.get(t) || 0) - (entry.bytes || 0);
  if (n > 0) { _tenantCounts.set(t, n); _tenantBytes.set(t, b > 0 ? b : 0); }
  else { _tenantCounts.delete(t); _tenantBytes.delete(t); }
  return true;
}

function oldestId(tenant = null, exclude = null) {
  for (const [id, entry] of _entries) {
    if (id === exclude) continue;
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

  // The leading system block gets at most HALF the budget. Without a cap on the
  // head, `MAX_MESSAGES - lead` goes negative once the system block alone reaches
  // the budget, and `slice(-negative)` silently becomes `slice(positive)` — it
  // returns most of the array instead of the last few entries, so the result grew
  // INSTEAD of shrinking (measured: 501 messages in, 901 stored). Codex-style
  // clients that send AGENTS.md / environment context as many separate developer
  // items reach that shape with no adversarial intent.
  const headBudget = Math.max(1, Math.floor(MAX_MESSAGES / 2));
  const head = messages.slice(0, Math.min(lead, headBudget));
  const tailBudget = MAX_MESSAGES - head.length;
  const tail = tailBudget > 0 ? messages.slice(-tailBudget) : [];
  return [...head, ...tail];
}

// No single conversation may claim more than this share of the whole budget.
// Without a per-entry ceiling the eviction loop cannot converge fairly: a tenant
// whose one entry alone exceeds the budget has nothing of its OWN left to evict,
// so it falls through to the global scan and flushes strangers — which is exactly
// the cross-tenant DoS the byte-denominated fair share is meant to prevent.
const MAX_ENTRY_BYTES = Math.max(64 * 1024, Math.floor(MAX_BYTES / 4));

/**
 * Trim a conversation until it fits MAX_ENTRY_BYTES, dropping from the MIDDLE.
 * The leading system block and the most recent turns are what a next turn needs;
 * the middle is the cheapest thing to lose, and losing it is strictly better than
 * either refusing the write or evicting other tenants to make room.
 */
function capEntryBytes(messages) {
  if (approxBytes(messages) <= MAX_ENTRY_BYTES) return messages;
  let lead = 0;
  while (lead < messages.length && messages[lead]?.role === 'system') lead++;
  const head = messages.slice(0, Math.min(lead, 8));
  let tailStart = messages.length;
  const out = [];
  // Walk backwards adding recent turns while they fit.
  let used = approxBytes(head);
  while (tailStart > lead) {
    const candidate = messages[tailStart - 1];
    const cost = approxBytes([candidate]);
    if (used + cost > MAX_ENTRY_BYTES && out.length) break;
    used += cost;
    out.unshift(candidate);
    tailStart--;
    if (used > MAX_ENTRY_BYTES) break;
  }
  const trimmed = [...head, ...out];
  // Last resort: a conversation whose SINGLE message already exceeds the ceiling
  // cannot be shrunk by dropping messages. Cut the text itself, otherwise the
  // store's one promise — total bytes stay within the budget — is false whenever
  // an operator configures a small budget (a 10MB request body, the server cap,
  // lands as ~20MB accounted). The marker keeps the truncation visible to whoever
  // reads the chained context instead of silently changing what the model saw.
  if (approxBytes(trimmed) > MAX_ENTRY_BYTES) return trimContentToFit(trimmed);
  return trimmed;
}

const TRUNCATION_MARKER = '\n\n[... truncated by the response store to stay within RESPONSE_STORE_MAX_BYTES ...]';

function trimContentToFit(messages) {
  const out = messages.map(m => ({ ...m }));
  // Shrink from the LARGEST string field down until the entry fits.
  let guard = 64;
  while (approxBytes(out) > MAX_ENTRY_BYTES && guard-- > 0) {
    let biggest = -1;
    let biggestLen = 0;
    for (let i = 0; i < out.length; i++) {
      const c = out[i]?.content;
      const len = typeof c === 'string' ? c.length : 0;
      if (len > biggestLen) { biggestLen = len; biggest = i; }
    }
    if (biggest < 0 || biggestLen <= TRUNCATION_MARKER.length) break;
    const keep = Math.max(1, Math.floor(biggestLen / 2));
    out[biggest].content = out[biggest].content.slice(0, keep) + TRUNCATION_MARKER;
  }
  return out;
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
  const kept = capEntryBytes(truncateMessages(messages));
  const bytes = approxBytes(kept);
  const createdAt = existing?.createdAt || now;
  const model = opts.model || existing?.model || null;
  if (existing) dropEntry(responseId);
  trackInsert(callerKey, bytes);
  _entries.set(responseId, {
    messages: kept, callerKey, model, createdAt, lastAccess: now, bytes,
  });
  _bytes += bytes;
  _stats.stored++;

  // Byte budget: entry/message counts bound cardinality, NOT memory, so evict
  // until the byte total fits as well.
  //
  // The fairness test must be BYTE-denominated. The first cut reused the count
  // test (`tenantCount >= MAX_ENTRIES / tenants`), which under any byte-bound
  // workload leaves the writer far below its entry share — so `overShare` was
  // always false, the loop fell through to the untenanted scan, and one caller
  // storing a large conversation flushed every other tenant's sessions.
  // Reproduced: 5 tenants x 5 conversations all readable, then a single 5MB write
  // evicted 25/25 of them. That is a cross-tenant DoS the count-only store never
  // had, so fairness here compares the tenant's BYTES against MAX_BYTES/tenants.
  //
  // `exclude: responseId` is load-bearing and NOT redundant with `size > 1`: the
  // Map-tail argument only holds for the untenanted scan. oldestId(tenant) can
  // return the entry just written when it is that tenant's oldest survivor, and
  // then putResponse returned true while the id 404'd immediately after
  // (reproduced with MAX=2, MAX_BYTES=200k). An earlier version dropped this
  // guard as dead code because the mutation test only exercised the untenanted
  // path.
  let guard = _entries.size + 1;
  while (_bytes > MAX_BYTES && _entries.size > 1 && guard-- > 0) {
    const tenant = tenantOf(callerKey);
    const byteShare = MAX_BYTES / Math.max(1, _tenantBytes.size);
    const overShare = (_tenantBytes.get(tenant) || 0) > byteShare;
    // An over-share tenant evicts its OWN oldest. If it has nothing of its own
    // left, stop — accepting a temporary overage is correct, because flushing
    // other tenants to make room for one caller is the DoS this guards against.
    // MAX_ENTRY_BYTES bounds how large that overage can be.
    const victim = overShare
      ? oldestId(tenant, responseId)
      : oldestId(null, responseId);
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
  _tenantBytes.clear();
  _bytes = 0;
  for (const k of Object.keys(_stats)) _stats[k] = 0;
}
