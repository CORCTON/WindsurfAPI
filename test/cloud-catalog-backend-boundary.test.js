import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import {
  __resetModelCatalogState,
  __setModelCatalogDeps,
  __waitForModelCatalogSync,
  addAccountByKey,
  configureBindHost,
  getDroughtSummary,
  removeAccount,
} from '../src/auth.js';
import { handleDashboardApi } from '../src/dashboard/api.js';
import { handleModels } from '../src/handlers/models.js';
import { _resetRuntimeConfigForTests } from '../src/runtime-config.js';
import {
  MODELS,
  mergeCloudModels,
  setActiveCloudCatalogAccounts,
} from '../src/models.js';

const CASCADE_FREE_KEY = 'gemini-2.5-flash';
const CASCADE_ONLY_KEY = 'claude-4-sonnet';
const ACCOUNT_ID = 'catalog-backend-boundary';
const ORIGINAL_ALLOW_NO_AUTH = process.env.DASHBOARD_ALLOW_NO_AUTH;
const ORIGINAL_DEVIN_CONNECT = process.env.DEVIN_CONNECT;
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

function syncCascadeOnlyCatalog() {
  setActiveCloudCatalogAccounts([ACCOUNT_ID]);
  const configs = [{ modelUid: MODELS[CASCADE_ONLY_KEY].modelUid }];
  // These direct calls represent separate production sync rounds: the first
  // quarantines a small snapshot and the second confirms it after a delay.
  mergeCloudModels(configs, { accountId: ACCOUNT_ID });
  mergeCloudModels(configs, { accountId: ACCOUNT_ID });
}

beforeEach(() => {
  _resetRuntimeConfigForTests();
  __resetModelCatalogState();
  __setModelCatalogDeps(null);
  delete process.env.DEVIN_CONNECT;
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
  _resetRuntimeConfigForTests();
  if (ORIGINAL_DEVIN_CONNECT === undefined) delete process.env.DEVIN_CONNECT;
  else process.env.DEVIN_CONNECT = ORIGINAL_DEVIN_CONNECT;
  if (ORIGINAL_ALLOW_NO_AUTH === undefined) delete process.env.DASHBOARD_ALLOW_NO_AUTH;
  else process.env.DASHBOARD_ALLOW_NO_AUTH = ORIGINAL_ALLOW_NO_AUTH;
  config.dashboardPassword = ORIGINAL_DASHBOARD_PASSWORD;
  config.apiKey = ORIGINAL_API_KEY;
  configureBindHost('0.0.0.0');
});

describe('Cascade cloud catalog backend boundary', () => {
  it('does not narrow DEVIN_CONNECT model listings', () => {
    const connectEnv = { DEVIN_CONNECT: '1' };
    const baseline = handleModels(connectEnv).data.map((model) => model.id);

    syncCascadeOnlyCatalog();

    assert.deepEqual(
      handleModels(connectEnv).data.map((model) => model.id),
      baseline,
      'a Cascade-only allowlist must not empty or narrow the Connect model view',
    );
  });

  it('does not narrow Dashboard model views in DEVIN_CONNECT mode', async () => {
    process.env.DEVIN_CONNECT = '1';

    const baselineModelsRes = fakeRes();
    await handleDashboardApi('GET', '/models', {}, localReq('/models'), baselineModelsRes);
    const baselineTierRes = fakeRes();
    await handleDashboardApi('GET', '/tier-access', {}, localReq('/tier-access'), baselineTierRes);

    syncCascadeOnlyCatalog();

    const modelsRes = fakeRes();
    await handleDashboardApi('GET', '/models', {}, localReq('/models'), modelsRes);
    assert.deepEqual(
      modelsRes.json().models.map((model) => model.id),
      baselineModelsRes.json().models.map((model) => model.id),
    );

    const tierRes = fakeRes();
    await handleDashboardApi('GET', '/tier-access', {}, localReq('/tier-access'), tierRes);
    assert.deepEqual(tierRes.json().allModels, baselineTierRes.json().allModels);
  });

  it('does not delay the independent Connect catalog behind Cascade confirmation', async () => {
    const runId = Date.now().toString(36);
    const apiKey = `catalog-connect-independent-${runId}`;
    let cascadeRequests = 0;
    let connectRequests = 0;
    let connectRows = null;
    let scheduledRetry;
    __setModelCatalogDeps({
      scheduleCatalogRetry: (retry) => {
        scheduledRetry = retry;
        return () => {};
      },
      getCascadeModelConfigs: async () => {
        cascadeRequests += 1;
        return { configs: [{ modelUid: MODELS[CASCADE_ONLY_KEY].modelUid }] };
      },
      fetchConnectCatalog: async ({ token }) => {
        connectRequests += 1;
        assert.equal(token, apiKey);
        return [{ selector: 'swe-1-6-slow', provider: 'windsurf' }];
      },
      setLiveCatalogSelectors: (rows) => {
        connectRows = rows;
      },
    });

    const account = addAccountByKey(apiKey, 'catalog-connect-independent');
    createdAccountIds.push(account.id);
    await __waitForModelCatalogSync();

    assert.equal(cascadeRequests, 1);
    assert.equal(typeof scheduledRetry, 'function');
    assert.equal(connectRequests, 1);
    assert.deepEqual(connectRows, [{ selector: 'swe-1-6-slow', provider: 'windsurf' }]);
  });

  it('does not expose the Cascade drought fail-open warning in DEVIN_CONNECT mode', async () => {
    process.env.DEVIN_CONNECT = '1';
    const runId = Date.now().toString(36);
    const apiKey = `catalog-connect-drought-${runId}`;
    let scheduledRetry;
    __setModelCatalogDeps({
      disableConnectSync: true,
      scheduleCatalogRetry: (retry) => {
        scheduledRetry = retry;
        return () => {};
      },
      getCascadeModelConfigs: async () => ({
        configs: [{ modelUid: MODELS[CASCADE_ONLY_KEY].modelUid }],
      }),
    });

    const account = addAccountByKey(apiKey, 'catalog-connect-drought');
    createdAccountIds.push(account.id);
    account.credits = { weeklyPercent: 0, dailyPercent: 0 };
    await __waitForModelCatalogSync();
    scheduledRetry();
    await __waitForModelCatalogSync();

    const summary = getDroughtSummary();
    assert.equal(summary.drought, true);
    assert.equal(summary.restrictionFailOpen, false);
    assert.ok(summary.freeTierModels.includes(CASCADE_FREE_KEY));
  });
});
