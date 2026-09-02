# Decisions — GatewayKit

Running fork-by-fork log. The graded root `DECISIONS.md` is authored at the end
from this log; keep this lean.

## 1. Take a small YAML dependency rather than hand-rolling a parser

**Decision:** Add one minimal, well-tested YAML parsing library for config
loading; keep it the only runtime dependency.
**Rationale:** The gateway must load *any* valid config following the schema —
graders test with an unseen file. A hand-rolled parser that mishandles an edge
case (quoting, nesting, anchors) fails a non-negotiable core requirement. The
challenge explicitly permits a YAML parser, so the risk is not worth taking.
**Tradeoff:** One dependency instead of zero; we own vetting it.
**Rejected:** Hand-rolled scoped parser — zero deps, but a single unhandled edge
case on the graders' config is a core-requirement failure under a 2-hour clock.

## 2. Per-route onion middleware as the pipeline model

**Decision:** Model the request path as a Koa-style onion of
`(ctx, next) => Promise<void>` middleware, composed once per route at startup from
only the policies that route declares. The proxy is the innermost terminal.
**Rationale:** Cross-cutting concerns (auth, rate limit, transforms, retry,
breaker, logging) attach at one seam. Wrap-around behavior falls out naturally —
retry wraps the proxy, response-transform wraps the response — instead of being
special cases. Adding a config feature is adding one middleware; this is the
extensibility story the rubric weights most (35%).
**Tradeoff:** An onion is marginally less obvious to read top-to-bottom than a
flat stage list, and closure composition adds a small indirection.
**Rejected:** Fixed linear stages with early-return — simpler to skim, but
retry-around-proxy and response-side transforms become awkward special cases
rather than natural uses of the model. Per-route hand-written handlers — most
explicit, least extensible; violates config-as-data.

## 3. In-memory, single-process state

**Decision:** Rate-limit buckets, circuit-breaker counts, and load-balancing
cursors live in this process's memory only, with no external store or
cross-instance coordination.
**Rationale:** The prompt says in-memory is fine and forbids a database. Node's
single-threaded event loop makes check-and-increment atomic across concurrent
requests, so correctness under 50 simultaneous requests needs no locks. Simplest
thing that satisfies the acceptance criteria.
**Tradeoff:** Limits are per-instance; running N gateways multiplies effective
limits. Not horizontally correct — stated as a permanent non-goal.
**Rejected:** Shared store (Redis-style) — correct across instances but adds a
dependency, infra, and network failure modes the challenge explicitly rules out.

## 4. Ship resilience depth over feature breadth; defer transforms, LB, breaker, health checks

**Decision:** Core build = the 5 non-negotiable requirements + structured logging
+ rate limiting + timeout/retry (tickets T1–T6). Auth, load balancing, circuit
breaker, request/response transforms, and active health checks go to backlog,
pulled only if core lands early.
**Rationale:** The prompt rewards a few clean features over many brittle ones and
weights production thinking 25% — rate-limit races, upstream-down, and timeouts
are the failure modes it explicitly names, so they earn their place ahead of
breadth features. Logging is ordered third, before the feature tickets, precisely
to prove the middleware seam carries a second concern cleanly.
**Tradeoff:** The visible feature count is lower; transforms and LB are the
config's most eye-catching bits and we ship none of them in core.
**Rejected:** Attempting all features — maximizes surface area but near-certain to
leave several half-built under the clock, which the rubric penalizes. Ordering a
breadth feature (e.g. transforms) into core ahead of resilience — more visible but
weaker on the graded failure-mode axis.

## 5. Lenient config validation: check what we use, ignore the rest

