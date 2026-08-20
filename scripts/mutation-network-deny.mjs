// Fail closed on network destinations that are not an explicitly local test
// fixture. Mutation evidence must not depend on a live provider, proxy, DNS
// answer, or an inherited credential. Loopback TCP and Unix sockets remain
// available because the repository's protocol tests use local servers.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');

const LOOPBACK = new Set(['localhost', 'localhost.localdomain', '::1', '0:0:0:0:0:0:0:1']);

function isLoopbackHost(value) {
  if (value == null || value === '') return false;
  const host = String(value).trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (LOOPBACK.has(host)) return true;
  if (/^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)) return true;
  return /^::ffff:127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host);
}

function targetFromArgs(args) {
  const first = args[0];
  if (first instanceof URL) return { host: first.hostname };
  if (typeof first === 'string') {
    if (first.startsWith('/') || first.startsWith('\\\\.\\pipe\\')) return { socketPath: first };
    try {
      const url = new URL(first);
      return { host: url.hostname };
    } catch {
      return { host: first };
    }
  }
  if (first && typeof first === 'object') {
    return {
      host: first.hostname ?? first.host ?? first.servername,
      socketPath: first.socketPath,
    };
  }
  // net.connect(port, host, callback)
  return { host: typeof args[1] === 'string' ? args[1] : undefined };
}

function networkStubMiss(kind, target) {
  const error = new Error(`NETWORK_STUB_MISS: mutation child attempted ${kind} to ${target || '(unknown)'}`);
  error.code = 'NETWORK_STUB_MISS';
  return error;
}

function assertAllowed(kind, args) {
  const target = targetFromArgs(args);
  if (target.socketPath || isLoopbackHost(target.host)) return;
  throw networkStubMiss(kind, target.host);
}

function wrap(object, name, kind) {
  const original = object[name];
  if (typeof original !== 'function') return;
  object[name] = function guardedNetworkCall(...args) {
    assertAllowed(kind, args);
    return original.apply(this, args);
  };
}

wrap(net, 'connect', 'net.connect');
wrap(net, 'createConnection', 'net.createConnection');
wrap(tls, 'connect', 'tls.connect');
wrap(http, 'request', 'http.request');
wrap(http, 'get', 'http.get');
wrap(https, 'request', 'https.request');
wrap(https, 'get', 'https.get');

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const target = targetFromArgs([input]);
    if (!target.socketPath && !isLoopbackHost(target.host)) {
      throw networkStubMiss('fetch', target.host);
    }
    return originalFetch(input, init);
  };
}
