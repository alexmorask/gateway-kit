# Roadmap — GatewayKit

Delivery scope for the 2-hour build, from `docs/product-spec.md` (what's wanted)
and `docs/architecture.md` (what it costs). Core is the ordered ticket board;
backlog is pulled top-down only if core lands early. Everything here is a spec
requirement — this decides *which* and *when*, never new scope.

## Core — ordered ticket board

Walking skeleton first (T1–T2 runnable end-to-end); stoppable at any ticket with
a coherent demo.

### T1 — Scaffold, config load/validate, `/health` — `done`
Project scaffold (`package.json` + `engines`, `tsconfig` for `--noEmit`, test/start
scripts). Read YAML config path from CLI arg (or env var, arg wins), parse +
validate to a typed `GatewayConfig` with global→route defaults, boot an HTTP
server on `gateway.port`, answer `GET /health`. Includes the shared **duration
parser** (`"30s"`/`"1m"`/`"2h"` → ms) since validation resolves timeouts/windows.
- **Acceptance (R1, R2):** `node <entry> <config>` binds the config's port;
  `GET /health` → `200 {"status":"healthy","uptime_seconds":<int>}`; a
  missing/malformed/schema-invalid config exits non-zero with a clear message and
  no half-started server; a second unseen valid config also boots. Duration
  parser handles `s`/`m`/`h` units.
- **Single-command tests:** `npm test` runs the whole suite self-contained
  (`node --test`), spinning any mock upstream up in-process — no external setup.
- **DoD:** tests green · typecheck clean · runs end-to-end · docs updated ·
  committed.

### T2 — Router + proxy pipeline + mock upstream — `todo`
Router `match(method, path)` (longest-prefix, 404/405). The onion pipeline seam
with `proxy` as the innermost terminal: forward method/headers/body to the
upstream, return its response; honor `strip_prefix`. In-repo **mock upstream**
exposing canned endpoints plus one **slow** and one **flaky** endpoint (needed by
T5/T6).
- **Acceptance (R3, R4, R5):** matched route → upstream response returned verbatim
  (status, headers, body, query string preserved); no path → 404; wrong method →
  405; `strip_prefix: true` forwards `/api/x/123` as `/123`. Verified through the
  running gateway against the mock upstream.
- **Calls to make + document (T2):** `strip_prefix` when the path equals the route
  exactly (→ `/`); query-string preservation; Host-header rewrite and hop-by-hop
  header stripping (`Connection`, etc.). Record each in `docs/decisions.md`.
- **DoD:** as above.

### T3 — Logging middleware with correlation id — `todo`
A `logging` middleware at the outermost layer — proves the seam carries a second
concern cleanly.
- **Acceptance (R16):** each request emits one JSON line with a generated
  correlation id, method, path, matched route, upstream, status, and latency.
- **DoD:** as above.

### T4 — Rate limiting — `todo`
`rateLimit` middleware over an in-memory bucket store; fixed_window and
sliding_window; `per: ip` / `per: global`; route `rate_limit` overrides
`gateway.global_rate_limit`.
- **Acceptance (R6):** requests beyond `requests` within `window` → 429; both
  strategies enforced; under 50 concurrent requests the accept/reject count is
  exact (no over-admission).
- **Calls to make + document (T4):** client-IP source for `per: ip`
  (`socket.remoteAddress` vs `X-Forwarded-For`); the 429 body shape and whether to
  send a `Retry-After` header. Record in `docs/decisions.md`.
- **DoD:** as above.

### T5 — Timeout + resilient upstream failures — `todo`
`timeout` middleware + upstream error mapping.
- **Acceptance (R7, R15):** upstream slower than the effective (per-route or
  global) timeout → 504; refused/unreachable upstream → 502; gateway stays up and
  keeps serving other routes.
- **DoD:** as above.

### T6 — Retries — `todo`
`retry` middleware wrapping the proxy.
- **Acceptance (R8):** a response whose status is in `retry.on` triggers up to
  `attempts` retries with `fixed`/`exponential` backoff from `initial_delay`; a
  success within budget is returned; exhaustion returns the last response.
- **DoD:** as above.

## Backlog — ranked (pull top-down only if core lands early)

1. **B1 — API-key auth (R13).** Cheap, clean, high-clarity `401` win. One
   middleware, no new subsystem.
2. **B2 — Load balancing (R9).** round_robin / weighted_round_robin target
   selection. Self-contained in `upstream/select`.
3. **B3 — Circuit breaker (R14).** Per-route state machine; 503 with `retry_after`.
   Depends on failure accounting.
4. **B4 — Request/response transforms (R11, R12).** Header add/remove + body
   mapping/envelope + `$token` resolution. Highest effort/risk (dot-path, tokens).
5. **B5 — Active health checks (R10).** Background timers + target rotation; needs
   lifecycle management, so last.

## Order rationale

- **Walking skeleton first:** T1 (boots + health + config) then T2 (proxy) leaves
  a runnable gateway satisfying every non-negotiable core requirement — the floor
  for a passing submission.
- **Seam proven early:** T3 (logging) is deliberately third and cheap, so a second
  middleware exercises the onion before the feature tickets depend on it.
- **Resilience before breadth:** T4–T6 target the failure modes the prompt names
  (rate-limit races, upstream down, timeouts) — the 25% production-thinking axis —
  ahead of the more visible but higher-risk transforms/LB in backlog.
- Forced dependencies: T2 needs T1's config + server; T3–T6 need T2's seam +
  proxy; T6 (retry) wraps T5's proxy/timeout path.
