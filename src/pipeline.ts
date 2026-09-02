import type { RequestContext } from './context.ts';
import type { RouteConfig } from './config/types.ts';
import { logging } from './middleware/logging.ts';
import { rateLimitMiddleware } from './middleware/rateLimit.ts';
import { withRetry } from './middleware/retry.ts';
import { proxy } from './proxy.ts';
import type { RateLimiter } from './rateLimit/store.ts';

export interface PipelineDeps {
  rateLimiter: RateLimiter;
}

export type Middleware = (ctx: RequestContext, next: () => Promise<void>) => Promise<void>;

export function compile(middlewares: Middleware[]): (ctx: RequestContext) => Promise<void> {
  return (ctx) => {
    let lastCalled = -1;
    const dispatch = (index: number): Promise<void> => {
      if (index <= lastCalled) return Promise.reject(new Error('next() called more than once'));
      lastCalled = index;
      const middleware = middlewares[index];
      if (!middleware) return Promise.resolve();
      return middleware(ctx, () => dispatch(index + 1));
    };
    return dispatch(0);
  };
}

export function assembleMiddleware(route: RouteConfig, deps: PipelineDeps): Middleware[] {
  const middlewares: Middleware[] = [logging];
  if (route.rateLimit) middlewares.push(rateLimitMiddleware(deps.rateLimiter));
  middlewares.push(route.retry ? withRetry(proxy, route.retry) : proxy);
  return middlewares;
}
