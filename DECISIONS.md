# DECISIONS — GatewayKit

The narrative behind the build: how features were prioritized, how the system is
shaped and why, what would come next, and how AI tooling was used. The
fork-by-fork log with full Decision / Rationale / Tradeoff / Rejected detail lives
in [`docs/decisions.md`](docs/decisions.md); this is the reader's guide to it.

## How features were prioritized

The config is intentionally larger than fits two hours, so the order was chosen to
guarantee a passing, coherent submission at every step rather than a wide, brittle
one.

1. **Core requirements first, as a walking skeleton.** Config load/validate +
   `/health` (T1), then routing + proxying + 404/405 + `strip_prefix` (T2). After
   T2 the five non-negotiable requirements passed end-to-end — the floor for a
   passing submission — so everything after is additive, never load-bearing for
   the baseline.
2. **The seam, proven early.** Structured logging + correlation id (T3) was
   deliberately ordered *before* the feature tickets, to prove the middleware seam
   carries a second concern with one line of wiring — so the feature work that
   piled on afterward was known to be cheap.
3. **Resilience over breadth.** Rate limiting (T4), timeouts + resilient failures
   (T5), retries (T6). These target the failure modes the brief names explicitly —
   50 concurrent requests, upstream down, upstream slow — which is the 25%
   "production thinking" axis. Rate limiting came first because the concurrency
   scenario is the marquee one.
4. **Backlog pulled only after core landed early.** API-key auth and load
   balancing were pulled from backlog once the core was done ahead of schedule,
   in value-per-risk order (auth is a cheap clean 401; load balancing was
   self-contained and retired an interim limitation).

"A few features built cleanly beats many half-built" was the governing rule: every
shipped feature has unit + integration tests and was verified end-to-end against
the real `gateway.yaml`.

## Architecture & trade-offs

**Mental model: a reverse proxy that is a per-route pipeline of middleware.** Each
request runs through an onion of small `(ctx, next) => Promise<void>` middleware,
with the proxy as the innermost terminal. Each route's pipeline is compiled once
at startup from only the policies that route declares:

```
[ logging, rateLimit?, auth?, (retry(proxy) | proxy) ]
```

**Why this shape — extensibility.** Every cross-cutting concern attaches at one
seam. Adding a config feature is adding one middleware plus one line in
`assembleMiddleware` — no changes to the server, router, or other middleware. This
was demonstrated repeatedly: logging, rate limiting, auth, and load balancing each
went in without touching unrelated code. "Another engineer could add a feature in
an afternoon" is literally how the last four features were built.

The load-bearing trade-offs (full reasoning in `docs/decisions.md`):

