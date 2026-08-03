import { listModels } from '../models.js';
import { resolveConnectSelector, getLiveCatalog, FREE_REACHABLE_SELECTORS, __testing } from '../devin-connect-models.js';
import { getBackendSwitch } from '../runtime-config.js';
import { hasConnectEntitledAccount, getAccountCount } from '../auth.js';

// GET /v1/models. On a DEVIN_CONNECT deployment (the production transport) only
// expose models that actually resolve to a real catalog selector — otherwise
// /v1/models advertises ~90 models the account can't reach (they'd 400 at chat).
// The MODELS table stays full for the Cascade transport; this is a per-transport
// view, not a catalog edit. Non-connect deployments see the full list unchanged.
/**
 * Should /v1/models skip the per-account entitlement filter entirely?
 *
 * Mirrors the chat path's exemption (handlers/chat.js, the
 * `hasEnvToken && !hasConnectEntitledAccount` guard) on purpose: chat exempts a
 * deployment whose token comes from the environment WITHOUT looking at pool size,
 * so discovery has to do the same. A token+free-account mixed deployment would
 * otherwise advertise zero rows while chat happily serves paid selectors.
 *
 * The empty-pool arm is separate and required: hasConnectEntitledAccount returns
 * false on an empty pool (Array.some over nothing), so filtering a pool-less
 * deployment would strip every row rather than fail open.
 */
function shouldSkipEntitlementFilter(env, accountCount) {
  const hasEnvToken = !!(env.DEVIN_CONNECT_TOKEN || env.WINDSURF_API_KEY);
  return hasEnvToken || accountCount === 0;
}

export function handleModels(env = process.env) {
  const effectiveEnv = env === process.env ? env : { ...process.env, ...env };
  // listModels receives the same effective environment used for transport
  // selection so a DEVIN_CONNECT request is never pre-filtered by the
  // unrelated Cascade cloud catalog.
  let data = listModels({ env: effectiveEnv });
  if (getBackendSwitch('devinConnect', effectiveEnv)) {
    // Existence = snapshot ∪ live (same source of truth as resolveConnectSelector,
    // audit 2026-07-12). Before this, the filter only consulted the frozen
    // CATALOG_SELECTORS snapshot, so live-synced selectors were dropped here even
    // though they run fine at /v1/chat/completions.
    const known = (selector) => __testing.CATALOG_SELECTORS.has(selector) || __testing._liveSelectors.has(selector);
    // Entitlement filter (#234 / #231 in the connect namespace). Existence alone
    // was the only test here, so a free-only pool still advertised every paid
    // selector the upstream happens to publish — the client picked one and got a
    // 403 at chat. #232 fixed exactly this for the Cascade namespace, but its
    // filters early-return unfiltered when devinConnect is on (models.js
    // isModelAllowedByCloudCatalog / filterModelKeysByCloudCatalog), which is
    // correct as a namespace boundary and is why the check has to be redone here.
    const skipEntitlement = shouldSkipEntitlementFilter(effectiveEnv, getAccountCount().total);
    const entitled = (selector) => skipEntitlement || hasConnectEntitledAccount(selector);
    data = data.filter((m) => {
      const { selector, mapped } = resolveConnectSelector(m._windsurf_id);
      return mapped && known(selector) && entitled(selector);
    });
    // Synthesize entries for live-only selectors the upstream added AFTER the
    // frozen snapshot AND that aren't in the hardcoded MODELS table (gpt-5-6-*/
    // grok-4-5-*/nemotron etc.). Without this they run at chat but never appear
    // in /v1/models, so Codex/clients can't discover them. Keyed by the selector
    // itself; dedup against what listModels already emitted.
    const seen = new Set(data.map((m) => m.id));
    const ts = Math.floor(Date.now() / 1000);
    // SECOND row producer. The entitlement filter above only governs rows that
    // came from listModels; this loop synthesizes its own, so filtering just the
    // first one left a free-only pool still advertising every live-only paid
    // selector (measured: 86 rows survived a filter applied to producer #1 alone).
    for (const row of getLiveCatalog()) {
      const id = row.selector;
      if (!id || seen.has(id)) continue;
      if (!entitled(id)) continue;
      seen.add(id);
      data.push({
        id,
        object: 'model',
        created: ts,
        owned_by: row.provider || 'windsurf',
        _windsurf_id: id,
        _source: 'live_catalog',
        ...(row.label ? { _label: row.label } : {}),
      });
    }
    // THIRD producer — the rebuild, not a filter.
    //
    // Entitlement filtering alone takes a free-only pool to ZERO rows, and zero
    // rows is worse than the over-advertising it fixes: Codex and Cline refuse to
    // start against an empty model list, so the proxy goes from "lists models that
    // 403" to "unusable". Measured: 56 advertised / 0 reachable before, 0 rows after
    // filtering.
    //
    // The gap exists because the free-reachable selector is in NEITHER row source —
    // `swe-1-6-slow` is absent from the frozen snapshot, absent from all 105 live
    // catalog rows, and has no MODELS entry — yet chat routes it fine and
    // FREE_REACHABLE_SELECTORS declares it callable by any account. So discovery has
    // to synthesize it rather than find it.
    //
    // This is a floor, not a widening: every selector added here is one that
    // isConnectSelectorAllowedForAccount already admits for ANY account, so it can
    // never advertise something the pool cannot run.
    for (const selector of FREE_REACHABLE_SELECTORS) {
      if (seen.has(selector)) continue;
      seen.add(selector);
      data.push({
        id: selector,
        object: 'model',
        created: ts,
        owned_by: 'windsurf',
        _windsurf_id: selector,
        _source: 'free_reachable',
      });
    }
  }
  return { object: 'list', data };
}
