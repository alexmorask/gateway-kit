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

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}

function route(path: string, url: string, timeoutMs: number): RouteConfig {
  return { path, methods: ['GET'], stripPrefix: false, upstream: { kind: 'single', url }, timeoutMs };
}

before(async () => {
  ({ server: mock } = createMockUpstream());
  const mockBase = `http://127.0.0.1:${await listen(mock)}`;
  const config: GatewayConfig = {
    port: 0,
    globalTimeoutMs: 30_000,
    routes: [
      route('/slow', mockBase, 100),
      route('/fast', mockBase, 2000),
      route('/dead', 'http://127.0.0.1:1', 2000),
    ],
  };
  gateway = createGateway(config);
  base = `http://127.0.0.1:${await listen(gateway)}`;
});

after(async () => {
  await new Promise<void>((r) => gateway.close(() => r()));
  await new Promise<void>((r) => mock.close(() => r()));
});

test('an upstream slower than the timeout yields 504', async () => {
  const res = await fetch(`${base}/slow?ms=400`);
  assert.equal(res.status, 504);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, 'gateway_timeout');
});

test('an upstream within the timeout passes through', async () => {
  const res = await fetch(`${base}/fast`);
  assert.equal(res.status, 200);
});

test('a refused upstream yields 502', async () => {
  const res = await fetch(`${base}/dead`);
  assert.equal(res.status, 502);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, 'bad_gateway');
});

test('the gateway keeps serving other routes after failures', async () => {
  await fetch(`${base}/slow?ms=400`).catch(() => {});
  await fetch(`${base}/dead`).catch(() => {});
  const res = await fetch(`${base}/fast`);
  assert.equal(res.status, 200);
});
