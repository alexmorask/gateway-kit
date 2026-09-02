import { jsonResponse } from '../context.ts';
import type { Middleware } from '../pipeline.ts';
import type { RateLimiter } from '../rateLimit/store.ts';

export function rateLimitMiddleware(limiter: RateLimiter, now: () => number = Date.now): Middleware {
  return async (ctx, next) => {
    const limit = ctx.route.rateLimit;
    if (!limit) return next();

    const client = limit.per === 'ip' ? ctx.clientIp : 'global';
    const decision = limiter.check(`${ctx.route.path}|${client}`, limit, now());
    if (decision.allowed) return next();

    const retryAfter = Math.ceil(decision.retryAfterMs / 1000);
    ctx.response = jsonResponse(429, { error: 'rate_limited', retry_after: retryAfter }, { 'retry-after': String(retryAfter) });
  };
}
