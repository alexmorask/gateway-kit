# Product Specification — GatewayKit

The complete desired product. This is *what GatewayKit is and does*, not what
fits the 2-hour clock — scope trimming happens at `/plan-roadmap`. Requirements
are stated as observable behaviors; each carries its acceptance criteria (the
future tests and demo script).

## Purpose

GatewayKit is a lightweight, config-driven API gateway: a single process that
sits between clients and a set of upstream HTTP services. It reads a `gateway.yaml`
whose schema *is* the specification, and for every incoming request it applies a
pipeline of policies — routing, method filtering, authentication, rate limiting,
transformation, and resilience — before proxying to an upstream and returning the
response. The config is data: any valid file following the schema must work, with
no code changes. It solves the problem of putting consistent cross-cutting policy
in front of many services without coupling that policy to each service's code.

## Requirements

Each requirement is an observable behavior with its acceptance criteria.

### R1 — Startup from config
Reads a YAML config path from a CLI argument or environment variable and starts
an HTTP server on the config's `gateway.port`.
- **A:** `node <entry> <path>` (and the env-var form) binds the configured port;
  arg takes precedence over env var.
- **A:** A missing/unreadable config or one that violates the schema exits
  non-zero with a clear message, never a stack trace or a half-started server.
- **A:** Any valid config following the schema loads — verified against a second,
  unseen config, not only the sample.

### R2 — Health endpoint
`GET /health` always returns gateway liveness, independent of config and routes.
- **A:** `200` with `{"status":"healthy","uptime_seconds":<int>}`; the integer
  grows with process uptime. Present even if `routes` is empty; not intercepted by
  any configured route or policy.

### R3 — Routing & basic proxy
Forwards a request that matches a configured route to that route's upstream and
returns the upstream's response verbatim (status, headers, body).
- **A:** A matched request reaches the upstream with method, path, headers, and
  body intact; the client receives the upstream's status/headers/body.
- **A:** No matching route → `404`.
- **A:** Longest-prefix wins when multiple route paths match.

### R4 — Method filtering
Rejects methods not listed for a matched route.
- **A:** A method not in the route's `methods` → `405`; a listed method proceeds.

### R5 — Prefix stripping
Honors `strip_prefix` when forwarding.
- **A:** `strip_prefix: true` on `/api/products` forwards `/api/products/123` as
  `/123`; `false` forwards the full path unchanged.

### R6 — Rate limiting
Enforces per-route or global rate limits, keyed per client IP or globally, using
the configured window strategy.
- **A:** Requests beyond `requests` within `window` → `429`; the route's own
  `rate_limit` overrides `gateway.global_rate_limit`.
- **A:** `fixed_window` and `sliding_window` strategies both enforced; `per: ip`
  buckets by client IP, `per: global` shares one bucket.
- **A:** Under concurrent load (e.g. 50 simultaneous requests) the accept/reject
  count is correct — no over-admission from races.

### R7 — Timeouts
Applies an upstream request timeout, per-route overriding global.
- **A:** An upstream slower than the effective timeout is abandoned and the client
  gets a gateway timeout (`504`); a within-timeout response passes through.

### R8 — Retries
Retries idempotent upstream failures per the route's `retry` policy.
- **A:** An upstream response whose status is in `retry.on` triggers up to
  `attempts` retries with `fixed` or `exponential` backoff from `initial_delay`;
  a success within the budget is returned; exhaustion returns the last response.

### R9 — Load balancing
Distributes across multiple `upstream.targets` by the configured `balance`.
- **A:** `round_robin` cycles targets evenly; `weighted_round_robin` distributes
  in proportion to `weight` over a full cycle.

### R10 — Active health checks
Polls each target's `health_check.path` and removes unhealthy targets from
rotation.
- **A:** A target failing `unhealthy_threshold` consecutive checks is skipped for
  balancing; it returns to rotation when checks pass again.

### R11 — Request transformation
Rewrites the outbound request per `request_transform` before forwarding.
- **A:** Header `add` (including `$request_time`) and `remove` applied; body
  `mapping` restructures fields by dot-path, with `$literal:` and `$request_time`
  tokens resolved.

### R12 — Response transformation
Rewrites the response per `response_transform` before returning.
- **A:** Header `add`/`remove` applied; body `envelope` wraps the upstream body at
  `$body` with `$response_time` / `$route_path` tokens resolved.

### R13 — API-key authentication
Enforces `auth: api_key` on protected routes.
- **A:** A request missing the configured header or presenting a key not in `keys`
  → `401`; a valid key proceeds. (The key is not forwarded unless the config says
  to keep it.)

### R14 — Circuit breaker
Trips a route's breaker after repeated upstream failures and short-circuits while
open.
- **A:** After `threshold` failures within `window` the breaker opens; while open,
  requests return `503` with `{"error":"service_unavailable","retry_after":<s>}`
  without hitting the upstream; after `cooldown` it half-opens and retries.

### R15 — Resilient upstream failures
Handles an upstream that is down, unreachable, or erroring without crashing.
- **A:** A refused/unreachable upstream yields `502` (or `504` on timeout); the
  gateway stays up and continues serving other routes.

### R16 — Structured request logging
Emits one structured JSON log line per request with a correlation id.
- **A:** Each request logs one JSON line including a generated correlation id,
  method, path, matched route, upstream, status, and latency; the id is available
  to downstream handling.

## Non-goals (permanent product boundaries — never built)

- **No TLS termination.** Gateway speaks plain HTTP; TLS is the LB's job.
- **No distributed / shared state.** Rate-limit buckets, breaker counts, and
  balancing cursors are per-process in-memory only — not coordinated across
  instances.
- **No config hot-reload.** Config is read once at startup; changing it means a
  restart.
- **No auth beyond API key.** No JWT, OAuth, session, or mTLS.
- **No admin/management surface beyond `GET /health`.** No dynamic route CRUD, no
  metrics endpoint, no dashboard.
- **No protocol translation or streaming upgrades.** No WebSocket/SSE upgrade
  proxying, gRPC, or HTTP/2-specific features; request/response HTTP proxying only.
- **No persistence.** Nothing is written to disk or a database.
