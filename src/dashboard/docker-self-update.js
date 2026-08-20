/**
 * In-container docker self-update via /var/run/docker.sock.
 *
 * Strategy: instead of installing the docker CLI inside our image (extra
 * ~80MB) we talk to the docker daemon directly over the unix socket using
 * node's built-in http client. The actual recreate-self-with-new-image
 * step is handled by a one-shot deployer container we spawn — running
 * `docker compose up -d` on the project; it sees the freshly-pulled
 * image vs. our running container's image, stops us, and brings up a new
 * container with the same name + config + new image.
 *
 * Security: this requires the user to mount /var/run/docker.sock into
 * our container, which effectively grants host root (anyone with access
 * to docker.sock can spawn privileged containers). That's why this code
 * path is opt-in — if the socket isn't mounted we just report
 * { available: false, reason: 'no-docker-sock' } and the dashboard
 * falls back to the existing "run `docker compose pull && up -d` on the
 * host" message.
 *
 * Compose label dependency: we need to know the compose project name and
 * working_dir on the host to spawn the deployer with the right binds.
 * Both come from the labels compose attaches to every container it
 * creates: `com.docker.compose.project` and
 * `com.docker.compose.project.working_dir`. If they're missing (e.g. user
 * ran `docker run` directly without compose) we abort with a clear error
 * — recreating a hand-managed container without losing its config is a
 * separate problem we don't want to solve here.
 */

import { existsSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';

const DOCKER_SOCK = '/var/run/docker.sock';
const DEPLOYER_IMAGE = 'docker:24-cli';
const DOCKER_CONTAINER_ID_RE = /^[0-9a-f]{64}$/i;
const COMPOSE_CONFIG_FILES_LABEL = 'com.docker.compose.project.config_files';
const MAX_COMPOSE_CONFIG_FILES = 32;
const MAX_COMPOSE_CONFIG_FILES_LABEL_BYTES = 16 * 1024;
// A daemon error should fail the request rather than allowing an unbounded
// response to retain memory until the dashboard mutation timeout.  Pull
// progress is noisier than the small inspect/create responses, so it gets a
// separate (still finite) ceiling below.
const DOCKER_API_BODY_LIMIT = 4 * 1024 * 1024;
const DOCKER_PULL_BODY_LIMIT = 16 * 1024 * 1024;
// Wait long enough for the dashboard's HTTP response to flush back to the
// browser before the deployer tears us down. 8s is enough for the toast +
// auto-refresh JS to land; longer waits just confuse the UX.
const DEPLOYER_DELAY_SECONDS = 8;

// Defence-in-depth (audit #2): compose labels come from the container
// runtime and the file's own contract says not to trust them blindly.
// shellQuote() already makes them shell-safe; these validators reject
// malformed/hostile shapes so they can't reach the deployer command at all.
export function isSafeComposeProject(name) {
  return typeof name === 'string' && name.length <= 256 && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name);
}
export function isSafeComposeWorkingDir(dir) {
  if (typeof dir !== 'string' || dir.length === 0 || dir.length > 4096) return false;
  if (!/^\/[^\0\r\n:]*$/.test(dir)) return false;
  return !dir.split('/').includes('..');
}

function normalizeDockerContainerId(value) {
  if (typeof value !== 'string' || !DOCKER_CONTAINER_ID_RE.test(value)) return null;
  return value.toLowerCase();
}

function dockerIdFromCgroup(cgroup) {
  if (typeof cgroup !== 'string') return null;
  const ids = new Set();
  for (const line of cgroup.split(/\r?\n/)) {
    if (!line) continue;
    const firstColon = line.indexOf(':');
    const secondColon = firstColon < 0 ? -1 : line.indexOf(':', firstColon + 1);
    if (firstColon < 0 || secondColon < 0) continue;
    const path = line.slice(secondColon + 1);
    // Docker cgroupfs and systemd use distinct, fully-qualified forms. Do not
    // search arbitrary cgroup text: a sibling service name may contain hex.
    const match = /^\/docker\/([0-9a-f]{64})$/i.exec(path)
      || /^\/(?:[^/\0\r\n]+\/)*docker-([0-9a-f]{64})\.scope$/i.exec(path);
    if (match) ids.add(match[1].toLowerCase());
  }
  return ids.size === 1 ? [...ids][0] : null;
}

