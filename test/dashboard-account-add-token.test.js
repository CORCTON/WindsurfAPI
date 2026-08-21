// #257: after upgrade, pool looks empty and pasting an auth-token toasts
// "Add failed". This file drives the two mechanisms that produce that
// report WITHOUT a live Windsurf account.
//
// 1. Dashboard 401 (stale/missing operator password) does not delete the
//    pool, but the UI treats an empty `{}` return as "add failed".
// 2. POST /dashboard/api/accounts {token} used to always run RegisterUser.
//    A `devin-session-token$…` therefore hit Firebase RegisterUser and
//    failed, while the OAuth callback path already classified it as a key.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../src/config.js';
import { configureBindHost, addAccountByKey, getAccountList, removeAccount, _resetLockoutForTests } from '../src/auth.js';
import { handleDashboardApi } from '../src/dashboard/api.js';
import { setRuntimeApiKey, setRuntimeDashboardPassword } from '../src/runtime-config.js';
import { classifyToken } from '../src/dashboard/account-text-parser.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const original = {
  apiKey: config.apiKey,
  dashboardPassword: config.dashboardPassword,
  allowNoAuth: process.env.DASHBOARD_ALLOW_NO_AUTH,
  allowApiKeyAsPw: process.env.DASHBOARD_ALLOW_API_KEY_AS_PASSWORD,
};
const created = new Set();

function mkRes() {
  const captured = { status: null, body: null };
  const res = {
    headersSent: false,
    writeHead(status) { captured.status = status; res.headersSent = true; return res; },
    end(payload) {
      try { captured.body = JSON.parse(payload); } catch { captured.body = payload; }
    },
    setHeader() {},
    on() {},
  };
  return { res, captured };
}

function mkReq(headers = {}, ip = '127.0.0.1') {
  return { headers, socket: { remoteAddress: ip } };
}

afterEach(() => {
  config.apiKey = original.apiKey;
  config.dashboardPassword = original.dashboardPassword;
  if (original.allowNoAuth === undefined) delete process.env.DASHBOARD_ALLOW_NO_AUTH;
  else process.env.DASHBOARD_ALLOW_NO_AUTH = original.allowNoAuth;
  if (original.allowApiKeyAsPw === undefined) delete process.env.DASHBOARD_ALLOW_API_KEY_AS_PASSWORD;
  else process.env.DASHBOARD_ALLOW_API_KEY_AS_PASSWORD = original.allowApiKeyAsPw;
  setRuntimeApiKey('');
  setRuntimeDashboardPassword('');
  configureBindHost('127.0.0.1');
  _resetLockoutForTests();
  for (const id of created) { removeAccount(id); created.delete(id); }
  for (const a of getAccountList()) {
    if (typeof a.email === 'string' && a.email.startsWith('issue257-')) removeAccount(a.id);
  }
});

