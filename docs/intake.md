# Intake — GatewayKit

Record of the intake conversation. Not a spec — the product gets decided next in
`/write-product-specification`.

## Restatement

Build **GatewayKit**, a lightweight, config-driven reverse proxy / API gateway.
It reads a `gateway.yaml` (the config *is* the spec) and forwards client requests
to upstream services according to that config. Must work with **any valid config
following the schema** — graders run it against a *different* config of the same
shape, not just the sample.

- **Stack:** TypeScript on Node via native type-stripping; `node --test`;
  `tsc --noEmit`. Standard library + a YAML parser only. No existing gateway /
  reverse-proxy / HTTP-proxy frameworks — building the proxy logic is the point.
- **Budget:** 2 hours (3:00–5:00 PM CT). Full git history is part of the grade.
- **Grading weights:** Architectural Judgment 35% · Code Quality 25% ·
  Production Thinking 25% · Communication 15%.

### Assumptions (not stated in the prompt — treated as confirmed for now)

- Config path from a **CLI arg or env var**; support both, arg wins.
- Graders do **not** run real upstreams on :3001–:3006. Correctness is judged via
  our own **self-contained mock upstream** plus route/method/health behavior, so
  features must **degrade sanely when an upstream is absent or down**.

## Success criteria (demoable floor)

1. Boots and listens on the **config's** port (8080 in sample).
2. `GET /health` → `200 {"status":"healthy","uptime_seconds":<int>}`, always,
   regardless of config.
3. Matched route → proxied to upstream, response returned; unmatched → **404**.
4. Wrong method on a matched route → **405**.
5. Runs identically against a **second, unseen config** of the same schema.
6. One-command test suite with a self-contained mock upstream; `README.md` +
   `DECISIONS.md` present.

## Feature universe (raw material — scoping happens next)

- **Core:** config load/validate · port binding · `/health` · path routing ·
  method filter · basic proxy · `strip_prefix` · 404 / 405.
- **Beyond core (all in the config):** rate limiting (fixed / sliding window, per
  ip / global) · timeouts (global + per-route) · retries (fixed / exponential
  backoff, on status codes) · load balancing (round-robin / weighted) · active
  health checks · request transforms (header add/remove, body field mapping,
  `$request_time` / `$literal:` tokens) · response transforms (header add/remove,
  body envelope, `$body` / `$response_time` / `$route_path`) · API-key auth ·
  circuit breaker.
- **Cross-cutting:** structured JSON logging with a correlation id per request.

## Open questions & resolutions

- **Target shape of the submission?** → **Rock-solid core + 2–3 clean features**
  (rate limiting, then timeout/retry) through an extensible middleware seam;
  everything else documented as "what's next." A few clean features beat many
  brittle ones, per the prompt.
- **YAML: hand-roll vs. dependency?** → **Take one small, vetted YAML
  dependency.** A hand-rolled parser that chokes on the graders' unseen config
  fails a core requirement; the challenge explicitly permits a YAML parser. To be
  recorded as a decision in architecture.
- **Standing rule:** config ambiguities are intentional — make a call, record it
  in `docs/decisions.md`, move on.