**Decision:** `validateConfig` strictly validates and resolves the fields the
implemented features consume (port, timeouts, rate limits, route core, upstream
shape) and passes over config blocks for features not yet built (retry, auth,
transforms, circuit_breaker, health_check) without rejecting them.
**Rationale:** The gateway must boot on *any* valid config in the schema, and we
ship features incrementally — a config exercising an unbuilt feature must still
start and serve its other routes rather than fail closed at load. Each feature
ticket adds strict validation for its own block as it lands.
**Tradeoff:** A typo inside an unimplemented block passes silently until that
feature is built, rather than being caught at startup.
**Rejected:** Strict whole-schema validation up front — catches every typo but
makes the gateway refuse configs that use any feature we haven't implemented yet,
breaking the "boots on any valid config" guarantee mid-build.

## 6. HTTP forwarding semantics: buffer bodies, rewrite Host, strip hop-by-hop

**Decision:** The proxy buffers the full request (and upstream response) body
before forwarding, rewrites the `Host` header to the upstream, strips hop-by-hop
headers (`connection`, `keep-alive`, `transfer-encoding`, `upgrade`, …) on both
legs, preserves the query string, and — for `strip_prefix` — forwards `/` when
the request path equals the route path exactly.
**Rationale:** Buffering is what lets later tickets transform request/response
bodies (R11/R12) and makes proxying a plain, testable `Buffer` in / `Buffer` out.
Host rewrite and hop-by-hop stripping are correct reverse-proxy behavior — hop-by-
hop headers describe a single connection and must not leak to the next hop.
**Tradeoff:** Buffering holds each body fully in memory, so a very large upload or
download costs proportional memory and loses streaming/backpressure. Acceptable
for this gateway's payload profile; streaming pass-through is future work.
**Rejected:** Streaming pass-through (pipe req→upstream→res) — constant memory and
true backpressure, but body transforms become far harder and the happy path more
complex; wrong trade for a config-driven gateway whose headline features
restructure bodies.

## 7. Balanced upstreams proxy to the first target until load balancing lands

**Superseded by #14** (load balancing shipped).

**Decision:** For an upstream declared with `targets`, the proxy currently forwards
to the first target; real `round_robin` / `weighted_round_robin` selection is
backlog ticket B2.
**Rationale:** Keeps the "boots and serves on any valid config" guarantee — a
route using `targets` still proxies successfully — without shipping a half-built
balancer. The selection seam (`baseUrl(upstream)`) is the single place B2 will
replace.
**Tradeoff:** Load is not distributed yet; a multi-target route hits only one
backend until B2.
**Rejected:** Refusing balanced upstreams until B2 — would break configs that use
`targets`. Shipping a rushed balancer now — risks a brittle feature ahead of the
prioritized resilience work.

## 8. Access logging lives on the pipeline seam (logs routed requests)

**Decision:** The correlation id and one-line access log are a `logging`
middleware at the outermost layer of the per-route onion. It generates the id,
sets it on `ctx` and as an `x-correlation-id` response header, times the request,
and logs once in a `finally` (so failures log too). Unmatched (404), method-not-
allowed (405), and `/health` are answered before the pipeline and are not logged.
**Rationale:** Putting it on the seam is the cleanest demonstration that the onion
carries a second concern with zero plumbing changes — one entry in
`assembleMiddleware`, no server rewiring — which is exactly the extensibility the
architecture is selling. It also gives every routed request an id that inner
middleware and the response share.
**Tradeoff:** Requests that never reach a route (404/405) and health checks aren't
access-logged, so the log doesn't capture total ingress.
**Rejected:** A server-boundary logger wrapping all requests — captures 404/405/
health too, but duplicates the id/timing/sink logic outside the middleware and
weakens the seam demonstration. Logging both places — two code paths for one
concern. Server-boundary logging is a small, clean follow-up if total ingress
visibility is wanted.

## 9. Rate-limit client key from socket peer; 429 envelope with Retry-After