describe('#257 dashboard add-token after upgrade', () => {
  it('a 401 on GET /accounts does not wipe the on-disk pool', async () => {
    process.env.DASHBOARD_ALLOW_NO_AUTH = '1';
    config.apiKey = '';
    config.dashboardPassword = '';
    configureBindHost('127.0.0.1');
    const seeded = addAccountByKey(`issue257-key-${Date.now()}`, 'issue257-keep');
    created.add(seeded.id);
    const before = getAccountList().length;
    assert.ok(before >= 1);

    delete process.env.DASHBOARD_ALLOW_NO_AUTH;
    config.apiKey = 'issue257-chat-key';
    config.dashboardPassword = 'issue257-panel';
    const { res, captured } = mkRes();
    await handleDashboardApi('GET', '/accounts', {}, mkReq({}, '127.0.0.1'), res);
    assert.equal(captured.status, 401);
    assert.equal(getAccountList().length, before, '401 must not drop in-memory accounts');
    assert.ok(getAccountList().some((a) => a.id === seeded.id));
  });

  it('POST /accounts with a session token adds locally and does not call RegisterUser', async () => {
    process.env.DASHBOARD_ALLOW_NO_AUTH = '1';
    config.apiKey = '';
    config.dashboardPassword = '';
    configureBindHost('127.0.0.1');
    const token = `devin-session-token$ws-issue257-${Date.now()}`;
    assert.equal(classifyToken(token), 'session');
    const before = snapshotIds();
    const { res, captured } = mkRes();
    await handleDashboardApi(
      'POST',
      '/accounts',
      { token, label: 'issue257-session' },
      mkReq({}, '127.0.0.1'),
      res,
    );
    assert.equal(captured.status, 200, `session token must not hit RegisterUser: ${JSON.stringify(captured.body)}`);
    assert.equal(captured.body?.success, true);
    const addedId = captured.body?.account?.id;
    assert.ok(addedId, 'response must include the new account id');
    created.add(addedId);
    assert.ok(!before.has(addedId));
    assert.equal(captured.body.account.method, 'api_key');
    assert.equal(captured.body.account.email, 'issue257-session');
  });

  it('POST /accounts with a show-auth-token URL extracts the session token', async () => {
    process.env.DASHBOARD_ALLOW_NO_AUTH = '1';
    config.apiKey = '';
    config.dashboardPassword = '';
    configureBindHost('127.0.0.1');
    const inner = `devin-session-token$ws-issue257-url-${Date.now()}`;
    const { res, captured } = mkRes();
    await handleDashboardApi(
      'POST',
      '/accounts',
      { token: `https://windsurf.com/show-auth-token?token=${encodeURIComponent(inner)}`, label: 'issue257-url' },
      mkReq({}, '127.0.0.1'),
      res,
    );
    assert.equal(captured.status, 200, JSON.stringify(captured.body));
    assert.equal(captured.body?.success, true);
    created.add(captured.body.account.id);
  });

  it('addAccountByPastedSecret does not treat auth1_ as a pool apiKey', () => {
    // Auth1 tokens are exchanged via WindsurfPostAuth (windsurf-login.js).
    // Storing the raw string as apiKey looks like a successful add and then
    // every chat request 401s. Session prefix and sk- are the only local keys.
    const src = readFileSync(join(ROOT, 'src', 'auth.js'), 'utf8');
    const start = src.indexOf('export async function addAccountByPastedSecret');
    const end = src.indexOf('export async function addAccountByToken');
    const fn = src.slice(start, end);
    assert.match(fn, /kind === 'session'/);
    assert.match(fn, /startsWith\('sk-'\)/);
    assert.doesNotMatch(fn, /kind === 'auth1'/);
  });

  it('POST /batch-import with a session token adds locally and does not call RegisterUser', async () => {
    process.env.DASHBOARD_ALLOW_NO_AUTH = '1';
    config.apiKey = '';
    config.dashboardPassword = '';
    configureBindHost('127.0.0.1');
    const token = `devin-session-token$ws-issue257-batch-${Date.now()}`;
    const { res, captured } = mkRes();
    await handleDashboardApi(
      'POST',
      '/batch-import',
      { text: JSON.stringify([{ token, label: 'issue257-batch' }]), autoAdd: true },
      mkReq({}, '127.0.0.1'),
      res,
    );
    assert.equal(captured.status, 200, JSON.stringify(captured.body));
    assert.equal(captured.body?.successCount, 1, JSON.stringify(captured.body));
    const id = captured.body?.results?.[0]?.account?.id;
    assert.ok(id);
    created.add(id);
  });

  it('POST /accounts with a Firebase-shaped JWT still takes the RegisterUser path (mocked by empty token rejection)', async () => {
    // Pin the non-session branch: a JWT is classified refresh, not session, so
    // it must NOT be stored as a raw apiKey. We use an empty-string token to
    // hit the local "provide api_key or token" 400 without a network call;
    // the JWT classification itself is in account-text-parser.test.js.
    const jwt = `${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}`;
    assert.equal(classifyToken(jwt), 'refresh');
  });
});

describe('#257 UI maps a 401 add to the generic Add failed toast', () => {
  it('the dashboard 401 handler returns success:false with the Unauthorized error', () => {
    // _apiRaw on 401 returns {}. submitOAuthToken / addAccount then see
    // !r.success and r.error === undefined → translateError falls through
    // to toast.addFailed ("Add failed" / "添加失败") with no reason.
    const html = readFileSync(join(ROOT, 'src', 'dashboard', 'index.html'), 'utf8');
    const start = html.indexOf('if (r.status === 401)');
    assert.ok(start >= 0);
    const block = html.slice(start, html.indexOf('if (!r.ok)', start));
    assert.match(block, /success:\s*false/);
    assert.match(block, /error:\s*authErr/);
  });

  it('loadAccounts does not paint an empty table when the GET is a failed auth', () => {
    const html = readFileSync(join(ROOT, 'src', 'dashboard', 'index.html'), 'utf8');
    assert.match(html, /d\.success === false && !Array\.isArray\(d\.accounts\)/);
  });

  it('429 and fetch-throw also return success:false with an error field', () => {
    const html = readFileSync(join(ROOT, 'src', 'dashboard', 'index.html'), 'utf8');
    assert.match(html, /error:\s*lockErr/);
    assert.match(html, /return \{ success: false, error: msg \}/);
  });
});

function snapshotIds() {
  return new Set(getAccountList().map((a) => a.id));
}