function isPrivateCgroupV2(cgroup) {
  if (typeof cgroup !== 'string') return false;
  const lines = cgroup.split(/\r?\n/).filter(Boolean);
  return lines.length === 1 && lines[0] === '0::/';
}

function dockerIdFromMountInfo(mountInfo) {
  if (typeof mountInfo !== 'string') return null;
  const expectedTargets = new Set(['/etc/hostname', '/etc/hosts', '/etc/resolv.conf']);
  const matchedTargets = new Set();
  const ids = new Set();
  for (const line of mountInfo.split(/\r?\n/)) {
    const fields = line.split(' ');
    // mountinfo's root and mount-point fields are fields 4 and 5. The
    // runtime-managed Docker files expose the container ID in the root path;
    // require at least two independent files to agree before accepting it.
    if (fields.length < 6 || !expectedTargets.has(fields[4])) continue;
    const root = fields[3];
    const match = /(?:^|\/)containers\/([0-9a-f]{64})\/(hostname|hosts|resolv\.conf)$/i.exec(root);
    if (!match) continue;
    const file = '/etc/' + match[2];
    if (file !== fields[4]) continue;
    matchedTargets.add(fields[4]);
    ids.add(match[1].toLowerCase());
  }
  return matchedTargets.size >= 2 && ids.size === 1 ? [...ids][0] : null;
}

function isSafeAbsoluteComposePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4096) return false;
  if (!/^\/[^\0\r\n:]*$/.test(path) || path.endsWith('/')) return false;
  const segments = path.split('/');
  return segments.slice(1).every(segment => segment && segment !== '.' && segment !== '..');
}

export function isSafeComposeConfigFile(path, workingDir) {
  if (!isSafeComposeWorkingDir(workingDir) || !isSafeAbsoluteComposePath(path)) return false;
  const prefix = workingDir.endsWith('/') ? workingDir : workingDir + '/';
  return path.startsWith(prefix) && path.length > prefix.length;
}

function parseComposeConfigFiles(value, workingDir) {
  if (typeof value !== 'string' || value.length === 0
      || Buffer.byteLength(value, 'utf8') > MAX_COMPOSE_CONFIG_FILES_LABEL_BYTES) return null;
  const files = value.split(',');
  if (files.length === 0 || files.length > MAX_COMPOSE_CONFIG_FILES) return null;
  const seen = new Set();
  for (const file of files) {
    if (!isSafeComposeConfigFile(file, workingDir) || seen.has(file)) return null;
    seen.add(file);
  }
  return files;
}

function validateComposeConfigFiles(files, workingDir) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_COMPOSE_CONFIG_FILES) return null;
  const seen = new Set();
  for (const file of files) {
    if (!isSafeComposeConfigFile(file, workingDir) || seen.has(file)) return null;
    seen.add(file);
  }
  return files;
}

/**
 * Resolve our own container ID from a Docker-owned cgroup path, or from
 * corroborating Docker runtime mounts when a private cgroup-v2 namespace
 * intentionally hides it. A container hostname is operator-controlled
 * (--hostname / Compose hostname:), so it is never an identity source.
 */
export function readSelfContainerId({ readFile = readFileSync } = {}) {
  let cgroup;
  try {
    cgroup = readFile('/proc/self/cgroup', 'utf8');
  } catch {}
  const cgroupId = dockerIdFromCgroup(cgroup);
  if (cgroupId) return cgroupId;

  // With a private cgroup namespace Docker intentionally presents 0::/.
  // Do not fall back to /etc/hostname: hostname is operator-controlled and
  // can name a different container. Docker's own bind mounts for at least two
  // of hostname/hosts/resolv.conf carry the real ID in mountinfo instead.
  if (isPrivateCgroupV2(cgroup)) {
    try {
      const mountInfo = readFile('/proc/self/mountinfo', 'utf8');
      return dockerIdFromMountInfo(mountInfo);
    } catch {}
  }
  return null;
}