**Decision:** For `per: ip`, the bucket key is the direct TCP peer
(`req.socket.remoteAddress`), not `X-Forwarded-For`. A rejected request returns
`429` with `{ "error": "rate_limited", "retry_after": <seconds> }` and a
`Retry-After` header. The store's `check()` is deliberately synchronous.
**Rationale:** `X-Forwarded-For` is client-spoofable unless the gateway sits
behind a *trusted* proxy that overwrites it; trusting it by default would let a
caller dodge limits by forging the header, so the honest, safe default is the
real peer. The 429 shape mirrors the config's specified circuit-breaker envelope
for consistency, and `Retry-After` is the standard signal. A synchronous
check-and-increment is what makes 50 concurrent requests admit exactly the limit
on Node's single thread (see decision #3) — no lock needed.
**Tradeoff:** Behind a load balancer every client looks like the balancer's IP, so
`per: ip` would collapse to one bucket until XFF support (with a trusted-hop
count) is added. The config schema doesn't expose that knob yet.
**Rejected:** Trusting `X-Forwarded-For` by default — convenient behind a proxy
but insecure when directly exposed. Making the 429 body match no known convention
— the breaker envelope is already in the spec, so reuse it.

## 10. Timeout lives in the proxy (AbortController); failures are typed GatewayErrors

**Decision:** The upstream timeout is applied inside the proxy via an
`AbortController` that aborts the in-flight request, not as a racing middleware
around it. Upstream failures reject with a typed `GatewayError(status, code)` —
`504 gateway_timeout` on abort, `502 bad_gateway` on connection/refused/reset —
which the server boundary maps to the client response and the logging middleware
reads for an accurate status. Partially reverses the architecture's original
"timeout as a middleware" sketch.
**Rationale:** A timeout must actually cancel the socket, not just stop awaiting a
promise — a middleware that races a timer against `next()` would return 504 while
the upstream connection leaks in the background. Only the code holding the request
can abort it, so timeout belongs with the proxy. A per-request abort also gives
retry (T6) a natural per-attempt timeout when it wraps the proxy. Typing errors
keeps status decisions in one taxonomy instead of scattered `if` checks.
**Tradeoff:** The `timeout` concern is no longer a standalone onion layer, so the
seam doesn't showcase it; it's coupled to the proxy's request lifecycle.
**Rejected:** Timeout as a racing middleware — fits the onion diagram but can't
cancel the socket, leaking connections and diverging the reported status from
reality. `req.setTimeout` alone — fires a callback but doesn't destroy the request
as cleanly as an `AbortController`, and is fiddlier to distinguish from a genuine
socket error.

## 11. Anchor config tests to the real spec artifact, not hand-built fixtures

**Decision:** Config validation is tested by loading the *actual* `gateway.yaml`
(the file that is the spec) and a second, structurally different fixture, then
asserting the fully-resolved output — in addition to the hand-built unit cases.
**Rationale:** The per-route timeout bug (fixed just before this) survived because
the unit test built its fixture from the same wrong assumption as the code
(`timeout` at the route level), so test and code agreed while both were wrong.
Hand-built fixtures can only ever encode my assumptions; asserting the real sample
catches any field whose schema *shape* I misread, and the second config guards the
"works with any valid config" requirement against hardcoded assumptions.
**Tradeoff:** These tests are coupled to the sample files, so intended schema
changes require updating them — acceptable, since the sample defines the schema.
**Rejected:** Relying on hand-built fixtures alone — fast to write but blind to
exactly the class of schema-shape defect that just bit us.

## 12. Retry semantics: total-attempts, retry on gateway errors too, method-agnostic

