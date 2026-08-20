// Docker self-update endpoint behavior.
//
// User report (2026-04-29): "为什么docker不支持更新 支持呗。。。" — i.e.,
// the dashboard's existing self-update path bails on docker
// deployments with a hint to run `docker compose pull && up -d`
// manually. v2.0.41 wires an opt-in path that uses /var/run/docker.sock
// + a one-shot deployer sidecar to recreate the container in-place.
//
// Unit tests must never exercise the host Docker daemon. Detection and
// container-id reads use injected filesystem/request seams; deployment shape
// and api.js wiring remain source-validated below.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  detectDockerSelfUpdate,
  dockerPull,
  isSafeComposeConfigFile,
  isSafeComposeWorkingDir,
  readSelfContainerId,
  runDockerSelfUpdate,
} from '../src/dashboard/docker-self-update.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOD = readFileSync(join(__dirname, '..', 'src/dashboard/docker-self-update.js'), 'utf8');
const API = readFileSync(join(__dirname, '..', 'src/dashboard/api.js'), 'utf8');
const TERMINAL_PULL_SUCCESS = '{"status":"Downloaded newer image for windsurf-api:test"}\n';

function fakeDockerPullTransport({ statusCode = 200, chunks = [], responseEvents = [], events = null, state = {} } = {}, calls = []) {
  return (options, onResponse) => {
    calls.push(options);
    const req = new EventEmitter();
    req.destroy = (error) => {
      if (error) req.emit('error', error);
    };
    req.end = () => {
      queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = statusCode;
        res.destroy = () => { state.destroyCalls = (state.destroyCalls || 0) + 1; };
        // Keep sabotage cases deterministic even if a mutant removes the
        // collector's error listener; the assertion then observes a false
        // success instead of hanging or crashing the test process.
        res.on('error', () => {});
        onResponse(res);
        const script = events || [
          ...chunks.map(chunk => ['data', chunk]),
          ...responseEvents.filter(event => event !== 'skip-end').map(event => [event]),
          ...(responseEvents.includes('skip-end') ? [] : [['end']]),
        ];
        for (const [event, payload] of script) {
          if (event === 'data') res.emit('data', Buffer.isBuffer(payload) ? payload : Buffer.from(payload));
          else if (event === 'error') res.emit('error', payload instanceof Error ? payload : new Error('peer reset'));
          else res.emit(event);
        }
      });
    };
    return req;
  };
}

