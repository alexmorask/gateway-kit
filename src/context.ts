import type { IncomingHttpHeaders } from 'node:http';
import type { RouteConfig } from './config/types.ts';

export interface GatewayResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string | string[]> = {},
): GatewayResponse {
  return {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: Buffer.from(JSON.stringify(body)),
  };
}

export interface RequestContext {
  correlationId?: string;
  clientIp: string;
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
  route: RouteConfig;
  response?: GatewayResponse;
}
