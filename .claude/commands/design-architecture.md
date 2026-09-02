---
description: Turn the agreed intake into an architecture — components, seams, and the key decisions — for approval before any tickets or code.
argument-hint: (none — reads docs/intake.md)
---

This is the **design** phase: decide the shape of the system that satisfies the
committed product spec. No roadmap, no scaffolding, no code yet.

## Read first

Read `docs/product-spec.md` (the committed requirements and acceptance criteria).
If it does not exist, stop and tell the user to run `/write-product-specification`
first — designing without a committed product is designing against a moving
target.

## Design the system

Work out, and be ready to explain in plain language:

1. **Mental model** — one paragraph: what kind of thing this is and the single
   idea it is built around (e.g. "a reverse proxy that is a pipeline of
   middleware"). If you cannot say it in a sentence, the design is not settled.
2. **Components** — the units the system breaks into. For each: what it does,
   how it is used, what it depends on. Prefer small units with one purpose and a
   clear interface — something you can understand and test in isolation. If a
   unit's internals must be explained before it can be used, the boundary is
   wrong.
3. **Data / request flow** — trace one representative request (or unit of work)
   through the components start to finish, including where it can short-circuit.
   Capture it as a simple ASCII diagram (client → components → upstream and
   back); a picture of the flow is worth more than a paragraph when you're
   explaining it out loud, and it goes straight into `docs/architecture.md`.
4. **Key interfaces (seams)** — the contracts components talk through, and the
   seam every cross-cutting concern attaches to. Name the types.
5. **Error handling** — how failures surface and where they are caught; the
   boundary that turns an unexpected error into a clean response.
6. **Testing strategy** — what is unit-tested (pure logic) versus
   integration-tested (the wired system), and why.
7. **Cost of each requirement** — for every requirement in `docs/product-spec.md`,
   a one-line read on its relative effort, risk, and what it depends on. This is
   not a full estimate; it is the input `/plan-roadmap` needs to decide what fits
   the budget. Capture it as a short table in `docs/architecture.md`.

## Surface the real decisions

Wherever there is a genuine fork — two defensible ways to build something —
**present 2-3 options with their tradeoffs and your recommendation**, and let the
user choose. These forks are the point of the phase: they are what a reviewer
will ask you to defend. Never paper over one with a single unexplained choice.

## Discuss first, then commit

Present the design in chat — section by section for anything nuanced — and settle
the open forks with the user. Do not write files until the shape is agreed;
conversation is cheaper than rewriting docs.

Once agreed, write:

- **`docs/architecture.md`** — the living spec: mental model, components, the
  ASCII flow diagram, interfaces, error handling, testing. It is updated as the
  build proceeds and is the source of truth for how the system works.
- **`docs/decisions.md`** — record each fork you settled above. Use the
  **recording-decisions** skill for what counts as a decision and the entry
  format; do not restate the format here.

Then **stop**. Do not proceed to `/plan-tickets`. Design is a checkpoint: a human
signs off on the shape and the tradeoffs before work is broken into tickets.