function collectDockerResponse(res, { maxBytes, label }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;

    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    const destroy = () => {
      if (typeof res.destroy === 'function') {
        try { res.destroy(); } catch { /* the original failure is authoritative */ }
      }
    };

    res.on('data', (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buf.length;
      if (bytes > maxBytes) {
        settleReject(new Error(`${label} response body exceeds ${maxBytes} bytes`));
        destroy();
        return;
      }
      chunks.push(buf);
    });
    // IncomingMessage emits `error` for transport failures.  `aborted` is a
    // distinct signal for a peer that truncates the body, while `close` can
    // arrive without `end` when the socket disappears.  All paths are
    // single-settle so a late close/error cannot turn a prior success into a
    // second resolution or leave the caller pending forever.
    res.once('error', (error) => settleReject(error));
    res.once('aborted', () => settleReject(new Error(`${label} response aborted`)));
    res.once('close', () => {
      if (!settled) settleReject(new Error(`${label} response closed before end`));
    });
    res.once('end', settleResolve);
  });
}

function dockerRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = httpRequest(
      {
        socketPath: DOCKER_SOCK,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: 60000,
      },
      (res) => {
        collectDockerResponse(res, {
          maxBytes: DOCKER_API_BODY_LIMIT,
          label: `docker API ${method} ${path}`,
        }).then((raw) => {
          const buf = raw.toString('utf8');
          let parsed;
          try { parsed = buf ? JSON.parse(buf) : null; } catch { parsed = buf; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body: parsed });
          } else {
            reject(new Error(`docker API ${method} ${path} -> ${res.statusCode}: ${buf.slice(0, 400)}`));
          }
        }, reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('docker API timeout')));
    if (data) req.write(data);
    req.end();
  });
}

/**
 * The /images/create endpoint streams a JSONL pull progress feed and
 * doesn't terminate until the pull completes. Wait for the response body
 * to drain before returning.
 */
export function dockerPull(image, { request = httpRequest } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: DOCKER_SOCK,
        method: 'POST',
        path: `/images/create?fromImage=${encodeURIComponent(image)}`,
        headers: { 'Content-Type': 'application/json' },
        timeout: 600000,
      },
      (res) => {
        collectDockerResponse(res, {
          maxBytes: DOCKER_PULL_BODY_LIMIT,
          label: `docker pull ${image}`,
        }).then((raw) => {
          const buf = raw.toString('utf8');
          if (!(res.statusCode >= 200 && res.statusCode < 300)) {
            reject(new Error(`docker pull ${image} -> ${res.statusCode}: ${buf.slice(0, 400)}`));
            return;
          }
          let sawRecord = false;
          let lastRecordCompleted = false;
          // audit #11: /images/create streams JSONL and returns HTTP 200 EVEN
          // WHEN THE PULL FAILS (unknown tag, auth/registry error) — the failure
          // is an {"error":...} / {"errorDetail":...} line in the body, not the
          // status. Treating 200 as success left the deployer silently on the
          // OLD image. Scan the stream and reject if any line reports an error.
          for (const line of buf.split('\n')) {
            const s = line.trim();
            if (!s) continue;
            let obj;
            try { obj = JSON.parse(s); } catch {
              reject(new Error(`docker pull ${image} returned malformed JSONL`));
              return;
            }
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
              reject(new Error(`docker pull ${image} returned an invalid JSONL record`));
              return;
            }
            sawRecord = true;
            if (Object.prototype.hasOwnProperty.call(obj, 'error')
                || Object.prototype.hasOwnProperty.call(obj, 'errorDetail')) {
              const detail = obj.errorDetail;
              const msg = (detail && typeof detail === 'object' && detail.message)
                || detail || obj.error || 'unknown docker pull error';
              reject(new Error(`docker pull ${image} failed: ${String(msg).slice(0, 400)}`));
              return;
            }
            const status = typeof obj.status === 'string' ? obj.status.trim() : '';
            const aux = obj.aux && typeof obj.aux === 'object' && !Array.isArray(obj.aux)
              ? obj.aux
              : null;
            const auxDigest = aux && (aux.Digest || aux.digest || aux.ID || aux.id);
            const hasAuxDigest = typeof auxDigest === 'string'
              && /^sha256:[0-9a-f]{64}$/i.test(auxDigest.trim());
            // Docker's pull stream is progress-only until a terminal status (or
            // explicit auxiliary digest) arrives. HTTP 200 plus a clean EOF is
            // not proof that the requested image was pulled: registries and
            // daemon proxies can truncate the stream without an error record.
            lastRecordCompleted = hasAuxDigest
              || /^(?:status:\s*)?(?:downloaded newer image|image is up to date)(?:\s+for\b.*)?$/i.test(status);
          }
          if (!sawRecord) {
            reject(new Error(`docker pull ${image} returned an empty JSONL stream`));
            return;
          }
          if (!lastRecordCompleted) {
            reject(new Error(`docker pull ${image} returned no terminal success record`));
            return;
          }
          resolve(buf);
        }, reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('docker pull timeout (10min)')));
    req.end();
  });
}

