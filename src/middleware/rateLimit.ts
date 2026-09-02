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
    ctx.response = {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) },
      body: Buffer.from(JSON.stringify({ error: 'rate_limited', retry_after: retryAfter })),
    };
  };
}
