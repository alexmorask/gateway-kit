import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createGateway } from '../src/server.ts';
import { createMockUpstream } from '../mock/upstream.ts';
import type { GatewayConfig, RouteConfig } from '../src/config/types.ts';

let mock: Server;
let gateway: Server;
let base: string;
let mockBase: string;
let mockHost: string;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}

function route(path: string, methods: string[], stripPrefix: boolean, url: string): RouteConfig {
  return { path, methods, stripPrefix, upstream: { kind: 'single', url }, timeoutMs: 2000 };
}

before(async () => {
  ({ server: mock } = createMockUpstream());
  const mockPort = await listen(mock);
  mockBase = `http://127.0.0.1:${mockPort}`;
  mockHost = `127.0.0.1:${mockPort}`;

  const config: GatewayConfig = {
    port: 0,
    globalTimeoutMs: 30_000,
    routes: [
      route('/api/users', ['GET', 'POST'], false, mockBase),
      route('/api/products', ['GET'], true, mockBase),
      route('/teapot', ['GET'], false, mockBase),
      route('/api/dead', ['GET'], false, 'http://127.0.0.1:1'),
    ],
  };
  gateway = createGateway(config);
  base = `http://127.0.0.1:${await listen(gateway)}`;
});

after(async () => {
  await new Promise<void>((r) => gateway.close(() => r()));
  await new Promise<void>((r) => mock.close(() => r()));
});

test('proxies a matched request and echoes method and path', async () => {
  const res = await fetch(`${base}/api/users`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-upstream'), 'mock');
  const body = (await res.json()) as { method: string; path: string };
  assert.equal(body.method, 'GET');
  assert.equal(body.path, '/api/users');
});

test('strip_prefix removes the route prefix and preserves the query string', async () => {
  const res = await fetch(`${base}/api/products/123?x=1`);
  const body = (await res.json()) as { path: string };
  assert.equal(body.path, '/123?x=1');
});

test('forwards the request body on POST', async () => {
  const res = await fetch(`${base}/api/users`, { method: 'POST', body: JSON.stringify({ a: 1 }) });
  const body = (await res.json()) as { method: string; body: string };
  assert.equal(body.method, 'POST');
  assert.equal(body.body, JSON.stringify({ a: 1 }));
});

test('rewrites Host to the upstream and strips hop-by-hop headers, keeping custom headers', async () => {
  const res = await fetch(`${base}/api/users`, { headers: { connection: 'close', 'x-custom': 'v' } });
  const body = (await res.json()) as { headers: Record<string, string> };
  assert.equal(body.headers.host, mockHost);
  assert.notEqual(body.headers.connection, 'close');
  assert.equal(body.headers['x-custom'], 'v');
});

test('returns the upstream status and body verbatim', async () => {
  const res = await fetch(`${base}/teapot`);
  assert.equal(res.status, 418);
  const body = (await res.json()) as { teapot: boolean };
  assert.equal(body.teapot, true);
});

test('unknown method on a known route is 405 with an Allow header', async () => {
  const res = await fetch(`${base}/api/users`, { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, POST');
});

test('unmatched path is 404', async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
});

test('a dead upstream yields 502 without crashing the gateway', async () => {
  const res = await fetch(`${base}/api/dead`);
  assert.equal(res.status, 502);
  const stillUp = await fetch(`${base}/api/users`);
  assert.equal(stillUp.status, 200);
});