/**
 * Detect whether docker self-update is feasible.
 * Returns { available, reason, ...detail } so the dashboard can show
 * the right hint when it's not.
 */
export async function detectDockerSelfUpdate({
  exists = existsSync,
  readSelfId = readSelfContainerId,
  request = dockerRequest,
} = {}) {
  if (!exists(DOCKER_SOCK)) {
    return { available: false, reason: 'no-docker-sock', detail: `${DOCKER_SOCK} not mounted` };
  }
  let selfId;
  try { selfId = normalizeDockerContainerId(readSelfId()); } catch {}
  if (!selfId) {
    return {
      available: false,
      reason: 'no-self-id',
      detail: 'cannot prove own full container id from a Docker cgroup or corroborated runtime mounts',
    };
  }
  let inspect;
  try {
    inspect = await request('GET', `/containers/${selfId}/json`);
 } catch (e) {
   return { available: false, reason: 'docker-api-unreachable', detail: e.message };
 }
  const inspectedId = normalizeDockerContainerId(inspect?.body?.Id);
  if (inspectedId !== selfId) {
    return {
      available: false,
      reason: 'self-id-mismatch',
      detail: 'docker inspect did not return the exact container id proven by local runtime evidence',
    };
  }
  const labels = inspect.body?.Config?.Labels || {};
  const project = labels['com.docker.compose.project'];
  const workingDir = labels['com.docker.compose.project.working_dir'];
  const configFilesLabel = labels[COMPOSE_CONFIG_FILES_LABEL];
  const image = inspect.body?.Config?.Image;
  if (!project || !workingDir) {
    return {
      available: false,
      reason: 'no-compose-labels',
      detail: 'container has no com.docker.compose.* labels — was it started via `docker run` instead of `docker compose up`?',
      image, selfId,
    };
  }
  if (typeof configFilesLabel !== 'string' || configFilesLabel.length === 0) {
    return {
      available: false,
      reason: 'no-compose-config-files',
      detail: 'container has no Compose config_files label; the exact deployment configuration cannot be replayed safely',
      image, selfId,
    };
  }
  if (!isSafeComposeProject(project) || !isSafeComposeWorkingDir(workingDir)) {
    return {
      available: false,
      reason: 'unsafe-compose-labels',
      detail: 'compose project / working_dir label failed safety validation',
      image, selfId,
    };
  }
  const configFiles = parseComposeConfigFiles(configFilesLabel, workingDir);
  if (!configFiles) {
    return {
      available: false,
      reason: 'unsafe-compose-config-files',
      detail: 'Compose config_files must be unique absolute files contained by the validated project working_dir',
      image, selfId,
    };
  }
  return {
    available: true,
    selfId,
    image,
    project,
    workingDir,
    configFiles,
  };
}

/**
 * Run the full self-update flow. Returns immediately after the deployer
 * sidecar is started; the actual recreate happens out-of-band ~8s later.
 */
