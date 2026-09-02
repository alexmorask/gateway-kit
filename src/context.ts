import type { IncomingHttpHeaders } from 'node:http';
import type { RouteConfig } from './config/types.ts';

export interface GatewayResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

export interface RequestContext {
  correlationId?: string;
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
  route: RouteConfig;
  response?: GatewayResponse;
}
