import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../src/config/load.ts';
import { createGateway } from '../src/server.ts';
import { createMockUpstream } from '../mock/upstream.ts';
import type { GatewayConfig } from '../src/config/types.ts';

test('loadConfig throws a clear error for a missing file', () => {
  assert.throws(() => loadConfig('/no/such/config.yaml'), /cannot read config file/);
});

test('loadConfig throws a clear error for a schema-invalid config', () => {
  const path = fileURLToPath(new URL('./fixtures/no-port.yaml', import.meta.url));
  assert.throws(() => loadConfig(path), /port/);
});

let mock: Server;
let gateway: Server;
let port: number;
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
    routes: [{ path: '/echo', methods: ['GET', 'POST'], stripPrefix: false, upstream: { kind: 'single', url: mockBase }, timeoutMs: 2000 }],
  };
  gateway = createGateway(config);
  port = await listen(gateway);
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((r) => gateway.close(() => r()));
  await new Promise<void>((r) => mock.close(() => r()));
});

test('a client that resets mid-body does not crash the gateway', async () => {
  await new Promise<void>((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\n\r\npartial');
      socket.destroy();
      resolve();
    });
  });
  await new Promise((r) => setTimeout(r, 50));
  const res = await fetch(`${base}/echo`);
  assert.equal(res.status, 200);
});