export async function runDockerSelfUpdate({
  detect = detectDockerSelfUpdate,
  pull = dockerPull,
  request = dockerRequest,
} = {}) {
  const ctx = await detect();
  if (!ctx.available) return { ok: false, ...ctx };
  const selfId = normalizeDockerContainerId(ctx.selfId);
  const configFiles = validateComposeConfigFiles(ctx.configFiles, ctx.workingDir);
  if (!selfId) {
    return { ok: false, reason: 'no-self-id', detail: 'self-update context did not contain a full Docker container id' };
  }
  if (!isSafeComposeProject(ctx.project) || !isSafeComposeWorkingDir(ctx.workingDir)) {
    return { ok: false, reason: 'unsafe-compose-labels', detail: 'self-update context contained unsafe Compose labels' };
  }
  if (!configFiles) {
    const reason = Array.isArray(ctx.configFiles) ? 'unsafe-compose-config-files' : 'no-compose-config-files';
    return { ok: false, reason, detail: 'self-update context did not prove the exact Compose config files to replay' };
  }
  if (typeof ctx.image !== 'string' || ctx.image.length === 0 || /[\0\r\n]/.test(ctx.image)) {
    return { ok: false, reason: 'unsafe-image', detail: 'self-update context contained an invalid image reference' };
  }

  // Pull the new image. This blocks until the pull finishes — could be
  // 30s-2min for a fresh layer set, but the user is staring at the
  // dashboard and a fast progress signal beats a confusing async
  // "started, check back later" UX.
  try {
    await pull(ctx.image);
  } catch (e) {
    return { ok: false, reason: 'pull-failed', detail: e.message };
  }

  // Also ensure the deployer sidecar image is local. First-time users on
  // a host that has never pulled `docker:24-cli` will otherwise hit
  //   POST /containers/create -> 404: No such image: docker:24-cli
  // (reported as the dashboard "一键更新并重启" failure path). Pull it
  // explicitly. It's tiny (~30 MB) and only runs the one-shot
  // `docker compose up -d`, so this is a one-time cost per host.
  try {
    await pull(DEPLOYER_IMAGE);
  } catch (e) {
    return { ok: false, reason: 'deployer-pull-failed', detail: e.message };
  }

  // Spawn the deployer sidecar. We mount docker.sock and the host
  // project dir (so `docker compose -p ... --project-directory ...`
  // can find the compose file). AutoRemove cleans up the sidecar after
  // it exits regardless of success.
  //
  // The sleep at the start gives the dashboard's HTTP response time to
  // flush back to the browser before our container gets killed.
  const composeConfigArgs = configFiles.map(file => '-f ' + shellQuote(file)).join(' ');
  let createRes;
  try {
    createRes = await request('POST', `/containers/create`, {
      Image: DEPLOYER_IMAGE,
      Cmd: [
        'sh', '-c',
        'set -e; sleep ' + DEPLOYER_DELAY_SECONDS + '; ' +
        'docker compose -p ' + shellQuote(ctx.project) + ' ' +
        '--project-directory ' + shellQuote(ctx.workingDir) + ' ' +
        composeConfigArgs + ' up -d',
      ],
      Labels: {
        'com.windsurf-api.role': 'self-update-deployer',
        'com.windsurf-api.parent': selfId,
      },
      HostConfig: {
        AutoRemove: true,
        Binds: [
          `${DOCKER_SOCK}:${DOCKER_SOCK}`,
          `${ctx.workingDir}:${ctx.workingDir}:ro`,
        ],
      },
    });
  } catch (e) {
    return { ok: false, reason: 'deployer-create-failed', detail: e.message };
  }

  const deployerId = normalizeDockerContainerId(createRes.body?.Id);
  if (!deployerId) {
    return { ok: false, reason: 'deployer-create-no-id', detail: JSON.stringify(createRes.body).slice(0, 400) };
  }

  try {
    await request('POST', `/containers/${deployerId}/start`, null);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    try {
      await request('DELETE', `/containers/${deployerId}?force=1`, null);
    } catch {
      // A failed start leaves an AutoRemove container stopped forever. Cleanup
      // is best-effort; the start error remains the authoritative user result.
    }
    return { ok: false, reason: 'deployer-start-failed', detail };
  }

  return {
    ok: true,
    image: ctx.image,
    project: ctx.project,
    workingDir: ctx.workingDir,
    deployerId: deployerId.slice(0, 12),
    delaySeconds: DEPLOYER_DELAY_SECONDS,
    message: `Pulled ${ctx.image}; deployer sidecar will recreate the container in ~${DEPLOYER_DELAY_SECONDS}s.`,
  };
}

// Single-quote-wrap a value for safe injection into a `sh -c "..."`
// payload. Single quotes inside the value get terminated, escaped,
// re-opened: `'foo'` -> `'foo'\''bar'`. The compose project name and
// working_dir come from container labels which we don't fully control,
// so don't trust them blindly.
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
