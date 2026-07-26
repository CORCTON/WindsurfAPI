/**
 * Sticky Session Manager.
 *
 * Binds a caller (identified by callerKey + modelKey) to a specific account
 * so that multi-turn conversations stay on the same upstream account. This
 * prevents context loss when the conversation pool reuses a cascade_id that
 * is only valid on the originating account.
 *
 * Design:
 *   - (callerKey, modelKey) → accountId binding with configurable TTL
 *   - Model dimension prevents cross-model collision: the same session
 *     using opus and sonnet can be bound to different accounts
 *   - Binding is created when a successful response is returned
 *   - On next request, getApiKey checks the binding first
 *   - If the bound account is unavailable (rate limited, etc.),
 *     the stale binding is immediately cleared so retries don't
 *     keep hitting the same unavailable account
 *   - Bindings are cleared on session reset or TTL expiry
 *   - The binding table is in-memory only (no persistence needed)
 *
 * Why this matters:
 *   Multi-turn conversations (Claude Code "fix → test → fix again")
 *   currently re-select an account on every request. If the chosen account
 *   runs out of quota or hits RPM mid-conversation, the cascade_id from
 *   the previous turn is invalid on the new account — context is lost.
 *   Sticky binding prevents this by keeping the same account for the
 *   duration of a conversation.
 *
 * Configure via env:
 *   STICKY_SESSION_ENABLED=1     — enable (default: 0, opt-in)
 *   STICKY_SESSION_TTL_MS=1800000 — binding TTL in ms (default: 30 min)
 *   STICKY_SESSION_MAX=10000     — max concurrent bindings (default: 10000)
 *
 * Related issues: #93, #133 (context loss mid-task)
 */

import { isExperimentalEnabled } from '../runtime-config.js';
import { log } from '../config.js';

const ENABLED = process.env.STICKY_SESSION_ENABLED === '1';

const TTL_MS = (() => {
  const n = parseInt(process.env.STICKY_SESSION_TTL_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 30 * 60 * 1000;  // 30 minutes
})();

const MAX_BINDINGS = (() => {
  const n = parseInt(process.env.STICKY_SESSION_MAX || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 10000;
})();

// Map<bindingKey, { accountId, apiKey, createdAt, lastAccess }>
// bindingKey = callerKey + '\0' + modelKey
const _bindings = new Map();
// Per-TENANT binding counts. The tenant is the callerKey prefix that identifies
// the API key (`api:<hash>` / `session:<hash>` / `client:<hash>`), NOT the whole
// callerKey — one API key can mint unlimited distinct callerKeys (a fresh
// body.user per request), and with a single global LRU that let one tenant evict
// every other tenant's live binding, silently re-imposing the ~10x cache-write
// cost on victims. Counts drive the fair-share cap in setStickyBinding.
const _tenantCounts = new Map();
const _stats = {
  hits: 0, misses: 0, creates: 0,
  expires: 0, evictions: 0, fallbacks: 0,
};

/** Tenant identity for quota purposes: the first two `:` segments of callerKey. */
function tenantOf(callerKey) {
  const i = callerKey.indexOf(':');
  if (i < 0) return callerKey;
  const j = callerKey.indexOf(':', i + 1);
  return j < 0 ? callerKey : callerKey.slice(0, j);
}

function tenantOfBindingKey(key) {
  return tenantOf(key.slice(0, key.indexOf('\0')));
}

/** Insert/refresh bookkeeping — keeps _tenantCounts in sync with _bindings. */
function trackInsert(key) {
  const t = tenantOfBindingKey(key);
  _tenantCounts.set(t, (_tenantCounts.get(t) || 0) + 1);
}

function dropBinding(key) {
  if (!_bindings.delete(key)) return false;
  const t = tenantOfBindingKey(key);
  const n = (_tenantCounts.get(t) || 1) - 1;
  if (n > 0) _tenantCounts.set(t, n); else _tenantCounts.delete(t);
  return true;
}

/**
 * Oldest binding key, optionally restricted to one tenant.
 * O(1) amortised for the global case: every read/refresh re-inserts the entry, so
 * Map iteration order IS least-recently-used order and the first entry is the LRU
 * victim (the old code did a full O(MAX_BINDINGS) scan on the request hot path).
 */
function oldestKey(tenant = null) {
  for (const k of _bindings.keys()) {
    if (!tenant || tenantOfBindingKey(k) === tenant) return k;
  }
  return null;
}

/**
 * Build the internal map key from caller + model dimensions.
 * Using \0 delimiter (valid in Map keys but never appears in user input).
 */
function bindingKey(callerKey, modelKey) {
  if (isExperimentalEnabled('stickyBindByUserOnly')) {
    return callerKey + '\0' + '*';
  }
  return callerKey + '\0' + (modelKey || '*');
}

// Log-safe rendering of a binding key: the raw \0 delimiter must never reach
// log output (it corrupts line-oriented log consumers), and the callerKey side
// is truncated the same way auth.js truncates it.
function displayKey(key) {
  const [caller, model] = key.split('\0');
  return `caller=${caller.slice(0, 50)} model=${model}`;
}

// ── Periodic cleanup ─────────────────────────────────────────────
// Clean expired bindings every 5 minutes so memory doesn't grow
// unbounded. The per-lookup path also checks TTL, so this is a safety
// net, not the primary enforcement.
let _cleanupTimer = null;
function ensureCleanupTimer() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, binding] of _bindings) {
      if (now - binding.lastAccess > TTL_MS) {
        dropBinding(key);
        _stats.expires++;
      }
    }
  }, 5 * 60 * 1000).unref();
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Check if sticky sessions are enabled.
 */
