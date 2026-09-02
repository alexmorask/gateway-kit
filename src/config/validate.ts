import { parseDuration } from './duration.ts';
import type {
  BalanceStrategy,
  GatewayConfig,
  RateLimitScope,
  RateLimitStrategy,
  ResolvedRateLimit,
  RouteConfig,
  Target,
  Upstream,
} from './types.ts';

class ConfigError extends Error {}

function fail(message: string): never {
  throw new ConfigError(message);
}

function asObject(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${at} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, at: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${at} must be a non-empty string`);
  return value;
}

function asNumber(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${at} must be a number`);
  return value;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], at: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(`${at} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function resolveRateLimit(raw: unknown, at: string): ResolvedRateLimit {
  const obj = asObject(raw, at);
  return {
    requests: asNumber(obj.requests, `${at}.requests`),
    windowMs: parseDuration(asString(obj.window, `${at}.window`)),
    strategy: asEnum<RateLimitStrategy>(obj.strategy, ['fixed_window', 'sliding_window'], `${at}.strategy`),
    per: asEnum<RateLimitScope>(obj.per, ['ip', 'global'], `${at}.per`),
  };
}

function resolveUpstream(raw: unknown, at: string): Upstream {
  const obj = asObject(raw, at);
  if (obj.targets !== undefined) {
    if (!Array.isArray(obj.targets) || obj.targets.length === 0) fail(`${at}.targets must be a non-empty array`);
    const targets: Target[] = obj.targets.map((t, i) => {
      const target = asObject(t, `${at}.targets[${i}]`);
      return {
        url: asString(target.url, `${at}.targets[${i}].url`),
        weight: target.weight === undefined ? 1 : asNumber(target.weight, `${at}.targets[${i}].weight`),
      };
    });
    return {
      kind: 'balanced',
      targets,
      balance: asEnum<BalanceStrategy>(obj.balance, ['round_robin', 'weighted_round_robin'], `${at}.balance`),
    };
  }
  return { kind: 'single', url: asString(obj.url, `${at}.url`) };
}

function resolveRoute(raw: unknown, at: string, globalTimeoutMs: number, globalRateLimit?: ResolvedRateLimit): RouteConfig {
  const obj = asObject(raw, at);
  const methods = obj.methods;
  if (!Array.isArray(methods) || methods.length === 0) fail(`${at}.methods must be a non-empty array`);
  const upstream = asObject(obj.upstream, `${at}.upstream`);
  return {
    path: asString(obj.path, `${at}.path`),
    methods: methods.map((m, i) => asString(m, `${at}.methods[${i}]`).toUpperCase()),
    stripPrefix: obj.strip_prefix === undefined ? false : Boolean(obj.strip_prefix),
    upstream: resolveUpstream(upstream, `${at}.upstream`),
    timeoutMs: upstream.timeout === undefined ? globalTimeoutMs : parseDuration(asString(upstream.timeout, `${at}.upstream.timeout`)),
    rateLimit: obj.rate_limit === undefined ? globalRateLimit : resolveRateLimit(obj.rate_limit, `${at}.rate_limit`),
  };
}

export function validateConfig(raw: unknown): GatewayConfig {
  const root = asObject(raw, 'config');
  const gateway = asObject(root.gateway, 'gateway');
  const globalTimeoutMs = gateway.global_timeout === undefined
    ? 30_000
    : parseDuration(asString(gateway.global_timeout, 'gateway.global_timeout'));
  const globalRateLimit = gateway.global_rate_limit === undefined
    ? undefined
    : resolveRateLimit(gateway.global_rate_limit, 'gateway.global_rate_limit');

  const rawRoutes = root.routes === undefined ? [] : root.routes;
  if (!Array.isArray(rawRoutes)) fail('routes must be an array');

  return {
    port: asNumber(gateway.port, 'gateway.port'),
    globalTimeoutMs,
    globalRateLimit,
    routes: rawRoutes.map((r, i) => resolveRoute(r, `routes[${i}]`, globalTimeoutMs, globalRateLimit)),
  };
}
