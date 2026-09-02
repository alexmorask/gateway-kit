import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { matchRoute } from './router.ts';
import { assembleMiddleware, compile, type PipelineDeps } from './pipeline.ts';
import { createRateLimiter } from './rateLimit/store.ts';
import { createTargetSelector } from './upstream/select.ts';
import { GatewayError } from './errors.ts';
import type { GatewayConfig, RouteConfig } from './config/types.ts';
import type { RequestContext } from './context.ts';

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function collectBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createGateway(config: GatewayConfig): Server {
  const startedAt = Date.now();
  const deps: PipelineDeps = { rateLimiter: createRateLimiter(), selector: createTargetSelector() };
  const pipelines = new Map<RouteConfig, (ctx: RequestContext) => Promise<void>>();
  for (const route of config.routes) {
    pipelines.set(route, compile(assembleMiddleware(route, deps)));
  }

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (method === 'GET' && url === '/health') {
      sendJson(res, 200, { status: 'healthy', uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) });
      return;
    }

    const match = matchRoute(config.routes, method, url);
    if (match.kind === 'not_found') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    if (match.kind === 'method_not_allowed') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { allow: match.allow.join(', ') });
      return;
    }

    const ctx: RequestContext = {
      clientIp: req.socket.remoteAddress ?? 'unknown',
      method: method.toUpperCase(),
      url,
      headers: req.headers,
      body: await collectBody(req),
      route: match.route,
    };

    try {
      await pipelines.get(match.route)!(ctx);
    } catch (err) {
      const status = err instanceof GatewayError ? err.status : 502;
      const code = err instanceof GatewayError ? err.code : 'bad_gateway';
      sendJson(res, status, { error: code });
      return;
    }

    const response = ctx.response;
    if (!response) {
      sendJson(res, 502, { error: 'bad_gateway' });
      return;
    }
    res.writeHead(response.status, response.headers);
    res.end(response.body);
  });
}
