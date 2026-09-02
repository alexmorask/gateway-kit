import type { ResolvedRateLimit } from '../config/types.ts';

export interface RateDecision {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string, limit: ResolvedRateLimit, now: number): RateDecision;
}

interface FixedBucket {
  count: number;
  windowStart: number;
}

const ALLOWED: RateDecision = { allowed: true, retryAfterMs: 0 };

export function createRateLimiter(): RateLimiter {
  const fixedBuckets = new Map<string, FixedBucket>();
  const slidingBuckets = new Map<string, number[]>();

  function checkFixed(key: string, limit: ResolvedRateLimit, now: number): RateDecision {
    const existing = fixedBuckets.get(key);
    const bucket = existing && now - existing.windowStart < limit.windowMs
      ? existing
      : { count: 0, windowStart: now };
    fixedBuckets.set(key, bucket);
    if (bucket.count < limit.requests) {
      bucket.count += 1;
      return ALLOWED;
    }
    return { allowed: false, retryAfterMs: bucket.windowStart + limit.windowMs - now };
  }

  function checkSliding(key: string, limit: ResolvedRateLimit, now: number): RateDecision {
    const cutoff = now - limit.windowMs;
    const recent = (slidingBuckets.get(key) ?? []).filter((t) => t > cutoff);
    slidingBuckets.set(key, recent);
    if (recent.length < limit.requests) {
      recent.push(now);
      return ALLOWED;
    }
    return { allowed: false, retryAfterMs: recent[0]! + limit.windowMs - now };
  }

  return {
    check(key, limit, now) {
      return limit.strategy === 'sliding_window'
        ? checkSliding(key, limit, now)
        : checkFixed(key, limit, now);
    },
  };
}
