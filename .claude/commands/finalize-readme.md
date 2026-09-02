---
description: Write the README and the root DECISIONS.md from what was actually built — an honest, defensible front door reflecting the code, real run steps, architecture, and key decisions.
argument-hint: (none — reads the docs and the code)
---

This is the **finalize** phase, run at the end of the build: produce the two
documents a reviewer reads first — `README.md` and the root `DECISIONS.md`. Both
must describe what was *actually built*, not what was planned. An honest, accurate
front door beats an aspirational one — especially one you will have to defend out
loud.

## Read first

Read the real state of the build:

- `docs/product-spec.md` — what the product is
- `docs/architecture.md` — the shape, the flow diagram, the mental model
- `docs/roadmap.md` — what shipped (`done` tickets) versus what's backlog
- `docs/decisions.md` — the tradeoffs worth surfacing
- the code and config themselves — the source of truth for how it runs

If tickets are still `todo`, say so and confirm with the user whether to finalize
now. Finalizing at the time-box with documented backlog is fine; claiming unbuilt
features is not. Document scope honestly.

## Verify before you write

The run and test commands in a README are promises. Keep them:

- Run the install / start / test commands yourself and confirm they work.
- Document only commands you have watched succeed. Evidence before assertions.

## Write README.md

Keep it scannable — the entry point, with links to the docs for depth. Cover:

1. **What it is** — the one-line description and a short paragraph on what the
   product does. Preserve the existing tagline if it is good.
2. **Quickstart** — the real, verified commands to install, run, and test.
   State the **Node version prerequisite** plainly (native type-stripping needs
   Node ≥ 22.6 flagged / ≥ 23 default) — the graders run this on their machine, so
   an unstated version requirement is a broken promise. Show the exact invocation,
   including how the config path is passed (CLI arg or env var).
3. **Configuration** — config is data; show the config file's shape with a small
   example.
4. **Architecture at a glance** — the mental model in a sentence and the ASCII
   flow diagram from `docs/architecture.md`. Link to the doc for depth.
5. **Design decisions & tradeoffs** — the two or three decisions a reviewer is
   most likely to probe, each in a line, linking to the root `DECISIONS.md` for
   the full reasoning.
6. **Scope** — which config features are implemented, as a **checklist**, and
   what was deliberately deferred (from `docs/roadmap.md`), framed as choices, not
   omissions. Note the current state of anything partially built.

## Write DECISIONS.md (repo root)

This is the challenge's required narrative deliverable — distinct from the running
`docs/decisions.md` fork-log, though you draw on it. Write a `DECISIONS.md` at the
repo root covering, in plain prose a reviewer can scan:

1. **Prioritization** — how you chose which config features to implement, and in
   what order. Tie it back to the walking-skeleton ordering and the core
   requirements.
2. **Architecture & trade-offs** — how the proxy pipeline is structured and how it
   stays extensible (another engineer adding a config feature in an afternoon),
   with the key trade-offs. Pull the load-bearing entries from `docs/decisions.md`.
3. **What you'd build next** — the ranked backlog from `docs/roadmap.md`, framed as
   the next moves with more time.
4. **Partial features** — anything half-built and its honest current state. Do not
   claim unbuilt features as done.
5. **AI tool usage** — a short, candid note on how AI tools were used in the build.

## Then stop

The README and DECISIONS.md are the front door and the defense script — the first
two artifacts a reviewer reads. Present both and let the user refine the wording.
