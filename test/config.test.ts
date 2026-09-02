import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config/validate.ts';

const base = () => ({
  gateway: {
    port: 8080,
    global_timeout: '30s',
    global_rate_limit: { requests: 100, window: '60s', strategy: 'fixed_window', per: 'ip' },
  },
  routes: [
    { path: '/api/users', methods: ['GET', 'POST'], strip_prefix: false, upstream: { url: 'http://localhost:3001' } },
  ],
});

test('resolves gateway fields and route defaults', () => {
  const cfg = validateConfig(base());
  assert.equal(cfg.port, 8080);
  assert.equal(cfg.globalTimeoutMs, 30_000);
  const route = cfg.routes[0]!;
  assert.equal(route.timeoutMs, 30_000);
  assert.deepEqual(route.rateLimit, { requests: 100, windowMs: 60_000, strategy: 'fixed_window', per: 'ip' });
  assert.equal(route.upstream.kind, 'single');
});

test('upstream-level timeout and route-level rate_limit override the global defaults', () => {
  const raw = base();
  (raw.routes[0] as any).upstream = { url: 'http://localhost:3001', timeout: '5s' };
  (raw.routes[0] as any).rate_limit = { requests: 10, window: '10s', strategy: 'sliding_window', per: 'global' };
  const route = validateConfig(raw).routes[0]!;
  assert.equal(route.timeoutMs, 5_000);
  assert.deepEqual(route.rateLimit, { requests: 10, windowMs: 10_000, strategy: 'sliding_window', per: 'global' });
});

test('accepts balanced upstream with targets', () => {
  const raw = base();
  (raw.routes[0] as any).upstream = {
    targets: [{ url: 'http://a', weight: 3 }, { url: 'http://b', weight: 1 }],
    balance: 'weighted_round_robin',
  };
  const upstream = validateConfig(raw).routes[0]!.upstream;
  assert.equal(upstream.kind, 'balanced');
});

test('rejects invalid configs', () => {
  assert.throws(() => validateConfig({}), /gateway/);
  assert.throws(() => validateConfig({ gateway: {}, routes: [] }), /port/);
  const badStrategy = base();
  (badStrategy.gateway.global_rate_limit as any).strategy = 'nope';
  assert.throws(() => validateConfig(badStrategy), /strategy/);
  const noUpstream = base();
  delete (noUpstream.routes[0] as any).upstream;
  assert.throws(() => validateConfig(noUpstream), /upstream/);
});
