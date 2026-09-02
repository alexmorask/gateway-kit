import type { RequestContext } from './context.ts';
import type { RouteConfig } from './config/types.ts';
import { logging } from './middleware/logging.ts';
import { rateLimitMiddleware } from './middleware/rateLimit.ts';
import { authMiddleware } from './middleware/auth.ts';
import { withRetry } from './middleware/retry.ts';
import { createProxy } from './proxy.ts';
import type { RateLimiter } from './rateLimit/store.ts';
import type { TargetSelector } from './upstream/select.ts';

export interface PipelineDeps {
  rateLimiter: RateLimiter;
  selector: TargetSelector;
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
  const proxy = createProxy(deps.selector);
  const middlewares: Middleware[] = [logging];
  if (route.rateLimit) middlewares.push(rateLimitMiddleware(deps.rateLimiter));
  if (route.auth) middlewares.push(authMiddleware);
  middlewares.push(route.retry ? withRetry(proxy, route.retry) : proxy);
  return middlewares;
}