- **Small YAML dependency, not a hand-rolled parser** (#1). The gateway must load
  *any* valid config in the schema; a hand-rolled parser that chokes on the
  graders' unseen file fails a core requirement. The challenge permits a parser,
  so the one dependency is worth it.
- **In-memory, single-process state** (#3). Rate-limit buckets, balancer cursors,
  and (would-be) breaker counts live in this process. Node's single-threaded event
  loop makes rate-limit check-and-increment atomic, so 50 concurrent requests
  admit *exactly* the limit with no locks. Trade-off: limits are per-instance, not
  coordinated across a fleet.
- **Timeout and retry are proxy-invocation concerns, not standalone rings** (#10,
  #12). A timeout must abort the socket, so it lives inside the proxy; retry
  *wraps* the proxy as the terminal. A useful emergent result: because retry
  re-invokes the proxy and the balancer cursor advances each call, **retries
  naturally fail over to the next upstream target** (#14).
- **Typed error taxonomy** (#10). Upstream failures become `GatewayError(status,
  code)` — `502` refused, `504` timeout — mapped once at the server boundary and
  read by the logger, so the access log matches what the client received.
- **Lenient config validation** (#5). The validator strictly checks the fields the
  implemented features use and passes over blocks for not-yet-built features, so a
  config exercising a deferred feature still boots and serves its other routes.
- **Security-conscious defaults** (#9, #13). Rate limiting keys on the socket peer,
  not spoofable `X-Forwarded-For`; rate limiting runs *before* auth so key
  brute-forcing is throttled; the API key is stripped before forwarding upstream.

**Testing discipline worth calling out** (#11): config parsing is verified against
the *actual* `gateway.yaml` and a second, structurally different config — not just
hand-built fixtures. This was added after a real bug (per-route `timeout` is nested
under `upstream`, but the code initially read it at the route level; the unit test
had encoded the same wrong assumption, so it passed while wrong). Anchoring tests
to the real spec artifact is how that class of schema-shape bug gets caught.

## What we'd build next (ranked)

From [`docs/roadmap.md`](docs/roadmap.md), in value-per-risk order:

1. **Circuit breaker** (config `circuit_breaker`). A per-route state machine
   (closed → open after N failures in a window → half-open after cooldown →
   closed/open), returning `503 {error:"service_unavailable", retry_after}` while
   open. ~20–25 min: needs a time-based state store with an injectable clock, a
   decision on what counts as a "failure," and half-open trial semantics. Slots in
   as one more outer middleware on the existing seam.
2. **Request/response transforms** (config `request_transform`/`response_transform`).
   Header add/remove is trivial; the effort is the body work — dot-path field
   mapping, response enveloping, and a `$token` resolver (`$request_time`,
   `$literal:`, `$body`, `$response_time`, `$route_path`). Highest-risk item; would
   land as two middleware (request-side and response-side) around the proxy.
3. **Active health checks** (config `health_check`). Background polling of each
   target's health path, removing unhealthy targets from the balancer's rotation.
   Needs timer lifecycle management and pairs with load balancing.
4. **Hardening carried in the decision log** (`docs/decisions.md` #15 + entries):
   positive-integer validation of numeric config fields (`weight: 0` currently
   makes the balancer fall back to the first target), a request-body size cap,
   eviction/TTL for fixed-window rate-limit buckets, trusted-proxy
   `X-Forwarded-For` support (so `per: ip` works behind a load balancer),
   constant-time API-key comparison, per-API-key rate limiting, a gateway-wide
   option for `per: global` (currently per-route), and server-boundary logging of
   404/405 for total ingress visibility.

A pre-finalize multi-agent review (code, tests, error handling, type design)
caught and fixed one real crash — an unhandled rejection when a client resets a
connection mid-upload — plus a timeout-vs-502 misclassification; both are covered
by new tests. The items above are the review's remaining non-critical findings,
kept honest here rather than silently carried.

## Partial features

**None.** Everything listed as implemented is fully built, tested, and verified
end-to-end. Deferred features (circuit breaker, transforms, health checks) are
*unimplemented* — their config blocks are validated leniently so any valid config
still boots, but no half-built code ships claiming to be done.

## AI tool usage

This build was done with Claude Code (Opus), used deliberately as an orchestrated,
phased collaborator rather than an autocomplete:

- **A phased workflow with human checkpoints.** Intake → product spec →
  architecture → roadmap → per-ticket implementation → finalize, each a distinct
  step that stopped for human sign-off. The planning trail was committed *before*
  any code so the git history shows the reasoning landed first.
- **Test-driven throughout.** Each behavior ticket was red → green → refactor;
  scaffolding was proven by running, not by fabricated tests. Every "done" claim
  was backed by running the suite and the gateway, not asserted.
- **The human drove prioritization and caught issues.** Scope calls (lean vs. full
  workflow, which backlog to pull, stopping before the circuit breaker to protect
  deliverables) were human decisions. A human question ("how do we honor per-route
  timeout?") surfaced the `upstream.timeout` nesting bug; another ("are other
  tests complicit?") drove the real-config fidelity tests.
- **Decisions recorded as they were made** in `docs/decisions.md`, so this
  document and the walkthrough rest on a contemporaneous log, not reconstruction.
- **Quality passes via tooling** — a `/simplify` reuse pass (extracted the
  `jsonResponse` helper) and a multi-agent review before finalizing.

Every line is explainable; nothing was accepted without understanding it.
