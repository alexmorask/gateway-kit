import { randomUUID } from 'node:crypto';
import { GatewayError } from '../errors.ts';
import type { Middleware } from '../pipeline.ts';
import type { Upstream } from '../config/types.ts';

export interface LogEntry {
  correlation_id: string;
  method: string;
  path: string;
  route: string;
  upstream: string;
  status: number;
  latency_ms: number;
}

export type LogSink = (entry: LogEntry) => void;

function upstreamLabel(upstream: Upstream): string {
  return upstream.kind === 'single'
    ? upstream.url
    : upstream.targets.map((t) => t.url).join(',');
}

function writeLine(entry: LogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export function loggingMiddleware(sink: LogSink = writeLine): Middleware {
  return async (ctx, next) => {
    const correlationId = randomUUID();
    ctx.correlationId = correlationId;
    const startedAt = Date.now();
    let status = 502;
    try {
      await next();
      status = ctx.response?.status ?? 502;
      if (ctx.response) ctx.response.headers['x-correlation-id'] = correlationId;
    } catch (err) {
      status = err instanceof GatewayError ? err.status : 502;
      throw err;
    } finally {
      sink({
        correlation_id: correlationId,
        method: ctx.method,
        path: ctx.url,
        route: ctx.route.path,
        upstream: upstreamLabel(ctx.route.upstream),
        status,
        latency_ms: Date.now() - startedAt,
      });
    }
  };
}

export const logging = loggingMiddleware();