**Decision:** `retry.attempts` is the **total** number of tries (so `attempts: 3`
= 1 initial + up to 2 retries). Retry fires when the outcome status is in
`retry.on`, whether that status came from the upstream's response *or* from a
gateway-generated `GatewayError` (502 on connection failure, 504 on timeout).
Backoff is `initialDelayMs` for `fixed`, `initialDelayMs * 2^(n-1)` for
`exponential`. Retry is applied regardless of HTTP method. `withRetry` wraps the
proxy and becomes the pipeline's terminal, so each attempt gets its own timeout.
**Rationale:** `attempts` reads most naturally as a total try count (ambiguous in
the config — call made and documented per the brief). Connection refusals and
timeouts surface as `GatewayError(502/504)`, and a config listing 502/504 in `on`
clearly wants those transient failures retried, so honoring both response and
error statuses matches intent. Wrapping the proxy (rather than adding an onion
ring that re-drives `next()`) respects the "next once" guard and keeps per-attempt
timeouts free.
**Tradeoff:** Retrying **non-idempotent** methods (POST) on 503/504 can duplicate
a side effect if the upstream actually processed the request before failing. We
retry per config because the schema exposes no per-method or idempotency knob;
the risk is real and called out as future work (gate retries to idempotent
methods, or add an `idempotent`/`retry_methods` field).
**Rejected:** `attempts` = additional retries (1+3=4 tries) — also defensible;
chose total for the simpler mental model. Retrying only on upstream *response*
statuses — would ignore connection/timeout failures that are exactly what 502/504
in `on` describe. Gating to idempotent methods now — safer, but contradicts a
config that enables retry on a route whose `methods` include POST, and isn't
expressible in the schema.

## 13. API-key auth: rate-limit before auth, strip the key before forwarding

**Decision:** The `auth` middleware sits *after* `rateLimit` and *before* the
proxy in the onion. A request missing the configured header, or presenting a key
not in `keys`, gets `401 {"error":"unauthorized"}`; a valid key proceeds and the
key header is **deleted** before forwarding upstream.
**Rationale:** Rate-limiting before auth means key-guessing and unauthenticated
floods are throttled before they reach the auth check — auth-first would let an
attacker try unlimited keys (each a fast 401) because the limiter, sitting after
auth, never runs on a rejected request. Stripping the key stops the gateway's
credential from leaking to upstreams that don't need it (the spec says don't
forward it, and the schema has no "keep it" flag).
**Tradeoff:** Ordering only matters for a route with *both* `rate_limit` and
`auth` (none in the sample), and rate-limiting first means unauthenticated
attempts consume the per-IP bucket shared with legitimate callers. Key comparison
uses `Array.includes` (not constant-time), so it's theoretically timing-observable
— acceptable here, hardening (constant-time compare) noted as future work.
**Rejected:** Auth before rate limit — matches the original architecture sketch
but exposes key brute-forcing. Forwarding the key upstream — convenient if the
backend also authenticates, but leaks the gateway credential by default with no
config opt-in.

## 14. Load balancing via a stateful per-route target selector (supersedes #7)

**Decision:** A `TargetSelector` holds a per-route cursor and picks the next
target: `round_robin` cycles targets evenly (weights ignored), and
`weighted_round_robin` walks cumulative weights so each target appears in
proportion to its `weight` over a full cycle. A single instance is created per
gateway and injected via `PipelineDeps`; the proxy is now a factory
(`createProxy(selector)`) that consults it per request.
**Rationale:** Keeps balancing state in one place with the same injected-shared-
state pattern as the rate limiter, and makes the selector a pure, deterministically
testable unit. Because `withRetry` re-invokes the proxy per attempt and each
invocation advances the cursor, **retries naturally fail over to the next target**
— a useful emergent behavior at no extra cost.
**Tradeoff:** The cursor is per-process (like all our state — decision #3), so
across instances distribution isn't globally coordinated. Selection is unaware of
target health until active health checks (B5) land, so a down target still takes
its turn (retry mitigates this by failing over).
**Rejected:** Random selection — simpler but uneven over small samples and
non-deterministic to test. Smooth weighted round-robin (Nginx-style) — smoother
interleaving but more state; the cumulative-weight walk is simpler and meets the
"proportional over a full cycle" acceptance.

### Implementation note — native type-stripping constraint
TypeScript *parameter properties* (`constructor(readonly x: T)`) are rejected at
runtime by Node's strip-only mode (they require code generation, not just type
erasure) even though `tsc` accepts them. `GatewayError` declares its fields
explicitly and assigns them in the constructor. Same class of constraint applies
to enums and namespaces — avoid them in `src/`.
