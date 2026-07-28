import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import {
  __resetModelCatalogState,
  __setModelCatalogDeps,
  __waitForModelCatalogSync,
  addAccountByKey,
  configureBindHost,
  getAvailableModelsForAccount,
  isModelAllowedForAccount,
  removeAccount,
  setAccountStatus,
  trySyncModelCatalog,
} from '../src/auth.js';
import { handleDashboardApi } from '../src/dashboard/api.js';
import { handleModels } from '../src/handlers/models.js';
import {
  MODELS,
  MODEL_TIER_ACCESS,
  filterModelKeysByCloudCatalog,
  listModels,
  mergeCloudModels,
  setActiveCloudCatalogAccounts,
} from '../src/models.js';

const ALLOWED_KEY = 'gemini-2.5-flash';
const SECOND_ALLOWED_KEY = 'claude-4-sonnet';
const ACCOUNT_A = 'catalog-account-a';
const ACCOUNT_B = 'catalog-account-b';
const ORIGINAL_ALLOW_NO_AUTH = process.env.DASHBOARD_ALLOW_NO_AUTH;
const ORIGINAL_IGNORE_FILTER = process.env.WINDSURFAPI_IGNORE_CLOUD_FILTER;
const ORIGINAL_SPECIAL_BACKEND = process.env.WINDSURFAPI_SPECIAL_AGENT_BACKEND;
const ORIGINAL_CLI_ENABLED = process.env.DEVIN_CLI_ENABLED;
const ORIGINAL_DASHBOARD_PASSWORD = config.dashboardPassword;
const ORIGINAL_API_KEY = config.apiKey;
const createdAccountIds = [];

function fakeRes() {
  return {
    statusCode: 0,
    body: '',
    writeHead(status) { this.statusCode = status; },
    end(chunk) { this.body += chunk ? String(chunk) : ''; },
    json() { return this.body ? JSON.parse(this.body) : null; },
  };
}

