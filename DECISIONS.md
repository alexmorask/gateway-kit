# Design Decisions — GatewayKit

This is the story of how I built GatewayKit: what I chose to work on and why, how
the code is organized, the trade-offs I made, and what I'd do with more time. I
kept a running decision log as I went in [`docs/decisions.md`](docs/decisions.md)
with the full reasoning for each call; this document is the readable summary, and
it points there (by number) when you want the detail.

## What I built first, and why

The config is deliberately bigger than two hours allows, so I ordered the work so
that I'd have a working, coherent gateway at every stopping point rather than a
pile of half-finished features.

I started with the non-negotiable core: load and validate the config, answer
`/health`, then route requests, proxy them, and return 404/405 correctly. Once
that was done the gateway already met all five required behaviors end to end, so
everything after that point was a bonus and couldn't break the baseline.

Next I added structured request logging with a correlation ID. I did this early on
purpose: it was the first real proof that my middleware setup could take on a new
concern with almost no wiring, which told me the rest of the features would be
cheap to add.

Then I focused on resilience: rate limiting, timeouts, handling upstreams that are
down, and retries. I picked these next because they're the failure cases the brief
calls out directly — 50 requests hitting a rate-limited route at once, an upstream
that's down, an upstream that's slow. Rate limiting went first because the
concurrency case is the hardest and most interesting one to get right.

