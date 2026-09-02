import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { withRetry } from '../src/middleware/retry.ts';
import { GatewayError } from '../src/errors.ts';
import { createGateway } from '../src/server.ts';
import { createMockUpstream, type MockControl } from '../mock/upstream.ts';
import type { Middleware } from '../src/pipeline.ts';
import type { RequestContext } from '../src/context.ts';
import type { GatewayConfig, RetryConfig, RouteConfig } from '../src/config/types.ts';

const route: RouteConfig = {
  path: '/r', methods: ['GET'], stripPrefix: false,
  upstream: { kind: 'single', url: 'http://x' }, timeoutMs: 1000,
};

function ctx(): RequestContext {
  return { clientIp: '127.0.0.1', method: 'GET', url: '/r', headers: {}, body: Buffer.alloc(0), route };
}

function retry(over: Partial<RetryConfig> = {}): RetryConfig {
  return { attempts: 3, backoff: 'exponential', initialDelayMs: 100, on: [502, 503, 504], ...over };
}

function respondingWith(statuses: number[]): { mw: Middleware; calls: () => number } {
  let i = 0;
  const mw: Middleware = async (c) => {
    const status = statuses[Math.min(i, statuses.length - 1)]!;
    i += 1;
    c.response = { status, headers: {}, body: Buffer.alloc(0) };
  };
  return { mw, calls: () => i };
}

const recorder = () => {
  const delays: number[] = [];
  return { sleep: async (ms: number) => { delays.push(ms); }, delays };
};

test('retries a retryable status until it succeeds, returning the success', async () => {
  const { mw, calls } = respondingWith([503, 503, 200]);
  const { sleep, delays } = recorder();
  const c = ctx();
  await withRetry(mw, retry(), sleep)(c, async () => {});
  assert.equal(c.response!.status, 200);
  assert.equal(calls(), 3);
  assert.deepEqual(delays, [100, 200]);
});

test('fixed backoff waits a constant delay', async () => {
  const { mw } = respondingWith([503, 503, 200]);
  const { sleep, delays } = recorder();
  await withRetry(mw, retry({ backoff: 'fixed' }), sleep)(ctx(), async () => {});
  assert.deepEqual(delays, [100, 100]);
});

test('returns the last response when attempts are exhausted', async () => {
  const { mw, calls } = respondingWith([503, 503, 503]);
  const { sleep, delays } = recorder();
  const c = ctx();
  await withRetry(mw, retry(), sleep)(c, async () => {});
  assert.equal(c.response!.status, 503);
  assert.equal(calls(), 3);
  assert.equal(delays.length, 2);
});

test('does not retry a status outside retry.on', async () => {
  const { mw, calls } = respondingWith([500, 200]);
  const { sleep, delays } = recorder();
  const c = ctx();
  await withRetry(mw, retry(), sleep)(c, async () => {});
  assert.equal(c.response!.status, 500);
  assert.equal(calls(), 1);
  assert.equal(delays.length, 0);
});

test('attempts: 1 makes a single try with no retry', async () => {
  const { mw, calls } = respondingWith([503, 200]);
  const { sleep } = recorder();
  await withRetry(mw, retry({ attempts: 1 }), sleep)(ctx(), async () => {});
  assert.equal(calls(), 1);
});

test('retries a retryable GatewayError and rethrows it once exhausted', async () => {
  let calls = 0;
  const mw: Middleware = async () => { calls += 1; throw new GatewayError(504, 'gateway_timeout'); };
  const { sleep, delays } = recorder();
  await assert.rejects(
    withRetry(mw, retry(), sleep)(ctx(), async () => {}),
    (err) => err instanceof GatewayError && err.status === 504,
  );
  assert.equal(calls, 3);
  assert.equal(delays.length, 2);
});

test('does not retry a GatewayError whose status is not in retry.on', async () => {
  let calls = 0;
  const mw: Middleware = async () => { calls += 1; throw new GatewayError(500, 'boom'); };
  const { sleep } = recorder();
  await assert.rejects(withRetry(mw, retry(), sleep)(ctx(), async () => {}));
  assert.equal(calls, 1);
});

let mock: Server;
let control: MockControl;
let gateway: Server;
let base: string;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}

before(async () => {
  ({ server: mock, control } = createMockUpstream());
  const mockBase = `http://127.0.0.1:${await listen(mock)}`;
  const config: GatewayConfig = {
    port: 0,
    globalTimeoutMs: 30_000,
    routes: [
      {
        path: '/flaky', methods: ['GET'], stripPrefix: false,
        upstream: { kind: 'single', url: mockBase }, timeoutMs: 2000,
        retry: { attempts: 3, backoff: 'fixed', initialDelayMs: 10, on: [503] },
      },
    ],
  };
  gateway = createGateway(config);
  base = `http://127.0.0.1:${await listen(gateway)}`;
});

after(async () => {
  await new Promise<void>((r) => gateway.close(() => r()));
  await new Promise<void>((r) => mock.close(() => r()));
});

test('a flaky upstream that recovers within the retry budget returns success', async () => {
  control.flakyFailures = 2;
  const res = await fetch(`${base}/flaky`);
  assert.equal(res.status, 200);
});

test('a flaky upstream that never recovers returns the last failing response', async () => {
  control.flakyFailures = 5;
  const res = await fetch(`${base}/flaky`);
  assert.equal(res.status, 503);
});
