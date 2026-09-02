import type { RequestContext } from './context.ts';
import type { RouteConfig } from './config/types.ts';
import { logging } from './middleware/logging.ts';
import { proxy } from './proxy.ts';

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

export function assembleMiddleware(_route: RouteConfig): Middleware[] {
  return [logging, proxy];
}
