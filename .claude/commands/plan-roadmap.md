---
description: Decide delivery scope — informed by the design's cost — cutting the committed product to what fits the budget, as an ordered ticket board.
argument-hint: (none — reads docs/product-spec.md and docs/architecture.md)
---

This is the **planning** phase: the product spec is the complete desired product;
now decide what actually ships in the time budget, and in what order. This is a
judgment step — the most important human checkpoint in the process. No code yet.

## Read first

Read `docs/product-spec.md` (the committed requirements) and
`docs/architecture.md` (the shape, and the cost/risk/deps of each requirement).
If either is missing, stop and say which command to run first — you cannot decide
what fits the budget without both what is wanted and what it costs.

## Decide delivery scope against the budget

Weigh each requirement's cost, dependencies, and risk against the time budget and
the acceptance criteria:

1. **Core (this build).** The minimum set of requirements that satisfies the
   product's acceptance criteria and fits the budget with room to spare. Ruthless
   YAGNI — better to finish a smaller coherent product than half-build a bigger
   one. Everything here is a requirement from the spec; you are choosing *which*
   and *when*, never inventing new scope.
2. **Backlog (deferred).** Requirements that are wanted but do not fit this
   build, ranked by value-per-risk with dependencies noted. Pulled top-down only
   if core lands early. (These are spec requirements, distinct from the spec's
   permanent non-goals.)

Then **order the core for a walking skeleton first**: the earliest sequence that
leaves something runnable end-to-end, so you can stop at any point with a
coherent demo. Note the dependencies that force the order.

## Turn the ordered core into a ticket board

Each core item becomes a **ticket** — the unit `/implement-ticket` will build.
Keep each ticket to one coherent slice of work, with:

- **Title** and a one-line description of the slice.
- **Acceptance** — the observable behavior that proves it works, traced back to
  the spec's acceptance criteria.
- **Definition of done** — the bar every ticket must clear: tests green,
  typecheck clean, it runs end-to-end, docs updated, committed.
- **Status** — `todo` to start.

## Record the scope decisions

Every real cut is a decision. Where you deferred a requirement to backlog or
made a notable ordering call, record it with the **recording-decisions** skill.

## Discuss first, then commit

Present the Core (in build order, as tickets) and ranked Backlog in chat and
settle the cuts with the user — delivery scope is their call. Do not write the
file until it is agreed.

Once agreed, write **`docs/roadmap.md`** with three sections: Core (the ordered
ticket board), Backlog (ranked), and a short Order rationale.

Then **stop**. Do not start building. The board is the checkpoint a human signs
before `/implement-ticket` takes the first ticket.
