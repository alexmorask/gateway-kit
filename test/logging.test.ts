import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loggingMiddleware, type LogEntry } from '../src/middleware/logging.ts';
import type { RequestContext } from '../src/context.ts';
import type { RouteConfig } from '../src/config/types.ts';

const route: RouteConfig = {
  path: '/api/users',
  methods: ['GET'],
  stripPrefix: false,
  upstream: { kind: 'single', url: 'http://localhost:3001' },
  timeoutMs: 1000,
};

function ctx(): RequestContext {
  return { method: 'GET', url: '/api/users?page=2', headers: {}, body: Buffer.alloc(0), route };
}

test('emits one structured entry with request detail and a correlation id', async () => {
  const entries: LogEntry[] = [];
  const c = ctx();
  await loggingMiddleware((e) => entries.push(e))(c, async () => {
    c.response = { status: 200, headers: {}, body: Buffer.alloc(0) };
  });

  assert.equal(entries.length, 1);
  const entry = entries[0]!;
  assert.ok(entry.correlation_id.length > 0);
  assert.equal(entry.method, 'GET');
  assert.equal(entry.path, '/api/users?page=2');
  assert.equal(entry.route, '/api/users');
  assert.equal(entry.upstream, 'http://localhost:3001');
  assert.equal(entry.status, 200);
  assert.ok(Number.isInteger(entry.latency_ms) && entry.latency_ms >= 0);
});

test('exposes the correlation id on the response headers', async () => {
  const c = ctx();
  await loggingMiddleware(() => {})(c, async () => {
    c.response = { status: 200, headers: {}, body: Buffer.alloc(0) };
  });
  assert.equal(c.response!.headers['x-correlation-id'], c.correlationId);
  assert.ok(c.correlationId && c.correlationId.length > 0);
});

test('gives each request a distinct correlation id', async () => {
  const ids = new Set<string>();
  const run = async () => {
    const c = ctx();
    await loggingMiddleware(() => {})(c, async () => {
      c.response = { status: 200, headers: {}, body: Buffer.alloc(0) };
    });
    ids.add(c.correlationId!);
  };
  await run();
  await run();
  assert.equal(ids.size, 2);
});

test('still logs and re-throws when the inner pipeline fails', async () => {
  const entries: LogEntry[] = [];
  const c = ctx();
  await assert.rejects(
    loggingMiddleware((e) => entries.push(e))(c, async () => {
      throw new Error('upstream boom');
    }),
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.status, 502);
});
