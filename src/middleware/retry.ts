import { GatewayError } from '../errors.ts';
import type { Middleware } from '../pipeline.ts';
import type { RetryConfig } from '../config/types.ts';

type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attemptNumber: number, retry: RetryConfig): number {
  return retry.backoff === 'exponential'
    ? retry.initialDelayMs * 2 ** (attemptNumber - 1)
    : retry.initialDelayMs;
}

export function withRetry(attempt: Middleware, retry: RetryConfig, sleep: Sleep = realSleep): Middleware {
  return async (ctx, next) => {
    for (let attemptNumber = 1; attemptNumber <= retry.attempts; attemptNumber += 1) {
      const isLast = attemptNumber === retry.attempts;
      try {
        await attempt(ctx, next);
      } catch (err) {
        if (isLast || !(err instanceof GatewayError) || !retry.on.includes(err.status)) throw err;
        await sleep(backoffMs(attemptNumber, retry));
        continue;
      }
      if (isLast || !retry.on.includes(ctx.response!.status)) return;
      await sleep(backoffMs(attemptNumber, retry));
    }
  };
}