function localReq(path) {
  return {
    url: `/dashboard/api${path}`,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function syncAllowed(keys = [ALLOWED_KEY], accountId = ACCOUNT_A) {
  setActiveCloudCatalogAccounts([accountId]);
  mergeCloudModels(
    keys.map((key) => ({ modelUid: MODELS[key].modelUid })),
    { accountId },
  );
}

function cascadeKeys(keys) {
  return keys.filter((key) => MODELS[key]?.backend !== 'special_agent');
}

beforeEach(() => {
  __resetModelCatalogState();
  __setModelCatalogDeps(null);
  delete process.env.WINDSURFAPI_IGNORE_CLOUD_FILTER;
  delete process.env.WINDSURFAPI_SPECIAL_AGENT_BACKEND;
  delete process.env.DEVIN_CLI_ENABLED;
  process.env.DASHBOARD_ALLOW_NO_AUTH = '1';
  config.dashboardPassword = '';
  config.apiKey = '';
  configureBindHost('127.0.0.1');
});

afterEach(async () => {
  for (const accountId of createdAccountIds.splice(0)) removeAccount(accountId);
  await __waitForModelCatalogSync();
  __resetModelCatalogState();
  __setModelCatalogDeps(null);
  if (ORIGINAL_ALLOW_NO_AUTH === undefined) delete process.env.DASHBOARD_ALLOW_NO_AUTH;
  else process.env.DASHBOARD_ALLOW_NO_AUTH = ORIGINAL_ALLOW_NO_AUTH;
  if (ORIGINAL_IGNORE_FILTER === undefined) delete process.env.WINDSURFAPI_IGNORE_CLOUD_FILTER;
  else process.env.WINDSURFAPI_IGNORE_CLOUD_FILTER = ORIGINAL_IGNORE_FILTER;
  if (ORIGINAL_SPECIAL_BACKEND === undefined) delete process.env.WINDSURFAPI_SPECIAL_AGENT_BACKEND;
  else process.env.WINDSURFAPI_SPECIAL_AGENT_BACKEND = ORIGINAL_SPECIAL_BACKEND;
  if (ORIGINAL_CLI_ENABLED === undefined) delete process.env.DEVIN_CLI_ENABLED;
  else process.env.DEVIN_CLI_ENABLED = ORIGINAL_CLI_ENABLED;
  config.dashboardPassword = ORIGINAL_DASHBOARD_PASSWORD;
  config.apiKey = ORIGINAL_API_KEY;
  configureBindHost('0.0.0.0');
});

describe('upstream account cloud catalog filtering', () => {
  it('limits GET /v1/models and tier routing to catalog-approved Cascade models', () => {
    syncAllowed();

    const apiKeys = handleModels({}).data.map((model) => model._windsurf_id);
    assert.deepEqual(cascadeKeys(apiKeys), [ALLOWED_KEY]);
    assert.deepEqual(cascadeKeys(MODEL_TIER_ACCESS.pro), [ALLOWED_KEY]);
    assert.deepEqual(cascadeKeys(MODEL_TIER_ACCESS.unknown), [ALLOWED_KEY]);
    assert.deepEqual(cascadeKeys(MODEL_TIER_ACCESS.free), [ALLOWED_KEY]);
  });

  it('makes the upstream account catalog win over entitlement and manual tier overrides', () => {
    syncAllowed();
    const disallowedKey = 'claude-4-sonnet';
    const statusAccount = {
      id: ACCOUNT_A,
      tier: 'pro',
      userStatusLastFetched: Date.now(),
      capabilities: {
        [ALLOWED_KEY]: { ok: true, reason: 'user_status' },
        [disallowedKey]: { ok: true, reason: 'user_status' },
      },
    };
    const manualAccount = { ...statusAccount, tierManual: true };

    assert.equal(isModelAllowedForAccount(statusAccount, ALLOWED_KEY), true);
    assert.equal(
      isModelAllowedForAccount(statusAccount, disallowedKey),
      false,
      'per-account entitlement must not bypass the upstream account catalog',
    );
    assert.equal(
      isModelAllowedForAccount(manualAccount, disallowedKey),
      false,
      'manual tier override must not bypass the upstream account catalog',
    );
    assert.ok(!getAvailableModelsForAccount(statusAccount).includes(disallowedKey));
  });

  it('uses the same approved catalog for both Dashboard model endpoints', async () => {
    syncAllowed();

    const modelsRes = fakeRes();
    await handleDashboardApi('GET', '/models', {}, localReq('/models'), modelsRes);
    assert.equal(modelsRes.statusCode, 200);
    assert.deepEqual(
      cascadeKeys(modelsRes.json().models.map((model) => model.id)),
      [ALLOWED_KEY],
      '/dashboard/api/models must not expose models outside the active account catalogs',
    );

    const tierRes = fakeRes();
    await handleDashboardApi('GET', '/tier-access', {}, localReq('/tier-access'), tierRes);
    assert.equal(tierRes.statusCode, 200);
    assert.deepEqual(cascadeKeys(tierRes.json().allModels), [ALLOWED_KEY]);
  });

  it('does not expose mutable cloud-catalog state', () => {
    syncAllowed();

    const snapshot = filterModelKeysByCloudCatalog();
    snapshot.length = 0;

    assert.deepEqual(
      cascadeKeys(listModels().map((model) => model._windsurf_id)),
      [ALLOWED_KEY],
      'mutating a returned snapshot must not disable the active filter',
    );
  });

  it('fails open before a usable catalog arrives and supports an explicit opt-out', () => {
    const baseline = handleModels({}).data.map((model) => model.id);
    assert.ok(baseline.length > 100);

    setActiveCloudCatalogAccounts([ACCOUNT_A]);
    mergeCloudModels([null, {}, { modelUid: 123 }], { accountId: ACCOUNT_A });
    assert.deepEqual(handleModels({}).data.map((model) => model.id), baseline);

    syncAllowed();
    process.env.WINDSURFAPI_IGNORE_CLOUD_FILTER = '1';
    assert.deepEqual(handleModels({}).data.map((model) => model.id), baseline);
  });

  it('clears a stale catalog when mergeCloudModels receives a non-array', () => {
    const baseline = handleModels({}).data.map((model) => model.id);
    syncAllowed();

    mergeCloudModels({ malformed: true }, { accountId: ACCOUNT_A });

    assert.deepEqual(handleModels({}).data.map((model) => model.id), baseline);
  });

  it('matches cloud model UIDs case-insensitively', () => {
    setActiveCloudCatalogAccounts([ACCOUNT_A]);
    mergeCloudModels(
      [{ modelUid: MODELS[ALLOWED_KEY].modelUid.toLowerCase() }],
      { accountId: ACCOUNT_A },
    );

    assert.deepEqual(
      cascadeKeys(handleModels({}).data.map((model) => model._windsurf_id)),
      [ALLOWED_KEY],
    );
  });

  it('keeps enabled special-agent models because Cascade catalog policy does not govern them', () => {
    process.env.WINDSURFAPI_SPECIAL_AGENT_BACKEND = 'devin-cli';
    syncAllowed();

    const models = listModels();
    assert.deepEqual(cascadeKeys(models.map((model) => model._windsurf_id)), [ALLOWED_KEY]);
    assert.ok(models.some((model) => model._backend === 'special_agent' && model._available));
  });

  it('keeps a newly discovered cloud model when that same catalog allows it', () => {
    const uid = 'MODEL_CLOUD_CATALOG_TEST';
    const key = 'model-cloud-catalog-test';
    setActiveCloudCatalogAccounts([ACCOUNT_A]);
    mergeCloudModels([{
      modelUid: uid,
      provider: 'MODEL_PROVIDER_ANTHROPIC',
      creditMultiplier: 2,
    }], { accountId: ACCOUNT_A });

    const models = handleModels({}).data;
    assert.deepEqual(cascadeKeys(models.map((model) => model._windsurf_id)), [key]);
    assert.equal(models[0].owned_by, 'anthropic');
  });

  it('unions model listings while enforcing each account catalog during routing', () => {
    setActiveCloudCatalogAccounts([ACCOUNT_A, ACCOUNT_B]);
    mergeCloudModels(
      [{ modelUid: MODELS[ALLOWED_KEY].modelUid }],
      { accountId: ACCOUNT_A },
    );
    mergeCloudModels(
      [{ modelUid: MODELS[SECOND_ALLOWED_KEY].modelUid }],
      { accountId: ACCOUNT_B },
    );

    assert.deepEqual(
      cascadeKeys(handleModels({}).data.map((model) => model._windsurf_id)).sort(),
      [ALLOWED_KEY, SECOND_ALLOWED_KEY].sort(),
      'the pool catalog should be the union of active account catalogs',
    );

    const baseAccount = {
      tier: 'pro',
      tierManual: true,
      capabilities: {},
    };
    const accountA = { ...baseAccount, id: ACCOUNT_A };
    const accountB = { ...baseAccount, id: ACCOUNT_B };

    assert.equal(isModelAllowedForAccount(accountA, ALLOWED_KEY), true);
    assert.equal(isModelAllowedForAccount(accountA, SECOND_ALLOWED_KEY), false);
    assert.equal(isModelAllowedForAccount(accountB, ALLOWED_KEY), false);
    assert.equal(isModelAllowedForAccount(accountB, SECOND_ALLOWED_KEY), true);
  });

  it('fails global listings open until every active account has a usable catalog', () => {
    const baseline = handleModels({}).data.map((model) => model.id);
    setActiveCloudCatalogAccounts([ACCOUNT_A, ACCOUNT_B]);
    mergeCloudModels(
      [{ modelUid: MODELS[ALLOWED_KEY].modelUid }],
      { accountId: ACCOUNT_A },
    );

    assert.deepEqual(handleModels({}).data.map((model) => model.id), baseline);
  });

  it('synchronizes every active account instead of reusing the first catalog', async () => {
    const runId = Date.now().toString(36);
    const apiKeyA = `catalog-sync-${runId}-a`;
    const apiKeyB = `catalog-sync-${runId}-b`;
    const requestedKeys = [];
    __setModelCatalogDeps({
      disableConnectSync: true,
      getCascadeModelConfigs: async (apiKey) => {
        requestedKeys.push(apiKey);
        const modelKey = apiKey === apiKeyA ? ALLOWED_KEY : SECOND_ALLOWED_KEY;
        return { configs: [{ modelUid: MODELS[modelKey].modelUid }] };
      },
    });

    const accountA = addAccountByKey(apiKeyA, 'catalog-a');
    const accountB = addAccountByKey(apiKeyB, 'catalog-b');
    createdAccountIds.push(accountA.id, accountB.id);
    accountA.tier = 'pro';
    accountA.tierManual = true;
    accountB.tier = 'pro';
    accountB.tierManual = true;
    await __waitForModelCatalogSync();

    assert.deepEqual(requestedKeys.sort(), [apiKeyA, apiKeyB].sort());
    assert.equal(isModelAllowedForAccount(accountA, ALLOWED_KEY), true);
    assert.equal(isModelAllowedForAccount(accountA, SECOND_ALLOWED_KEY), false);
    assert.equal(isModelAllowedForAccount(accountB, ALLOWED_KEY), false);
    assert.equal(isModelAllowedForAccount(accountB, SECOND_ALLOWED_KEY), true);

    setAccountStatus(accountB.id, 'disabled');
    assert.deepEqual(
      cascadeKeys(handleModels({}).data.map((model) => model._windsurf_id)),
      [ALLOWED_KEY],
      'inactive account catalogs must not remain in the pool listing',
    );
  });

  it('leaves a malformed catalog response retryable and accepts the next valid response', async () => {
    const runId = Date.now().toString(36);
    const apiKey = `catalog-retry-${runId}`;
    let requests = 0;
    __setModelCatalogDeps({
      disableConnectSync: true,
      getCascadeModelConfigs: async () => {
        requests += 1;
        if (requests === 1) return {};
        return { configs: [{ modelUid: MODELS[ALLOWED_KEY].modelUid }] };
      },
    });

    const account = addAccountByKey(apiKey, 'catalog-retry');
    createdAccountIds.push(account.id);
    await __waitForModelCatalogSync();
    trySyncModelCatalog();
    await __waitForModelCatalogSync();

    assert.equal(requests, 2);
    assert.deepEqual(
      cascadeKeys(handleModels({}).data.map((model) => model._windsurf_id)),
      [ALLOWED_KEY],
    );
  });

  it('treats a valid empty catalog as synchronized instead of retrying it', async () => {
    const runId = Date.now().toString(36);
    const apiKey = `catalog-empty-${runId}`;
    let requests = 0;
    __setModelCatalogDeps({
      disableConnectSync: true,
      getCascadeModelConfigs: async () => {
        requests += 1;
        return { configs: [] };
      },
    });

    const account = addAccountByKey(apiKey, 'catalog-empty');
    createdAccountIds.push(account.id);
    await __waitForModelCatalogSync();
    trySyncModelCatalog();
    await __waitForModelCatalogSync();

    assert.equal(requests, 1);
  });
});
