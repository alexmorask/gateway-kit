# GatewayKit — 2-Hour Time Box (3:00–5:00 PM CT)

Approach: **lean / folded**. Do the thinking each phase demands, but as fast
lightweight passes — front-load working code, capture decisions inline, write
`DECISIONS.md` + `README.md` at the end. This targets the rubric
(Architecture 35% + Production Thinking 25% + Code Quality 25% + Communication
15%) without spending the clock on ceremony.

## The one non-negotiable rule

**Protect the last 20 minutes (4:40–5:00) for docs + verification, no matter
where the code is.** Communication is 15% of easy points and the core
requirements demand a README; an unfinished `DECISIONS.md` is a large,
avoidable loss. Stop adding features at 4:40 regardless.

Second rule: **the config is the spec, and they test with a *different* config.**
Everything is data-driven and validated at startup. No hardcoded routes, ever.

## Priority order (why this order)

Core requirements are non-negotiable baseline — land them first and solid.
After that, features are ordered by *rubric leverage per minute* and by what
best demonstrates the pipeline is extensible.

1. **Config load + validate** — foundational; "works with any valid config" is a
   core requirement. Malformed config → clear error + non-zero exit.
2. **Core proxy** — server on config port, `GET /health` always, path routing,
   method filter (405), unmatched (404), `strip_prefix`, forward+return, upstream
   down → 502. *(the four core requirements)*
3. **Structured logging + correlation id** — cheap, directly scores Production
   Thinking, useful for the rest of the build.
4. **Rate limiting** (fixed_window → sliding_window, per ip/global) — the
   "50 concurrent requests" failure-mode scenario they call out; showcases
   concurrency awareness. Highest-leverage feature.
5. **Timeout + retry** (per-route override, fixed/exponential backoff, retry on
   configured status codes) — resilience story.
6. **Load balancing** (round_robin / weighted_round_robin) — if time.
7. **Auth (api_key)** — cheap, if time.
8. **Header transforms** → body transforms → circuit breaker → active health
   checks — documented as "next", partially built only if the seam makes it free.

Each feature is a **middleware in one pipeline** behind a clean seam, so a
half-built board still reads as clean architecture and unimplemented features
are obviously slot-able. Partial > brittle.

## The schedule

| Time | Block | Ships |
| --- | --- | --- |
| **3:00–3:15** | **Setup & framing** | Skim config as spec; lock priority order + YAML decision (small dep vs. hand-rolled — record the call) + pipeline shape. Scaffold: `package.json` (`engines` Node ≥22.6/≥23, scripts: start/test/typecheck), `tsconfig` (`--noEmit`), dir layout. Prove empty server boots. **Commit.** Short `docs/architecture.md` + `docs/decisions.md` seed. |
| **3:15–3:55** | **CORE (must land)** | Config loader + validation. HTTP server on config port. `GET /health`. Router: match / method 405 / unmatched 404 / `strip_prefix`. Proxy: forward method+headers+body, return upstream response; upstream down → 502. Mock upstream server. Tests through the running system. Structured JSON logging + correlation id. **Commit per coherent slice.** |
| **3:55–4:40** | **Features (priority order)** | One clean vertical slice + tests + commit each; stop any time. Rate limiting first (concurrency-safe), then timeout/retry, then load balancing / auth / transforms as time allows. Every feature behind the middleware seam. |
| **4:40–5:00** | **Close out** | Stop new features. Full `node --test` + `tsc --noEmit` run. `README.md` (setup, run, test, implemented-checklist, Node-version prereq). `DECISIONS.md` (prioritization, architecture + trade-offs, what's next, partial features + state, AI usage). Verify against provided config **and** a second altered config. **Final commit.** Package/link + submit before 5:00. |

## Checkpoints to hit (or cut and move on)

- **3:15** — repo scaffolded, empty server boots, first commit. If not, stop
  scaffolding and go.
- **3:55** — all four core requirements pass through a running gateway with the
  provided config. This is the floor for a passing submission. If behind, skip
  straight to close-out with whatever core is done.
- **4:40** — hard stop on features. Docs + verification only from here.
- **~4:55** — final commit done; last 5 min is packaging/submission buffer.

## Definition of done (every ticket, per CLAUDE.md)

tests green (reported, not asserted) · typecheck clean · runs end-to-end · docs
updated · committed. Evidence before assertions.

## Standing reminders

- **Commit history is graded** — one coherent slice per commit, imperative
  subject, body says *why*. It should read as a story of prioritization.
- **Production thinking is 25%** — for each feature, handle the failure mode:
  upstream down, malformed config, concurrent load, timeout.
- **No code comments** (per conventions) — names and structure carry meaning.
- Ambiguity in the config is intentional: **make a call, record it in
  `docs/decisions.md`, move on.** Don't stall.
