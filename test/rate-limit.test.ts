import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createRateLimiter } from '../src/rateLimit/store.ts';
import { rateLimitMiddleware } from '../src/middleware/rateLimit.ts';
import { createGateway } from '../src/server.ts';
import { createMockUpstream } from '../mock/upstream.ts';
import type { RequestContext } from '../src/context.ts';
import type { GatewayConfig, ResolvedRateLimit, RouteConfig } from '../src/config/types.ts';

const fixed = (requests: number): ResolvedRateLimit => ({ requests, windowMs: 1000, strategy: 'fixed_window', per: 'ip' });
const sliding = (requests: number): ResolvedRateLimit => ({ requests, windowMs: 1000, strategy: 'sliding_window', per: 'ip' });

test('fixed_window admits up to the limit, then denies until the window rolls over', () => {
  const limiter = createRateLimiter();
  const limit = fixed(2);
  assert.equal(limiter.check('k', limit, 0).allowed, true);
  assert.equal(limiter.check('k', limit, 100).allowed, true);
  const denied = limiter.check('k', limit, 200);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterMs, 800);
  assert.equal(limiter.check('k', limit, 1000).allowed, true);
});

test('sliding_window counts only requests inside the trailing window', () => {
  const limiter = createRateLimiter();
  const limit = sliding(2);
  assert.equal(limiter.check('k', limit, 0).allowed, true);
  assert.equal(limiter.check('k', limit, 500).allowed, true);
  assert.equal(limiter.check('k', limit, 600).allowed, false);
  assert.equal(limiter.check('k', limit, 1001).allowed, true);
});

test('buckets are isolated per key', () => {
  const limiter = createRateLimiter();
  const limit = fixed(1);
  assert.equal(limiter.check('a', limit, 0).allowed, true);
  assert.equal(limiter.check('b', limit, 0).allowed, true);
  assert.equal(limiter.check('a', limit, 0).allowed, false);
});

function ctx(clientIp: string, route: RouteConfig): RequestContext {
  return { clientIp, method: 'GET', url: route.path, headers: {}, body: Buffer.alloc(0), route };
}

function routeWith(rateLimit: ResolvedRateLimit): RouteConfig {
  return { path: '/r', methods: ['GET'], stripPrefix: false, upstream: { kind: 'single', url: 'http://x' }, timeoutMs: 1000, rateLimit };
}

test('per: ip gives each client its own bucket', async () => {
  const mw = rateLimitMiddleware(createRateLimiter());
  const route = routeWith(fixed(1));
  let passed = 0;
  const next = async () => { passed += 1; };
  await mw(ctx('1.1.1.1', route), next);
  await mw(ctx('2.2.2.2', route), next);
  assert.equal(passed, 2);
});

test('per: global shares one bucket across clients and returns a 429 envelope', async () => {
  const mw = rateLimitMiddleware(createRateLimiter());
  const route = routeWith({ requests: 1, windowMs: 1000, strategy: 'fixed_window', per: 'global' });
  let passed = 0;
  const next = async () => { passed += 1; };
  const first = ctx('1.1.1.1', route);
  const second = ctx('2.2.2.2', route);
  await mw(first, next);
  await mw(second, next);
  assert.equal(passed, 1);
  assert.equal(second.response?.status, 429);
  assert.equal(second.response?.headers['retry-after'], '1');
  const body = JSON.parse(second.response!.body.toString());
  assert.equal(body.error, 'rate_limited');
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
      { path: '/limited', methods: ['GET'], stripPrefix: false, upstream: { kind: 'single', url: mockBase }, timeoutMs: 2000, rateLimit: { requests: 10, windowMs: 60_000, strategy: 'fixed_window', per: 'ip' } },
    ],
  };
  gateway = createGateway(config);
  base = `http://127.0.0.1:${await listen(gateway)}`;
});

after(async () => {
  await new Promise<void>((r) => gateway.close(() => r()));
  await new Promise<void>((r) => mock.close(() => r()));
});

test('50 concurrent requests admit exactly the limit and reject the rest', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => fetch(`${base}/limited`)));
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 200).length, 10);
  assert.equal(statuses.filter((s) => s === 429).length, 40);
});