describe('docker self-update detection', () => {
  test('reports no-docker-sock from a fake filesystem without probing the host socket', async () => {
    let requestCalls = 0;
    const r = await detectDockerSelfUpdate({
      exists(path) {
        assert.equal(path, '/var/run/docker.sock');
        return false;
      },
      readSelfId() {
        throw new Error('sentinel: container-id reader must not run without a socket');
      },
      request() {
        requestCalls += 1;
        throw new Error('sentinel: real Docker request must never run in unit tests');
      },
    });
    assert.equal(r.available, false);
    assert.equal(r.reason, 'no-docker-sock');
    assert.equal(requestCalls, 0);
  });

  test('reports no-self-id from fake readers without touching /etc/hostname or cgroups', async () => {
    let requestCalls = 0;
    const r = await detectDockerSelfUpdate({
      exists: () => true,
      readSelfId: () => null,
      request() {
        requestCalls += 1;
        throw new Error('sentinel: Docker request must not run without a container id');
      },
    });
    assert.equal(r.available, false);
    assert.equal(r.reason, 'no-self-id');
    assert.equal(requestCalls, 0);
  });

  test('uses only injected request data for a reachable compose container', async () => {
    const calls = [];
    const r = await detectDockerSelfUpdate({
      exists: path => path === '/var/run/docker.sock',
      readSelfId: () => 'a'.repeat(64),
      request: async (method, path) => {
        calls.push([method, path]);
        assert.equal(method, 'GET');
        assert.equal(path, `/containers/${'a'.repeat(64)}/json`);
        return {
          status: 200,
          body: {
            Config: {
              Image: 'windsurf-api:test',
              Labels: {
                'com.docker.compose.project': 'windsurf',
                'com.docker.compose.project.working_dir': '/srv/windsurf',
                'com.docker.compose.project.config_files': '/srv/windsurf/docker-compose.yml',
              },
            },
            Id: 'a'.repeat(64),
          },
        };
      },
    });
    assert.deepEqual(calls, [['GET', `/containers/${'a'.repeat(64)}/json`]]);
    assert.deepEqual(r, {
      available: true,
      selfId: 'a'.repeat(64),
      image: 'windsurf-api:test',
      project: 'windsurf',
      workingDir: '/srv/windsurf',
      configFiles: ['/srv/windsurf/docker-compose.yml'],
    });
  });

  test('converts an injected request failure into a structured unavailable result', async () => {
    let requestCalls = 0;
    const r = await detectDockerSelfUpdate({
      exists: () => true,
      readSelfId: () => 'b'.repeat(64),
      request: async () => {
        requestCalls += 1;
        throw new Error('sentinel daemon failure');
      },
    });
    assert.equal(requestCalls, 1);
    assert.equal(r.available, false);
    assert.equal(r.reason, 'docker-api-unreachable');
    assert.equal(r.detail, 'sentinel daemon failure');
  });

  test('readSelfContainerId trusts only the supplied Docker cgroup path', () => {
    const reads = [];
    const id = readSelfContainerId({
      readFile(path) {
        reads.push(path);
        if (path === '/proc/self/cgroup') return `0::/docker/${'c'.repeat(64)}\n`;
        throw new Error(`sentinel: untrusted identity source read: ${path}`);
      },
    });
    assert.equal(id, 'c'.repeat(64));
    assert.deepEqual(reads, ['/proc/self/cgroup']);
  });

  test('readSelfContainerId accepts the systemd Docker cgroup form', () => {
    const reads = [];
    const id = readSelfContainerId({
      readFile(path) {
        reads.push(path);
        if (path === '/proc/self/cgroup') return `0::/system.slice/docker-${'d'.repeat(64)}.scope\n`;
        throw new Error(`unexpected read: ${path}`);
      },
    });
    assert.equal(id, 'd'.repeat(64));
    assert.deepEqual(reads, ['/proc/self/cgroup']);
  });

  test('readSelfContainerId strictly anchors full Docker cgroup forms and never trusts hostname', () => {
    const fullId = 'e'.repeat(64);
    for (const cgroup of [
      `0::/user.slice/${fullId}\n`,
      `0::/user.slice/prefixdocker-${fullId}.scope\n`,
      `0::/docker/${fullId.slice(0, 12)}\n`,
      `0::/docker/${fullId}/child\n`,
      `0::/docker/${fullId}0\n`,
    ]) {
      const reads = [];
      const id = readSelfContainerId({
        readFile(path) {
          reads.push(path);
          if (path === '/proc/self/cgroup') return cgroup;
          if (path === '/etc/hostname') return 'a'.repeat(12);
          throw new Error(`unexpected read: ${path}`);
        },
      });
      assert.equal(id, null, cgroup);
      assert.deepEqual(reads, ['/proc/self/cgroup'],
        'operator-controlled /etc/hostname must never be an identity source');
    }
  });

  test('private cgroup-v2 identity requires corroborating Docker runtime mounts', () => {
    const fullId = 'f'.repeat(64);
    const otherId = '1'.repeat(64);
    const mountLine = (id, file, target = file) =>
      `31 23 8:1 /docker/containers/${id}/${file} /etc/${target} rw,relatime - ext4 /dev/sda1 rw\n`;
    const read = mountInfo => readSelfContainerId({
      readFile(path) {
        if (path === '/proc/self/cgroup') return '0::/\n';
        if (path === '/proc/self/mountinfo') return mountInfo;
        throw new Error(`untrusted identity source read: ${path}`);
      },
    });

    assert.equal(read(
      mountLine(fullId, 'hostname') + mountLine(fullId, 'hosts') + mountLine(fullId, 'resolv.conf'),
    ), fullId);
    assert.equal(read(mountLine(fullId, 'hostname')), null, 'one mount is not corroboration');
    assert.equal(read(
      mountLine(fullId, 'hostname') + mountLine(otherId, 'hosts'),
    ), null, 'runtime mounts that disagree must fail closed');
    assert.equal(read(
      mountLine(fullId, 'hostname') + mountLine(otherId, 'hostname') + mountLine(otherId, 'hosts'),
    ), null, 'stacked conflicting evidence for one target must not be overwritten');
    assert.equal(read(
      mountLine(fullId, 'hostname', 'hosts') + mountLine(fullId, 'resolv.conf'),
    ), null, 'the Docker source file must correspond to its mounted /etc target');
  });

  test('detection rejects a Docker inspect object that does not exactly match runtime identity', async () => {
    const r = await detectDockerSelfUpdate({
      exists: () => true,
      readSelfId: () => 'a'.repeat(64),
      request: async () => ({ body: { Id: 'b'.repeat(64) } }),
    });
    assert.equal(r.available, false);
    assert.equal(r.reason, 'self-id-mismatch');
  });

  test('detection fails closed when Compose config_files cannot be replayed exactly', async () => {
    const selfId = 'a'.repeat(64);
    for (const [configFiles, expectedReason] of [
      [undefined, 'no-compose-config-files'],
      ['/srv/windsurf/docker-compose.yml,/etc/override.yml', 'unsafe-compose-config-files'],
      ['/srv/windsurf/../override.yml', 'unsafe-compose-config-files'],
      ['/srv/windsurf/compose.yml,/srv/windsurf/compose.yml', 'unsafe-compose-config-files'],
    ]) {
      const labels = {
        'com.docker.compose.project': 'windsurf',
        'com.docker.compose.project.working_dir': '/srv/windsurf',
      };
      if (configFiles !== undefined) labels['com.docker.compose.project.config_files'] = configFiles;
      const r = await detectDockerSelfUpdate({
        exists: () => true,
        readSelfId: () => selfId,
        request: async () => ({
          body: { Id: selfId, Config: { Image: 'windsurf-api:test', Labels: labels } },
        }),
      });
      assert.equal(r.available, false);
      assert.equal(r.reason, expectedReason, configFiles);
    }
  });

  test('rejects traversal and bind-delimiter compose working directories', () => {
    assert.equal(isSafeComposeWorkingDir('/srv/windsurf'), true);
    assert.equal(isSafeComposeWorkingDir('/srv/../etc'), false);
    assert.equal(isSafeComposeWorkingDir('/srv/project:ro'), false);
    assert.equal(isSafeComposeConfigFile('/srv/windsurf/compose.yml', '/srv/windsurf'), true);
    assert.equal(isSafeComposeConfigFile('/srv/windsurf-prod/compose.yml', '/srv/windsurf'), false);
    assert.equal(isSafeComposeConfigFile('/srv/windsurf/../compose.yml', '/srv/windsurf'), false);
  });
});

