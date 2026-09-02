import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createTargetSelector } from '../src/upstream/select.ts';
import { createGateway } from '../src/server.ts';
import { createMockUpstream } from '../mock/upstream.ts';
import type { GatewayConfig, Upstream } from '../src/config/types.ts';

const single: Upstream = { kind: 'single', url: 'http://only' };

const balanced = (balance: 'round_robin' | 'weighted_round_robin'): Upstream => ({
  kind: 'balanced',
  balance,
  targets: [{ url: 'http://a', weight: 3 }, { url: 'http://b', weight: 1 }],
});

function pickMany(times: number, key: string, upstream: Upstream): Record<string, number> {
  const selector = createTargetSelector();
  const counts: Record<string, number> = {};
  for (let i = 0; i < times; i += 1) {
    const url = selector.next(key, upstream);
    counts[url] = (counts[url] ?? 0) + 1;
  }
  return counts;
}

test('a single upstream always returns its url', () => {
  const selector = createTargetSelector();
  assert.equal(selector.next('k', single), 'http://only');
  assert.equal(selector.next('k', single), 'http://only');
});

test('round_robin cycles targets evenly, ignoring weights', () => {
  const selector = createTargetSelector();
  const seq = [0, 1, 2, 3].map(() => selector.next('k', balanced('round_robin')));
  assert.deepEqual(seq, ['http://a', 'http://b', 'http://a', 'http://b']);
});

test('weighted_round_robin distributes in proportion to weight over a full cycle', () => {
  const counts = pickMany(8, 'k', balanced('weighted_round_robin'));
  assert.deepEqual(counts, { 'http://a': 6, 'http://b': 2 });
});

test('cursors are isolated per key', () => {
  const selector = createTargetSelector();
  assert.equal(selector.next('x', balanced('round_robin')), 'http://a');
  assert.equal(selector.next('y', balanced('round_robin')), 'http://a');
});

let mockA: Server;
let mockB: Server;
let gateway: Server;
let base: string;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));
}

before(async () => {
  ({ server: mockA } = createMockUpstream());
  ({ server: mockB } = createMockUpstream());
  const a = `http://127.0.0.1:${await listen(mockA)}`;
  const b = `http://127.0.0.1:${await listen(mockB)}`;
  const config: GatewayConfig = {
    port: 0,
    globalTimeoutMs: 30_000,
    routes: [
      {
        path: '/lb', methods: ['GET'], stripPrefix: false, timeoutMs: 2000,
        upstream: { kind: 'balanced', balance: 'weighted_round_robin', targets: [{ url: a, weight: 3 }, { url: b, weight: 1 }] },
      },
    ],
  };
  gateway = createGateway(config);
  base = `http://127.0.0.1:${await listen(gateway)}`;
});

after(async () => {
  await new Promise<void>((r) => gateway.close(() => r()));
  await new Promise<void>((r) => mockA.close(() => r()));
  await new Promise<void>((r) => mockB.close(() => r()));
});

test('distributes real requests across targets by weight', async () => {
  const hosts: Record<string, number> = {};
  for (let i = 0; i < 8; i += 1) {
    const body = (await (await fetch(`${base}/lb`)).json()) as { headers: Record<string, string> };
    const host = body.headers.host!;
    hosts[host] = (hosts[host] ?? 0) + 1;
  }
  const counts = Object.values(hosts).sort((x, y) => y - x);
  assert.deepEqual(counts, [6, 2]);
});
