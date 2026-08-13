import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { configureBindHost } from '../src/auth.js';
import { setRuntimeApiKey, setRuntimeDashboardPassword } from '../src/runtime-config.js';
import { handleDashboardApi, setGitExecFileForTest } from '../src/dashboard/api.js';

// ---------------------------------------------------------------------------
// Version gate (tag) + rollback endpoint for OTA self-update.
//
// Gate semantics:
//   - target (origin/<branch>) must be a descendant of (or equal to) the
//     latest release tag, else ERR_UNRELEASED and NO pull is executed.
//   - target behind current HEAD => ERR_DOWNGRADE.
//   - rollback POST resets to the persisted before-commit (requires a prior
//     /self-update that wrote data/self-update-before.json).
// ---------------------------------------------------------------------------

const BEFORE_JSON = join(process.cwd(), 'data', 'self-update-before.json');
const prevNoAuth = process.env.DASHBOARD_ALLOW_NO_AUTH;
const origPwd = config.dashboardPassword;
const origKey = config.apiKey;

function openAuth() {
  config.dashboardPassword = '';
  config.apiKey = '';
  setRuntimeApiKey('');
  setRuntimeDashboardPassword('');
  process.env.DASHBOARD_ALLOW_NO_AUTH = '1';
  configureBindHost('127.0.0.1');
}

afterEach(() => {
  gitCalls.length = 0;
  setGitExecFileForTest(null);
  try { rmSync(BEFORE_JSON, { force: true }); } catch {}
  config.dashboardPassword = origPwd;
  config.apiKey = origKey;
  setRuntimeApiKey('');
  setRuntimeDashboardPassword('');
  configureBindHost('0.0.0.0');
  delete process.env.WINDSURFAPI_RESTART_SUPERVISED;
  if (prevNoAuth === undefined) delete process.env.DASHBOARD_ALLOW_NO_AUTH;
  else process.env.DASHBOARD_ALLOW_NO_AUTH = prevNoAuth;
});

function fakeRes() {
  return {
    statusCode: 0,
    body: '',
    writeHead(s) { this.statusCode = s; },
    end(c) { this.body += c ? String(c) : ''; },
    json() { return this.body ? JSON.parse(this.body) : null; },
  };
}

const gitCalls = [];
function gitStub(map) {
  setGitExecFileForTest((bin, args, opts, cb) => {
    const key = args.join(' ');
    gitCalls.push(key);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      const v = typeof map[key] === 'function' ? map[key]() : map[key];
      cb(null, String(v) + '\n', '');
    } else {
      const err = new Error('unexpected git: ' + key);
      err.code = 'STUB_MISS';
      cb(err, '', '');
    }
  });
}

const HEAD = 'a'.repeat(40);
const REMOTE = 'b'.repeat(40);
const TAG = 'c'.repeat(40);

function updateScript(extra) {
  const m = {
    'rev-parse HEAD': HEAD,
    'rev-parse --abbrev-ref HEAD': 'master',
    'fetch --quiet origin': '',
    'rev-parse origin/master': REMOTE,
    'log -1 --pretty=format:%s': 'local msg',
    'status --porcelain -uno': '',
    'tag --list --sort=-v:refname --merged origin/master': 'v3.9.21',
  };
  return Object.assign(m, extra || {});
}

function postUpdate(req) {
  const res = fakeRes();
  return handleDashboardApi('POST', '/self-update', req, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res)
    .then(() => res.json());
}

describe('self-update version gate (tag)', () => {
  it('refuses pull when remote has unreleased commits (ERR_UNRELEASED)', async () => {
    openAuth();
    let pullRan = false;
    gitStub(updateScript({
      ['rev-list --count v3.9.21..' + REMOTE]: '3',
      'pull origin master --ff-only': () => { pullRan = true; return ''; },
    }));
    const r = await postUpdate({});
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.error, 'ERR_UNRELEASED');
    assert.equal(r.latestTag, 'v3.9.21');
    assert.equal(r.unreleased, 3);
    assert.equal(pullRan, false, 'pull must NOT run when the gate refuses');
  });

  it('allows pull when remote IS the latest tag (published)', async () => {
    openAuth();
    gitStub(updateScript({
      'rev-parse origin/master': TAG,
      ['rev-list --count v3.9.21..' + TAG]: '0',
      ['rev-list --count v3.9.21..' + HEAD]: '0',
      'pull origin master --ff-only': 'Fast-forward',
      'log -1 --pretty=format:%s bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': 'remote msg',
    }));
    const r = await postUpdate({});
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  it('refuses downgrade when target is behind HEAD', async () => {
    openAuth();
    const stub = updateScript({
      'rev-parse origin/master': TAG,
      ['rev-list --count v3.9.21..' + TAG]: '0',
      ['rev-list --count ' + TAG + '..HEAD']: '2',
    });
    gitStub(stub);
    const r = await postUpdate({});
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.error, 'ERR_DOWNGRADE');
  });

  it('forceUpdate bypasses the tag gate', async () => {
    openAuth();
    gitStub(updateScript({
      ['rev-list --count v3.9.21..' + REMOTE]: '2',
      'pull origin master --ff-only': 'Fast-forward',
    }));
    const r = await postUpdate({ forceUpdate: true });
    assert.equal(r.ok, true, JSON.stringify(r));
  });
});

describe('gitStatus published field', () => {
  it('reports published=false with unreleasedCount when tag is behind remote', async () => {
    openAuth();
    gitStub(updateScript({
      ['rev-list --count v3.9.21..' + REMOTE]: '5',
    }));
    const res = fakeRes();
    await handleDashboardApi('GET', '/self-update/check', {}, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.published, false);
    assert.equal(body.unreleasedCount, 5);
    assert.equal(body.latestTag, 'v3.9.21');
  });
});

describe('self-update rollback', () => {
  it('rolls back to the persisted before-commit', async () => {
    openAuth();
    const prevSup = process.env.WINDSURFAPI_RESTART_SUPERVISED;
    process.env.WINDSURFAPI_RESTART_SUPERVISED = '1';
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    writeFileSync(BEFORE_JSON, JSON.stringify({ commit: 'f'.repeat(40), ts: Date.now() }));
    let resetTarget = '';
    gitStub({
      'status --porcelain -uno': '',
      [`reset --hard ${'f'.repeat(40)}`]: () => { resetTarget = 'f'.repeat(40); return ''; },
    });
    const res = fakeRes();
    await handleDashboardApi('POST', '/self-update/rollback', {}, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
    const body = res.json();
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(body.rolledBackTo, 'f'.repeat(7));
    assert.equal(resetTarget, 'f'.repeat(40), 'reset must target the recorded commit');
    assert.equal(existsSync(BEFORE_JSON), false, 'rollback point must be cleared after rollback');
  });

  it('returns ERR_NO_ROLLBACK_POINT when no prior update recorded', async () => {
    openAuth();
    try { rmSync(BEFORE_JSON, { force: true }); } catch {}
    gitStub({});
    const res = fakeRes();
    await handleDashboardApi('POST', '/self-update/rollback', {}, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
    const body = res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'ERR_NO_ROLLBACK_POINT');
  });

  it('refuses rollback on a dirty tree without forceReset (AUTH-1 parity)', async () => {
    openAuth();
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    writeFileSync(BEFORE_JSON, JSON.stringify({ commit: 'f'.repeat(40), ts: Date.now() }));
    gitStub({ 'status --porcelain -uno': ' M src/index.js' });
    const res = fakeRes();
    await handleDashboardApi('POST', '/self-update/rollback', {}, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
    const body = res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'ERR_UNCOMMITTED_CHANGES');
  });
});