export function isStickyEnabled() {
  return ENABLED;
}

/**
 * Look up the bound account for a caller + model pair.
 *
 * @param {string} callerKey - Caller identity key (e.g. session id, IP hash)
 * @param {string} [modelKey] - Model being requested
 * @returns {{ accountId: string, apiKey: string } | null}
 */
export function getStickyBinding(callerKey, modelKey = '') {
  if (!ENABLED) return null;
  if (!callerKey) return null;
  ensureCleanupTimer();

  const key = bindingKey(callerKey, modelKey);
  const binding = _bindings.get(key);
  if (!binding) {
    _stats.misses++;
    log.debug(`[sticky] MISS ${displayKey(key)}`);
    return null;
  }

  const now = Date.now();
  if (now - binding.lastAccess > TTL_MS) {
    dropBinding(key);
    _stats.expires++;
    return null;
  }

  binding.lastAccess = now;
  // Re-insert so Map iteration order stays least-recently-used order (see
  // oldestKey) — this is what makes eviction O(1) instead of a full scan.
  _bindings.delete(key);
  _bindings.set(key, binding);
  _stats.hits++;
  log.debug(`[sticky] HIT ${displayKey(key)} → account=${binding.accountId}`);
  return { accountId: binding.accountId, apiKey: binding.apiKey };
}

/**
 * Set (or refresh) a sticky binding.
 *
 * @param {string} callerKey
 * @param {string} modelKey
 * @param {string} accountId
 * @param {string} apiKey
 */
export function setStickyBinding(callerKey, modelKey, accountId, apiKey) {
  if (!ENABLED || !callerKey || !accountId) return;
  ensureCleanupTimer();

  // At capacity: evict. A single global LRU let one tenant flood the table with
  // fresh callerKeys and evict every other tenant's live binding. So a tenant
  // already holding at least its fair share pays for its own growth — it evicts
  // ITS OWN least-recently-used binding instead of a stranger's.
  if (_bindings.size >= MAX_BINDINGS && !_bindings.has(bindingKey(callerKey, modelKey))) {
    const tenant = tenantOf(callerKey);
    const fairShare = Math.max(1, Math.floor(MAX_BINDINGS / Math.max(1, _tenantCounts.size)));
    const overShare = (_tenantCounts.get(tenant) || 0) >= fairShare;
    const victim = (overShare && oldestKey(tenant)) || oldestKey();
    if (victim) {
      dropBinding(victim);
      _stats.evictions++;
    }
  }

  const key = bindingKey(callerKey, modelKey);
  const now = Date.now();
  const existing = _bindings.get(key);

  if (existing) _bindings.delete(key); else trackInsert(key);
  _bindings.set(key, {
    accountId,
    apiKey,
    createdAt: existing?.createdAt || now,
    lastAccess: now,
  });

  if (!existing) {
    _stats.creates++;
    log.info(`[sticky] SET ${displayKey(key)} → account=${accountId}`);
  }
}

/**
 * Clear the sticky binding for a caller+model pair.
 * Called when the bound account becomes unavailable (rate limited, banned, etc.)
 *
 * @param {string} callerKey
 * @param {string} [modelKey]
 */
export function clearStickyBinding(callerKey, modelKey = '') {
  if (!ENABLED || !callerKey) return;
  const key = bindingKey(callerKey, modelKey);
  if (_bindings.has(key)) log.info(`[sticky] CLEAR ${displayKey(key)}`);
  dropBinding(key);
}

/**
 * Clear all bindings for a caller (all models).
 * Called on session reset or disconnection.
 *
 * @param {string} callerKey
 */
export function clearCallerBindings(callerKey) {
  if (!ENABLED || !callerKey) return;
  const prefix = callerKey + '\0';
  for (const key of _bindings.keys()) {
    if (key.startsWith(prefix)) dropBinding(key);
  }
}

/**
 * Record that a bound account was unusable and the caller fell back to normal
 * selection (auth.js clears the binding right before this). Kept separate from
 * clearStickyBinding so an operator can tell "pin broke and rotated" apart
 * from ordinary clears.
 */
export function noteStickyFallback() {
  _stats.fallbacks++;
}

/**
 * Reset all bindings. Useful for testing or full session reset.
 */
export function resetAllBindings() {
  _bindings.clear();
  _tenantCounts.clear();
}

/**
 * Get stats for monitoring.
 * @returns {{ hits: number, misses: number, creates: number, expires: number, evictions: number, fallbacks: number, size: number }}
 */
export function getStickyStats() {
  return { ..._stats, size: _bindings.size };
}