Only after the core was done and I was ahead of schedule did I pull two features
off the backlog: API-key auth (cheap and clean) and load balancing (self-contained,
and it let me remove a temporary shortcut I'd taken earlier).

Throughout, the rule was "a few features done well beat a lot done badly." Every
feature I shipped has both unit and integration tests and was checked by running it
against the real `gateway.yaml`, not just in tests.

## How the gateway is put together

The whole thing is one idea: **a request flows through a chain of small middleware,
and the actual call to the upstream server is the last link in the chain.** Each
middleware does one job (log, rate-limit, authenticate, and so on) and can either
handle the request itself or pass it along. Every route gets its own chain, built
once at startup from only the features that route actually uses:

```
logging  ->  rate limit?  ->  auth?  ->  (retry around the proxy | proxy)
```

The reason it's built this way is so that adding a new feature is easy: you write
one small middleware and add one line that plugs it into the chain. You don't touch
the server, the router, or any other middleware. I proved this out in practice —
logging, rate limiting, auth, and load balancing all went in without changing
anything unrelated. When the brief asks whether another engineer could add a config
feature in an afternoon, that's not a hope, it's how I built the last four features.

### The trade-offs worth knowing about

- **I used a small YAML library instead of writing my own parser** (#1). The gateway
  has to load *any* valid config in this schema, including the different one you'll
  test with. A hand-written parser that trips over some YAML edge case in your file
  would fail a core requirement, and the brief allows a parser, so this was an easy
  call.
- **All state lives in memory in a single process** (#3): rate-limit counters, the
  load-balancer's position, and so on. A nice consequence is that because Node runs
  on a single thread, checking-and-incrementing a rate-limit counter can't be
  interrupted, so 50 simultaneous requests admit *exactly* the limit with no locks
  and no double-counting. The cost is that limits are per-instance — if you ran two
  copies of the gateway, each would track its own counts.
- **Timeouts and retries live with the proxy, not as their own middleware** (#10,
  #12). A timeout has to actually cancel the network request, which only the code
  making that request can do, so it belongs in the proxy. Retry wraps the proxy and
  re-runs it. A nice side effect fell out of this: since each retry re-runs the
  proxy and the load balancer advances to the next target each time, **a retry
  automatically tries a different upstream** (#14) — failover for free.
- **Upstream failures are turned into typed errors** (#10) — a 502 when the upstream
  refuses the connection, a 504 when it times out. These are handled in one place
  and reused by the logger, so the access log always shows the same status the
  client got.
- **Config validation is strict about what I use and relaxed about the rest** (#5).
  I fully validate the fields the built features rely on, and quietly skip config
  blocks for features I didn't build. That way a config that uses, say, circuit
  breakers still starts up and serves all its other routes.
- **I made the safe security choices by default** (#9, #13): rate limiting counts by
  the caller's actual network address rather than the `X-Forwarded-For` header
  (which a caller can fake), rate limiting runs before auth so nobody can hammer the
  auth check trying to guess keys, and a valid API key is stripped off the request
  before it's forwarded so the gateway's credential never leaks to the backend.

### One testing decision I want to highlight (#11)

I validate the config against the *real* `gateway.yaml` and a second config with a
different shape, not just against test fixtures I wrote by hand. This came out of an
actual bug: the per-route `timeout` is nested under `upstream` in the config, but my
code originally read it one level up. My unit test had made the same wrong
assumption, so it passed while the code was wrong. Checking against the real config
file is what catches that kind of "I misread the schema" mistake, so I added it as a
standing guardrail.

## What I'd build next

In the order I'd tackle them (see [`docs/roadmap.md`](docs/roadmap.md)):

1. **Circuit breaker** (the `circuit_breaker` config). Trip after N failures in a
   window, return a 503 with a `retry_after` while tripped, then test the waters
   again after a cooldown. It's the biggest of the remaining items (roughly 20–25
   minutes) because it's a small state machine that needs a clock, a definition of
   what counts as a "failure," and the half-open "let one request through to check"
   logic. It would slot in as one more middleware near the front of the chain.
2. **Request/response transforms** (the `..._transform` config). Adding and removing
   headers is easy; the real work is the body: remapping fields by dotted path,
   wrapping responses in an envelope, and resolving the `$request_time` /
   `$literal:` / `$body` / `$response_time` / `$route_path` placeholders. This is the
   riskiest item, and it would be two middleware, one on the way in and one on the
   way out.
3. **Active health checks** (the `health_check` config). Poll each backend in the
   background and pull unhealthy ones out of the load-balancer rotation. Needs some
   timer lifecycle handling and pairs naturally with load balancing.
4. **A handful of smaller hardening items** I noted along the way (in
   `docs/decisions.md`): reject nonsensical numbers in the config (a `weight` of 0
   currently makes the balancer quietly fall back to the first target), cap request
   body size, expire idle rate-limit counters, trust `X-Forwarded-For` when the
   gateway is behind a known proxy so `per: ip` works there, compare API keys in
   constant time, support per-API-key rate limits, offer a truly gateway-wide
   `per: global` (today it's per-route), and log 404s/405s too.

Before finalizing I ran a multi-agent review over the code, tests, error handling,
and types. It caught one real bug — the gateway could be crashed by a client that
dropped its connection in the middle of sending a request body — which I fixed, plus
a case where a timeout was being reported as a 502 instead of a 504. Both now have
tests. The smaller items listed above are the review's remaining suggestions, which
I'm noting honestly here rather than quietly leaving out.

## What's half-finished

Nothing. Everything I've listed as built is fully working and tested. The features I
didn't get to (circuit breaker, transforms, health checks) simply aren't
implemented — their config is accepted so the gateway still starts, but I haven't
shipped any half-written code pretending to be done.

## How I used AI

I built this with Claude Code (Opus), and I used it as a disciplined collaborator
rather than an autocomplete:

- **I worked in phases with a checkpoint at each one:** understand the problem,
  write the spec, design the architecture, plan the tickets, then implement one
  ticket at a time, then finalize. I committed all the planning before writing code,
  so the git history shows the thinking came first.
- **I worked test-first.** Every feature was a failing test, then the code to make it
  pass, then cleanup. I never called something done without actually running the
  tests and the gateway to prove it.
- **I stayed in the driver's seat on the decisions.** The scope calls — going lean
  instead of ceremonial, which backlog items to pull, stopping before the circuit
  breaker so I'd have time to finish the docs — were mine. A couple of my questions
  also caught real problems: asking how per-route timeouts were honored surfaced the
  nesting bug, and asking whether other tests shared that blind spot led to the
  real-config validation tests.
- **I recorded decisions as I made them** in `docs/decisions.md`, so this write-up
  and the walkthrough are based on notes I took at the time, not on memory.
- **I used tooling for the quality passes:** a cleanup pass that factored out a
  shared helper, and the multi-agent review before finalizing.

I can explain every line in the submission. Nothing went in that I didn't
understand.
