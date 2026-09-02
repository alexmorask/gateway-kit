export type RateLimitStrategy = 'fixed_window' | 'sliding_window';
export type RateLimitScope = 'ip' | 'global';
export type BalanceStrategy = 'round_robin' | 'weighted_round_robin';
export type BackoffStrategy = 'fixed' | 'exponential';

export interface RetryConfig {
  attempts: number;
  backoff: BackoffStrategy;
  initialDelayMs: number;
  on: number[];
}

export interface AuthConfig {
  type: 'api_key';
  header: string;
  keys: string[];
}

export interface ResolvedRateLimit {
  requests: number;
  windowMs: number;
  strategy: RateLimitStrategy;
  per: RateLimitScope;
}

export interface SingleUpstream {
  kind: 'single';
  url: string;
}

export interface Target {
  url: string;
  weight: number;
}

export interface BalancedUpstream {
  kind: 'balanced';
  targets: Target[];
  balance: BalanceStrategy;
}

export type Upstream = SingleUpstream | BalancedUpstream;

export interface RouteConfig {
  path: string;
  methods: string[];
  stripPrefix: boolean;
  upstream: Upstream;
  timeoutMs: number;
  rateLimit?: ResolvedRateLimit;
  retry?: RetryConfig;
  auth?: AuthConfig;
}

export interface GatewayConfig {
  port: number;
  globalTimeoutMs: number;
  globalRateLimit?: ResolvedRateLimit;
  routes: RouteConfig[];
}
