---
name: recording-decisions
description: Use when a load-bearing design or scope decision is settled — during architecture, planning, or mid-build — to record it in docs/decisions.md in the Decision → Rationale → Tradeoff → Rejected format. Triggers whenever you choose between defensible alternatives, reverse an earlier decision, or accept a tradeoff a reviewer would question.
---

# Recording Decisions

The decision log is the defense script: it captures *why* the system is the way
it is, so the reasoning survives past the moment it was made. Record a decision
the moment it is settled, while the reasoning is fresh.

## What counts as a decision

Record it when there was a **genuine fork** — two or more defensible options and
you picked one:

- an architectural choice (a structure, an interface, an algorithm),
- a scope call (in-scope vs backlog vs out-of-scope),
- a reversal of an earlier decision,
- an accepted tradeoff a reviewer would question.

Do **not** record routine mechanics that had no real alternative (naming a
variable, using the standard library's obvious function). No defensible
alternative means it is not a decision.

## Format

Append a numbered entry to `docs/decisions.md`. Never renumber existing entries —
a new decision gets the next number, even one that supersedes an earlier one.

```
## N. <short title>

**Decision:** what we chose, in one or two sentences.
**Rationale:** why — the reasoning that makes this the right call here.
**Tradeoff:** what we give up by choosing it. Every real decision costs something.
**Rejected:** the alternatives considered, and why each lost.
```

If a new decision reverses an earlier one, say so explicitly in both entries
("supersedes #5" / "superseded by #12") rather than editing the old one away.
The reversal is part of the story a reviewer wants to hear.

## Keep it lean

One tight entry per decision. The log is a reference you will defend out loud,
not an essay — a reviewer should be able to read any entry in about fifteen
seconds.
