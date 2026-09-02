import { request as httpRequest, type IncomingHttpHeaders, type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { forwardPath } from './router.ts';
import { GatewayError } from './errors.ts';
import type { Middleware } from './pipeline.ts';
import type { GatewayResponse } from './context.ts';
import type { TargetSelector } from './upstream/select.ts';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function outboundHeaders(headers: IncomingHttpHeaders, host: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === 'host' || HOP_BY_HOP.has(lower)) continue;
    out[key] = value;
  }
  out.host = host;
  return out;
}

function responseHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

export function createProxy(selector: TargetSelector): Middleware {
  return (ctx) =>
  new Promise<void>((resolve, reject) => {
    const target = new URL(forwardPath(ctx.route, ctx.url), selector.next(ctx.route.path, ctx.route.upstream));
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ctx.route.timeoutMs);

    const settleWith = (settle: () => void): void => {
      clearTimeout(timer);
      settle();
    };

    const upstreamReq: ClientRequest = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: ctx.method,
        path: target.pathname + target.search,
        headers: outboundHeaders(ctx.headers, target.host),
        signal: controller.signal,
      },
      (upstreamRes) => {
        const chunks: Buffer[] = [];
        upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        upstreamRes.on('error', () => settleWith(() => reject(
          controller.signal.aborted
            ? new GatewayError(504, 'gateway_timeout')
            : new GatewayError(502, 'bad_gateway'))));
        upstreamRes.on('end', () => {
          const response: GatewayResponse = {
            status: upstreamRes.statusCode ?? 502,
            headers: responseHeaders(upstreamRes.headers),
            body: Buffer.concat(chunks),
          };
          ctx.response = response;
          settleWith(resolve);
        });
      },
    );

    upstreamReq.on('error', () => {
      settleWith(() =>
        reject(controller.signal.aborted
          ? new GatewayError(504, 'gateway_timeout')
          : new GatewayError(502, 'bad_gateway')));
    });
    if (ctx.body.length > 0) upstreamReq.write(ctx.body);
    upstreamReq.end();
  });
}
