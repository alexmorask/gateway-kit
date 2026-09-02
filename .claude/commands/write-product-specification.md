---
description: Decide the product — its requirements, behaviors, acceptance criteria, and non-goals — as a committed spec before any architecture.
argument-hint: (none — reads docs/intake.md)
---

This is the **product** phase: decide *what the product is and does*, and commit
it. This is a product decision — the complete desired product, not yet trimmed to
a time budget (that trimming is `/plan-roadmap`, later, once cost is known). No
architecture and no code yet.

## Read first

Read `docs/intake.md` (the shared understanding and open questions from intake).
If it does not exist, stop and tell the user to run `/perform-intake` first —
specifying a product before the problem is understood is guesswork.

## Decide the product

Resolve the open questions from intake with the user, then commit to:

1. **Purpose** — one paragraph: what this product is and the problem it solves.
2. **Requirements / behaviors** — what the product *does*, functionally. The
   complete desired feature set — everything that belongs in the product, without
   regard to what fits the clock. Each requirement stated as an observable
   behavior, not an implementation.
3. **Acceptance criteria** — per requirement, the observable condition that means
   it works (e.g. "an unknown API key is rejected with 401"). These become the
   tests later and the demo script for the defense.
4. **Non-goals** — what the product deliberately does *not* do, as permanent
   product boundaries (e.g. "does not terminate TLS — that's the load
   balancer's job"). Distinct from backlog: a non-goal is never built; backlog is
   wanted-but-deferred, decided later at `/plan-roadmap`.

## This phase makes decisions

Committing the product is a series of real forks — which auth model, which
behaviors are in the product at all, where the product's boundary sits. Where you
chose between defensible product options, record it with the
**recording-decisions** skill.

## Discuss first, then commit

Settle the product in chat — resolve intake's open questions, agree the
requirements and boundaries. Do not write the file until the product is agreed;
conversation is cheaper than rewriting a spec.

Once agreed, write **`docs/product-spec.md`** with three sections: Purpose,
Requirements (each with its acceptance criteria), and Non-goals.

Then **stop**. The next step is `/design-architecture`, which designs the shape
that satisfies this spec — do not run it yourself. The product is now committed;
architecture sits on top of it.
