import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { GatewayConfig } from './config/types.ts';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

export function createGateway(_config: GatewayConfig): Server {
  const startedAt = Date.now();

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, {
        status: 'healthy',
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });
}
