#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 90_000;
const TEST_SETUP = pathToFileURL(resolve(process.cwd(), 'test/setup-env.mjs')).href;

export function parseArgs(argv) {
  const positional = [];
  let timeoutMs = Number(process.env.TEST_FILE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--timeout-ms') {
      timeoutMs = Number(argv[++i]);
      continue;
    }
    if (arg?.startsWith('--timeout-ms=')) {
      timeoutMs = Number(arg.slice('--timeout-ms='.length));
      continue;
    }
    positional.push(arg);
  }

  const shardIndex = Number(positional[0] ?? process.env.TEST_SHARD_INDEX ?? 0);
  const shardTotal = Number(positional[1] ?? process.env.TEST_SHARD_TOTAL ?? 1);
  if (!Number.isInteger(shardIndex) || shardIndex < 0) {
    throw new Error(`Invalid shard index: ${positional[0] ?? process.env.TEST_SHARD_INDEX ?? ''}`);
  }
  if (!Number.isInteger(shardTotal) || shardTotal < 1) {
    throw new Error(`Invalid shard total: ${positional[1] ?? process.env.TEST_SHARD_TOTAL ?? ''}`);
  }
  if (shardIndex >= shardTotal) {
    throw new Error(`Shard index ${shardIndex} must be smaller than shard total ${shardTotal}`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
    throw new Error(`Invalid per-file timeout: ${timeoutMs}`);
  }
  return { shardIndex, shardTotal, timeoutMs };
}

export function listTopLevelTestFiles(root = process.cwd()) {
  const testDir = join(root, 'test');
  return readdirSync(testDir)
    .filter(name => name.endsWith('.test.js'))
    .sort((a, b) => a.localeCompare(b))
    .map(name => join('test', name).replace(/\\/g, '/'));
}

export function selectShard(files, shardIndex, shardTotal) {
  return files.filter((_, i) => i % shardTotal === shardIndex);
}

function runOne(file, timeoutMs) {
  return new Promise(resolveRun => {
    const child = spawn(process.execPath,     // No --test-force-exit: measured on the Linux runner it ends the run early and still
    // exits 0, so a file can report green having run only part of its suites. A hang is a named
    // failure here (timedOut is reported); a truncation is not.
['--import', TEST_SETUP, '--test', file], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const prefix = `[${file}] `;
    child.stdout.on('data', chunk => process.stdout.write(prefix + String(chunk).replace(/\n/g, `\n${prefix}`)));
    child.stderr.on('data', chunk => process.stderr.write(prefix + String(chunk).replace(/\n/g, `\n${prefix}`)));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref?.();
    }, timeoutMs);

    child.on('close', code => {
      clearTimeout(timer);
      resolveRun({
        file,
        ok: !timedOut && code === 0,
        code,
        timedOut,
      });
    });
  });
}

export async function runShard({ shardIndex, shardTotal, timeoutMs, root = process.cwd() }) {
  const files = listTopLevelTestFiles(root);
  const selected = selectShard(files, shardIndex, shardTotal);
  console.log(`Running test shard ${shardIndex + 1}/${shardTotal}: ${selected.length}/${files.length} files`);
  for (const file of selected) console.log(`- ${file}`);

  const failures = [];
  for (const file of selected) {
    const result = await runOne(file, timeoutMs);
    if (!result.ok) failures.push(result);
  }

  if (failures.length) {
    console.error(`Test shard ${shardIndex + 1}/${shardTotal} failed:`);
    for (const failure of failures) {
      const suffix = failure.timedOut ? `timed out after ${timeoutMs}ms` : `exit ${failure.code}`;
      console.error(`- ${failure.file}: ${suffix}`);
    }
    return 1;
  }
  return 0;
}

if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    process.exitCode = await runShard(opts);
  } catch (err) {
    console.error(err?.message || err);
    process.exitCode = 2;
  }
}
