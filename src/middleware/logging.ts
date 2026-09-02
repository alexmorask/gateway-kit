import { randomUUID } from 'node:crypto';
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
    try {
      await next();
      if (ctx.response) ctx.response.headers['x-correlation-id'] = correlationId;
    } finally {
      sink({
        correlation_id: correlationId,
        method: ctx.method,
        path: ctx.url,
        route: ctx.route.path,
        upstream: upstreamLabel(ctx.route.upstream),
        status: ctx.response?.status ?? 502,
        latency_ms: Date.now() - startedAt,
      });
    }
  };
}

export const logging = loggingMiddleware();
