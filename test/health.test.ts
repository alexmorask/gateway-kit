import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createGateway } from '../src/server.ts';
import type { GatewayConfig } from '../src/config/types.ts';

const config: GatewayConfig = { port: 0, globalTimeoutMs: 30_000, routes: [] };

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const server = createGateway(config);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GET /health returns 200 with status and integer uptime', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; uptime_seconds: number };
    assert.equal(body.status, 'healthy');
    assert.equal(typeof body.uptime_seconds, 'number');
    assert.ok(Number.isInteger(body.uptime_seconds));
  });
});

test('unmatched requests return 404', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});
