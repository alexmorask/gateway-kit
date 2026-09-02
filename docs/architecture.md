# Architecture — GatewayKit

Living spec. Updated as the build proceeds; source of truth for how the system
is intended to work. Designed to satisfy `docs/product-spec.md` — a requirement
counts as met only once the code and its tests land.

## Mental model

A reverse proxy that is a **per-route pipeline of middleware**. Every request
flows through an onion of small, single-purpose middleware; the proxy to the
upstream is the innermost layer. Each route's pipeline is **compiled once at
startup** from only the policies that route declares. Config is data; adding a
feature means adding one middleware at one seam.

## The seam

```ts
type Middleware = (ctx: RequestContext, next: () => Promise<void>) => Promise<void>
```

Every cross-cutting concern is a `Middleware`.
- **Short-circuit** — don't call `next`; set `ctx.response` (401 / 429 / 503).
- **Wrap-around** — do work before *and* after `await next()` (retry, timing,
  response transform).

Composition (`compile(route)`): `reduceRight` the route's middleware array into a
single `() => Promise<void>` so the first listed runs outermost.

```
[ logging, circuitBreaker, auth, rateLimit, requestTransform,
  timeout, retry, proxy, responseTransform ]
```

Only the middleware a route actually declares are included; `proxy` is always the
innermost terminal (it never calls `next`).

## Components

| Component | Does | Depends on |
| --- | --- | --- |
| `config/load` | Read file, parse YAML | YAML dep |
| `config/validate` | Schema → typed `GatewayConfig`; merge global→route defaults; strict on implemented fields, lenient on not-yet-built blocks (see decision #5); clear error + non-zero exit on bad input | duration |
| `server` | `http.createServer`, bind `gateway.port`, lifecycle; answer `/health` directly; else hand to router + pipeline; top-level error boundary | config, router, pipeline |
| `router` | `match(method, path)` → matched route \| 404 \| 405; longest-prefix wins | config |
| `pipeline/compile` | Build a route's onion from its declared policies | middleware units |
| `middleware/*` | `auth`, `rateLimit`, `requestTransform`, `responseTransform`, `timeout`, `retry`, `circuitBreaker`, `logging` — each a `Middleware` | context, stores |
| `proxy` | Innermost: rewrite Host, strip hop-by-hop headers, build the upstream request via Node `http`/`https`, buffer the response into `ctx` (decision #6) | upstream select |
| `upstream/select` | round-robin / weighted target selection | — |
| `upstream/health` | Active health checks; remove/restore targets | — |
| `upstream/breaker` | Circuit-breaker state per route | — |
| `rateLimit/store` | In-memory fixed/sliding buckets; synchronous `check()` so concurrent admission is exact (decisions #3, #9) | — |
| `middleware/rateLimit` | Keys by `route.path`+client (ip or global), 429 + `Retry-After` over the store | rateLimit/store |
| `duration` | Parse config duration strings (`"30s"`, `"1m"`, `"2h"`) → ms; one shared, tested utility | — |
| `context` | `RequestContext`: correlation id, mutable request parts, response holder, timing | — |
| `errors` | Typed `GatewayError(status, code)` | — |
| `middleware/logging` | Outermost middleware: correlation id (+ `x-correlation-id` header), one structured JSON line per routed request, always via `finally` (decision #8) | context |

## Request flow

```
client → http.createServer
           ├─ GET /health ───────────────► 200 {status,uptime}   (bypasses pipeline)
           ▼
         Router.match(method,path)
           ├─ no path ───► 404      ├─ wrong method ───► 405
           ▼ matched route
         RequestContext { corrId, req, route, timing }
           ▼
         compiled onion for this route:
           logging ▸ breaker ▸ auth ▸ rateLimit ▸ reqTransform
                   ▸ timeout+retry ▸ [ proxy: LB→upstream ] ▸ respTransform
           (short-circuit any layer: 401 / 429 / 503 / 504 / 502)
           ▼
         response → client
           ▼
         logging middleware writes one JSON line (corrId, status, latency)
```

## Error handling

Middleware throw a typed `GatewayError(status, code)`. The server boundary
try/catches everything → clean JSON body, never a stack trace, and one log line.
Mapping: upstream refused/unreachable → **502**; upstream timeout → **504**;
breaker open → **503** `{"error":"service_unavailable","retry_after":<s>}`;
auth fail → **401**; rate limit → **429**; unexpected → **500**. A bad upstream
never crashes the gateway.

## Concurrency

Single Node process, single-threaded event loop. Rate-limit check-and-increment
and breaker state updates are synchronous, so they are atomic with respect to
concurrent requests — no over-admission under 50 simultaneous requests without
locks. State is in-memory and per-process (see product non-goals).

## Testing strategy

- **Unit (pure logic):** config validation, router matching + precedence,
  rate-limit buckets (fixed/sliding), backoff math, target selection
  (round-robin/weighted), transform mapping + token resolution.
- **Integration (wired system):** run the gateway against an in-repo mock
  upstream — `/health`, proxy round-trip, 404/405, method filter, 429 under
  burst, 504 on slow upstream, 502 on down upstream.
- Scaffolding (manifest, tsconfig, scripts) is proven by running, not test-first.

## Cost of each requirement

Input for `/plan-roadmap`. Effort/risk are relative, under the 2-hour clock.

| Req | Feature | Effort | Risk | Depends on |
| --- | --- | --- | --- | --- |
| R1 | Startup from config | M | Med (YAML on unseen config) | YAML dep, validate, duration |
| — | Duration parser (`s`/`m`/`h` → ms) | XS | Low (shared correctness risk) | — |
| R2 | `/health` | XS | Low | server |
| R3 | Routing & basic proxy | M | Med (stdlib proxy correctness) | server, router, proxy |
| R4 | Method filter (405) | XS | Low | router |
| R5 | strip_prefix | XS | Low | proxy |
| R16 | Structured logging + corr id | S | Low | context, seam |
| R6 | Rate limiting (fixed→sliding, ip/global) | M | Med (concurrency, correctness) | store, seam |
| R7 | Timeouts | S | Low | proxy |
| R8 | Retries (fixed/exp backoff) | M | Med (wrap proxy, idempotency) | seam, proxy |
| R15 | Resilient upstream failures (502/504) | S | Low | proxy, errors |
| R13 | API-key auth (401) | S | Low | seam |
| R9 | Load balancing (rr/weighted) | M | Low | upstream/select |
| R11 | Request transform (headers/body/tokens) | M | Med (body dot-path, tokens) | seam |
| R12 | Response transform (headers/envelope) | M | Med | seam |
| R14 | Circuit breaker | M | Med (state machine) | breaker, seam |
| R10 | Active health checks | M | Med (timers, lifecycle) | upstream/health |

## Component / directory layout (intended)

```
src/
  config/      load.ts, validate.ts, types.ts
  server.ts
  router.ts
  pipeline.ts
  context.ts
  errors.ts
  middleware/  logging, auth, rateLimit, requestTransform,
               responseTransform, timeout, retry, circuitBreaker
  proxy.ts
  upstream/    select.ts, health.ts, breaker.ts
  rateLimit/   store.ts
test/          unit + integration
mock/          mock upstream server
```
