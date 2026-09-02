import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/load.ts';

const sample = fileURLToPath(new URL('../gateway.yaml', import.meta.url));
const alt = fileURLToPath(new URL('./fixtures/alt-gateway.yaml', import.meta.url));

test('resolves the provided gateway.yaml exactly as the schema intends', () => {
  const cfg = loadConfig(sample);
  assert.equal(cfg.port, 8080);
  assert.equal(cfg.globalTimeoutMs, 30_000);
  assert.deepEqual(cfg.globalRateLimit, { requests: 100, windowMs: 60_000, strategy: 'fixed_window', per: 'ip' });

  const byPath = Object.fromEntries(cfg.routes.map((r) => [r.path, r]));

  assert.deepEqual(byPath['/api/users']!.methods, ['GET', 'POST']);
  assert.equal(byPath['/api/users']!.timeoutMs, 30_000);
  assert.deepEqual(byPath['/api/users']!.rateLimit, { requests: 30, windowMs: 60_000, strategy: 'sliding_window', per: 'ip' });

  assert.equal(byPath['/api/orders']!.timeoutMs, 5_000);
  assert.deepEqual(byPath['/api/orders']!.rateLimit, { requests: 10, windowMs: 10_000, strategy: 'fixed_window', per: 'ip' });

  assert.equal(byPath['/api/products']!.timeoutMs, 10_000);
  assert.equal(byPath['/api/products']!.stripPrefix, true);
  assert.deepEqual(byPath['/api/products']!.upstream, {
    kind: 'balanced',
    balance: 'weighted_round_robin',
    targets: [{ url: 'http://localhost:3003', weight: 3 }, { url: 'http://localhost:3004', weight: 1 }],
  });
  assert.deepEqual(byPath['/api/products']!.rateLimit, cfg.globalRateLimit);

  assert.equal(byPath['/api/legacy']!.stripPrefix, true);
  assert.equal(byPath['/api/legacy']!.timeoutMs, 30_000);
  assert.deepEqual(byPath['/api/internal']!.rateLimit, cfg.globalRateLimit);
});

test('resolves a structurally different valid config', () => {
  const cfg = loadConfig(alt);
  assert.equal(cfg.port, 9090);
  assert.equal(cfg.globalTimeoutMs, 120_000);
  assert.deepEqual(cfg.globalRateLimit, { requests: 5, windowMs: 1_000, strategy: 'sliding_window', per: 'global' });

  const search = cfg.routes[0]!;
  assert.equal(search.stripPrefix, true);
  assert.equal(search.timeoutMs, 500);
  assert.deepEqual(search.upstream, {
    kind: 'balanced',
    balance: 'round_robin',
    targets: [{ url: 'http://localhost:4001', weight: 1 }, { url: 'http://localhost:4002', weight: 1 }],
  });
  assert.deepEqual(search.rateLimit, cfg.globalRateLimit);

  const ping = cfg.routes[1]!;
  assert.deepEqual(ping.methods, ['GET', 'HEAD']);
  assert.equal(ping.stripPrefix, false);
  assert.equal(ping.timeoutMs, 120_000);
  assert.deepEqual(ping.upstream, { kind: 'single', url: 'http://localhost:4003' });
});