describe('docker self-update module shape', () => {
  test('uses /var/run/docker.sock unix socket, not a TCP daemon URL', () => {
    assert.match(MOD, /'\/var\/run\/docker\.sock'/,
      'must hardcode /var/run/docker.sock as the daemon socket');
    assert.match(MOD, /socketPath:/,
      'must use http.request with socketPath option (no docker CLI dependency)');
  });

  test('spawns a deployer sidecar that runs docker compose up -d', () => {
    assert.match(MOD, /docker compose -p/,
      'sidecar command must use docker compose -p with the project name');
    assert.match(MOD, /up -d/,
      'sidecar must run `up -d` to recreate the container with the pulled image');
    assert.match(MOD, /AutoRemove: true/,
      'sidecar must auto-remove after exit so we do not leak deployer containers');
  });

  test('the sidecar sleeps before tearing us down', () => {
    // If the sidecar's compose-up runs immediately, the dashboard's
    // HTTP response gets killed before reaching the browser, leaving
    // a confusing "request failed" toast. The sleep buys time.
    assert.match(MOD, /DEPLOYER_DELAY_SECONDS/,
      'must define a delay constant');
    assert.match(MOD, /'set -e; sleep ' \+ DEPLOYER_DELAY_SECONDS/,
      'sidecar Cmd must sleep for DEPLOYER_DELAY_SECONDS before pulling/recreating');
  });

  test('audit #11: dockerPull scans the JSONL stream for errors, not just HTTP status', () => {
    // /images/create streams JSONL and returns HTTP 200 even when the pull
    // fails (unknown tag / registry error) — the failure is an {"error":...}
    // line in the body. Treating 200 as success left the deployer on the OLD
    // image. The end handler must inspect the streamed lines for error/errorDetail.
    const pull = MOD.slice(MOD.indexOf('function dockerPull'));
    assert.match(pull, /errorDetail/, 'dockerPull must check for errorDetail in the JSONL stream');
    assert.match(pull, /obj\.error/, 'dockerPull must check for an error field per streamed line');
    assert.match(pull, /split\('\\n'\)/, 'dockerPull must scan the stream line by line');
    // and an error line must lead to reject() (before the final resolve): the
    // error-field check and a reject() call appear, in that order, ahead of the
    // success resolve(buf).
    const errIdx = pull.indexOf("Object.prototype.hasOwnProperty.call(obj, 'error')");
    const rejIdx = pull.indexOf('reject(new Error(`docker pull ${image} failed');
    const terminalIdx = pull.indexOf('if (!lastRecordCompleted)');
    const resIdx = pull.indexOf('resolve(buf)');
    assert.ok(errIdx >= 0 && rejIdx > errIdx, 'error-field check must be followed by a reject()');
    assert.ok(terminalIdx > rejIdx, 'a clean EOF must still require terminal pull-success evidence');
    assert.ok(resIdx > terminalIdx, 'the success resolve(buf) must come after every failure guard');
  });

  test('transport collectors fail closed on response lifecycle faults and cap body size', () => {
    assert.match(MOD, /function collectDockerResponse\(res, \{ maxBytes, label \}\)/);
    assert.match(MOD, /res\.once\('error'/);
    assert.match(MOD, /res\.once\('aborted'/);
    assert.match(MOD, /res\.once\('close'/);
    assert.match(MOD, /bytes > maxBytes/);
    assert.match(MOD, /DOCKER_API_BODY_LIMIT/);
    assert.match(MOD, /DOCKER_PULL_BODY_LIMIT/);
  });

  test('shell-quotes the project name and working dir', () => {
    // Both come from compose container labels which we don't fully
    // control — defensive single-quote-wrap so a malformed label
    // can't break out of the `sh -c "..."` payload.
    assert.match(MOD, /shellQuote\(/);
    assert.match(MOD, /function shellQuote/);
    assert.match(MOD, /com\.docker\.compose\.project\.config_files/);
    assert.match(MOD, /configFiles\.map\(file => '-f ' \+ shellQuote\(file\)\)/,
      'must replay every validated Compose config file in label order');
  });

  test('aborts when running container has no compose labels', () => {
    // Hand-managed `docker run` containers can't be safely recreated
    // by `docker compose up -d`; we'd lose env / mounts / network.
    // Bail with a clear reason instead.
    assert.match(MOD, /no-compose-labels/,
      'must report no-compose-labels reason when container was not started by compose');
  });
});

describe('docker image pull transport', () => {
  test('drains a successful HTTP-200 JSONL response through the injected unix-socket transport', async () => {
    const calls = [];
    const body = '{"status":"Pulling"}\n{"status":"Downloaded newer image for ghcr.io/dwgx/windsurf-api:test"}\n';
    const result = await dockerPull('ghcr.io/dwgx/windsurf-api:test', {
      request: fakeDockerPullTransport({
        chunks: [body.slice(0, 17), body.slice(17)],
      }, calls),
    });

    assert.equal(result, body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].socketPath, '/var/run/docker.sock');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path,
      '/images/create?fromImage=ghcr.io%2Fdwgx%2Fwindsurf-api%3Atest');

    const auxBody = `{"status":"Pulling"}\n{"aux":{"Digest":"sha256:${'a'.repeat(64)}"}}\n`;
    assert.equal(await dockerPull('windsurf-api:aux', {
      request: fakeDockerPullTransport({ statusCode: 200, chunks: [auxBody] }),
    }), auxBody, 'an explicit terminal content digest is also valid completion evidence');
  });

  test('rejects Docker HTTP-200 JSONL error and errorDetail records at runtime', async () => {
    const cases = [
      ['{"status":"Pulling"}\n{"error":"registry denied"}\n' + TERMINAL_PULL_SUCCESS, /registry denied/],
      ['{"errorDetail":{"message":"manifest unknown"}}\n' + TERMINAL_PULL_SUCCESS, /manifest unknown/],
      ['{"error":""}\n' + TERMINAL_PULL_SUCCESS, /unknown docker pull error/],
      ['{"errorDetail":null}\n' + TERMINAL_PULL_SUCCESS, /unknown docker pull error/],
    ];

    for (const [body, expected] of cases) {
      await assert.rejects(
        dockerPull('windsurf-api:test', {
          request: fakeDockerPullTransport({ statusCode: 200, chunks: [body] }),
        }),
        expected,
      );
    }
  });

  test('rejects empty, malformed, and progress-only HTTP-200 streams instead of treating EOF as a completed pull', async () => {
    for (const body of ['', '\n']) {
      await assert.rejects(
        dockerPull('windsurf-api:test', {
          request: fakeDockerPullTransport({ statusCode: 200, chunks: [body] }),
        }),
        /empty JSONL/i,
      );
    }
    await assert.rejects(
      dockerPull('windsurf-api:test', {
        request: fakeDockerPullTransport({
          statusCode: 200,
          chunks: ['not-json\n' + TERMINAL_PULL_SUCCESS],
        }),
      }),
      /malformed JSONL/i,
    );
    for (const body of ['null\n' + TERMINAL_PULL_SUCCESS, '[]\n' + TERMINAL_PULL_SUCCESS]) {
      await assert.rejects(
        dockerPull('windsurf-api:test', {
          request: fakeDockerPullTransport({ statusCode: 200, chunks: [body] }),
        }),
        /invalid JSONL/i,
      );
    }
    for (const body of [
      '{"status":"Pulling"}\n',
      '{"status":"Downloaded newer image"}\n{"status":"Pulling fs layer"}\n',
    ]) {
      await assert.rejects(
        dockerPull('windsurf-api:test', {
          request: fakeDockerPullTransport({ statusCode: 200, chunks: [body] }),
        }),
        /terminal success/i,
      );
    }
  });

  test('response faults and the body cap settle fail-closed before a later valid success', async () => {
    for (const [event, expected] of [
      ['error', /peer reset/i],
      ['aborted', /aborted/i],
      ['close', /closed before end/i],
    ]) {
      await assert.rejects(
        dockerPull('windsurf-api:test', {
          request: fakeDockerPullTransport({
            statusCode: 200,
            events: [
              ['data', '{"status":"Pulling"}\n'],
              [event, new Error('peer reset')],
              ['data', TERMINAL_PULL_SUCCESS],
              ['end'],
            ],
          }),
        }),
        expected,
      );
    }

    const state = {};
    await assert.rejects(
      dockerPull('windsurf-api:test', {
        request: fakeDockerPullTransport({
          statusCode: 200,
          state,
          events: [
            ['data', Buffer.alloc((16 * 1024 * 1024) + 1, 0x20)],
            ['data', '\n' + TERMINAL_PULL_SUCCESS],
            ['end'],
          ],
        }),
      }),
      /response body exceeds 16777216 bytes/i,
    );
    assert.equal(state.destroyCalls, 1, 'over-limit response must be torn down exactly once');
  });
});

describe('docker self-update execution seams', () => {
  test('pulls both images, then creates and starts the deployer with the inspected labels', async () => {
    const calls = [];
    const result = await runDockerSelfUpdate({
      detect: async () => ({
        available: true,
        selfId: 'a'.repeat(64),
        image: 'windsurf-api:test',
        project: 'windsurf',
        workingDir: '/srv/windsurf',
        configFiles: [
          '/srv/windsurf/docker-compose.yml',
          '/srv/windsurf/docker-compose.prod.yml',
        ],
      }),
      pull: async (image) => { calls.push(['pull', image]); },
      request: async (method, path, body) => {
        calls.push([method, path, body]);
        if (path === '/containers/create') return { body: { Id: 'b'.repeat(64) } };
        return { body: {} };
      },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(calls.map(([kind, value]) => [kind, value]), [
      ['pull', 'windsurf-api:test'],
      ['pull', 'docker:24-cli'],
      ['POST', '/containers/create'],
      ['POST', `/containers/${'b'.repeat(64)}/start`],
    ]);
    const create = calls.find(([, path]) => path === '/containers/create');
    assert.equal(create[2].Image, 'docker:24-cli');
    assert.match(create[2].Cmd.join(' '), /docker compose -p 'windsurf'/);
    assert.match(create[2].Cmd.join(' '), /--project-directory '\/srv\/windsurf'/);
    assert.match(create[2].Cmd.join(' '),
      /-f '\/srv\/windsurf\/docker-compose\.yml' -f '\/srv\/windsurf\/docker-compose\.prod\.yml' up -d/,
      'validated config_files must be replayed exactly and in label order');
    assert.deepEqual(create[2].HostConfig.Binds, [
      '/var/run/docker.sock:/var/run/docker.sock',
      '/srv/windsurf:/srv/windsurf:ro',
    ]);
  });

  test('fails closed before creating the deployer when either image pull fails', async () => {
    const calls = [];
    const result = await runDockerSelfUpdate({
      detect: async () => ({
        available: true,
        image: 'windsurf-api:test',
        project: 'windsurf',
        workingDir: '/srv/windsurf',
        configFiles: ['/srv/windsurf/docker-compose.yml'],
        selfId: 'a'.repeat(64),
      }),
      pull: async (image) => {
        calls.push(image);
        if (image === 'docker:24-cli') throw new Error('sidecar registry denied');
      },
      request: async () => { throw new Error('create must not run'); },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'deployer-pull-failed');
    assert.deepEqual(calls, ['windsurf-api:test', 'docker:24-cli']);
  });

  test('start failure deletes the created deployer best-effort and preserves the start error', async () => {
    const deployerId = 'b'.repeat(64);
    const calls = [];
    const result = await runDockerSelfUpdate({
      detect: async () => ({
        available: true,
        image: 'windsurf-api:test',
        project: 'windsurf',
        workingDir: '/srv/windsurf',
        configFiles: ['/srv/windsurf/docker-compose.yml'],
        selfId: 'a'.repeat(64),
      }),
      pull: async () => {},
      request: async (method, path) => {
        calls.push([method, path]);
        if (path === '/containers/create') return { body: { Id: deployerId } };
        if (method === 'POST' && path.endsWith('/start')) throw new Error('authoritative start failure');
        if (method === 'DELETE') throw new Error('cleanup also failed');
        throw new Error(`unexpected request: ${method} ${path}`);
      },
    });

    assert.deepEqual(result, {
      ok: false,
      reason: 'deployer-start-failed',
      detail: 'authoritative start failure',
    });
    assert.deepEqual(calls, [
      ['POST', '/containers/create'],
      ['POST', `/containers/${deployerId}/start`],
      ['DELETE', `/containers/${deployerId}?force=1`],
    ]);
  });
});

describe('docker self-update wired into /self-update', () => {
  test('/self-update/check falls back to docker when git is unavailable', () => {
    const m = API.match(/subpath === '\/self-update\/check'[\s\S]+?\n  \}/);
    assert.ok(m);
    const route = m[0];
    assert.match(route, /detectDockerSelfUpdateForRequest\(\)/,
      'must consult docker mode when git mode reports unavailable');
    assert.match(route, /mode: 'docker'/,
      'must label the response so the dashboard can switch UI flows');
  });

  test('/self-update POST falls back to docker when git is unavailable', () => {
    const m = API.match(/subpath === '\/self-update' && method === 'POST'[\s\S]+?\n  \}/);
    assert.ok(m);
    const route = m[0];
    assert.match(route, /runDockerSelfUpdateForRequest\(\)/,
      'POST /self-update must call runDockerSelfUpdate when docker mode is available');
    assert.match(route, /scheduleDockerSelfUpdateMutationRelease\(releaseMutation\)/,
      'successful Docker OTA must hand mutation ownership across the delayed deployer window');
  });
});

// User report (2026-05-01): one-click 「更新并重启」on a host that has
// never pulled `docker:24-cli` failed with the dashboard surfacing
//   ✗ Failed to execute 'querySelector' on 'Document': '[data-i18n=
//     "error.docker API POST /containers/create -> 404: {"message":
//     "No such image: docker:24-cli"} "]' is not a valid selector.
//
// Three compounding bugs:
//
//   1. runDockerSelfUpdate only pulled ctx.image (the windsurf-api
//      image) — never pulled DEPLOYER_IMAGE. Fresh hosts hit
//      `/containers/create -> 404 No such image: docker:24-cli`.
//
//   2. The dashboard's applyUpdate() picked `r.detail || r.reason`
//      when constructing the user message, so the long raw error
//      string ("docker API POST /containers/create -> 404: ...") won
//      over the short stable code ("deployer-create-failed"). The long
//      string then went into translateError -> I18n.t -> querySelector
//      and exploded.
//
//   3. I18n.t's zh-CN fallback path did `document.querySelector(
//      '[data-i18n="${key}"]')` with no escaping, so any key containing
//      `"` / `{` / `:` threw DOMException and broke the resolver.
describe('docker self-update: deployer image pulled (#user 2026-05-01)', () => {
  test('runDockerSelfUpdate pulls DEPLOYER_IMAGE before creating the container', () => {
    // Pin the call ordering — pull(ctx.image) must come first (the new
    // app), then pull(DEPLOYER_IMAGE) (the sidecar runtime), then the
    // POST /containers/create. A future refactor that drops the second
    // pull will resurrect the 404 No-such-image symptom.
    const m = MOD.match(/await pull\(ctx\.image\)[\s\S]{0,1500}?await pull\(DEPLOYER_IMAGE\)[\s\S]{0,1500}?\/containers\/create/);
    assert.ok(m,
      'must pull ctx.image, then pull DEPLOYER_IMAGE, then POST /containers/create — in that order');
  });

  test('deployer-pull-failed reason is reported when the sidecar pull fails', () => {
    assert.match(MOD, /reason: 'deployer-pull-failed'/,
      'a distinct reason code is needed so the frontend can localize it');
  });
});

describe('dashboard: applyUpdate prefers reason over detail (#user 2026-05-01)', () => {
  test('docker-mode error path uses r.reason (short code), not r.detail (free text)', () => {
    const html = readFileSync(join(__dirname, '..', 'src/dashboard/index.html'), 'utf8');
    // The two MUST be in this order: the localized message (from
    // r.reason) is the i18n payload; r.detail goes to the suffix only
    // for debugging visibility. Reversing them lets long unstable
    // strings flow into I18n.t and re-trigger the querySelector crash.
    const m = html.match(/translateError\(r\.reason,\s*'error\.updateFailed'\)[\s\S]{0,400}?r\.detail/);
    assert.ok(m,
      'docker-mode error handling must call translateError with r.reason FIRST and only append r.detail as plain suffix');
  });
});

describe('I18n.t: zh-CN DOM fallback hardened against arbitrary keys (#user 2026-05-01)', () => {
  test('querySelector lookup is guarded by a charset check + try/catch', () => {
    const html = readFileSync(join(__dirname, '..', 'src/dashboard/index.html'), 'utf8');
    // The fallback path must only run on keys that look like real
    // dotted i18n identifiers; CSS.escape AND a try/catch keep us safe
    // even if a future caller still passes garbage.
    assert.match(html, /\/\^\[A-Za-z0-9_\.\-\]\+\$\/\.test\(key\)/,
      'must charset-validate the key before constructing a CSS selector');
    assert.match(html, /CSS\.escape\(key\)/,
      'must CSS.escape the key when building the [data-i18n] selector');
    // The whole try/catch wraps the document.querySelector call.
    const m = html.match(/try\s*\{[\s\S]{0,500}?document\.querySelector\(`\[data-i18n="\$\{CSS\.escape\(key\)\}"\]`\)[\s\S]{0,200}?\}\s*catch/);
    assert.ok(m,
      'querySelector call must sit inside try/catch so a malformed key cannot throw out of the i18n resolver');
  });
});
