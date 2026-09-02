import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { authMiddleware } from '../src/middleware/auth.ts';
import { createGateway } from '../src/server.ts';
import { createMockUpstream } from '../mock/upstream.ts';
import type { RequestContext } from '../src/context.ts';
import type { AuthConfig, GatewayConfig, RouteConfig } from '../src/config/types.ts';

const auth: AuthConfig = { type: 'api_key', header: 'X-API-Key', keys: ['sk_ok'] };

function routeWithAuth(): RouteConfig {
  return { path: '/p', methods: ['GET'], stripPrefix: false, upstream: { kind: 'single', url: 'http://x' }, timeoutMs: 1000, auth };
}

function ctx(headers: Record<string, string>): RequestContext {
  return { clientIp: '127.0.0.1', method: 'GET', url: '/p', headers, body: Buffer.alloc(0), route: routeWithAuth() };
}

test('a valid key proceeds and the key header is stripped before forwarding', async () => {
  const c = ctx({ 'x-api-key': 'sk_ok' });
  let passed = false;
  await authMiddleware(c, async () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(c.headers['x-api-key'], undefined);
});

test('a missing key header is rejected with 401 and does not proceed', async () => {
  const c = ctx({});
  let passed = false;
  await authMiddleware(c, async () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(c.response?.status, 401);
  assert.equal(JSON.parse(c.response!.body.toString()).error, 'unauthorized');
});

test('an unknown key is rejected with 401', async () => {
  const c = ctx({ 'x-api-key': 'sk_wrong' });
  let passed = false;
  await authMiddleware(c, async () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(c.response?.status, 401);
});

test('a route without auth is untouched', async () => {
  const c: RequestContext = { clientIp: '1.1.1.1', method: 'GET', url: '/x', headers: {}, body: Buffer.alloc(0),
    route: { path: '/x', methods: ['GET'], stripPrefix: false, upstream: { kind: 'single', url: 'http://x' }, timeoutMs: 1000 } };
  let passed = false;
  await authMiddleware(c, async () => { passed = true; });
  assert.equal(passed, true);
});

let mock: Server;
let gateway: Server;
let base: string;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}

before(async () => {
  ({ server: mock } = createMockUpstream());
  const mockBase = `http://127.0.0.1:${await listen(mock)}`;
  const config: GatewayConfig = {
    port: 0,
    globalTimeoutMs: 30_000,
    routes: [
      { path: '/secure', methods: ['GET'], stripPrefix: false, upstream: { kind: 'single', url: mockBase }, timeoutMs: 2000,
        auth: { type: 'api_key', header: 'X-API-Key', keys: ['sk_live_abc123'] } },
    ],
  };
  gateway = createGateway(config);
  base = `http://127.0.0.1:${await listen(gateway)}`;
});

after(async () => {
  await new Promise<void>((r) => gateway.close(() => r()));
  await new Promise<void>((r) => mock.close(() => r()));
});

test('gateway returns 401 without a valid key and 200 with one, not forwarding the key', async () => {
  assert.equal((await fetch(`${base}/secure`)).status, 401);
  assert.equal((await fetch(`${base}/secure`, { headers: { 'X-API-Key': 'nope' } })).status, 401);

  const ok = await fetch(`${base}/secure`, { headers: { 'X-API-Key': 'sk_live_abc123' } });
  assert.equal(ok.status, 200);
  const echoed = (await ok.json()) as { headers: Record<string, string> };
  assert.equal(echoed.headers['x-api-key'], undefined);
});
