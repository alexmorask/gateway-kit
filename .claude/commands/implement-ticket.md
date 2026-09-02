---
description: Build the next ticket from the roadmap board with TDD — failing test, implement, green, review, prove the definition of done, commit, and close it.
argument-hint: [optional ticket title to target; defaults to the next todo]
---

This is the **build** phase: take one ticket to done. One ticket per run — the
human stays in the loop *between* tickets, not inside them. Follow the project
conventions in `CLAUDE.md` throughout (no code comments, config-is-data,
stdlib-first-deps-until-earned, structured logging, and the commit convention).

## Pick the ticket

Read `docs/roadmap.md`. If it does not exist, stop and tell the user to run
`/plan-roadmap` first — there is no board to build from.

Take the ticket named in $ARGUMENTS if one was given; otherwise take the first
`todo` ticket in the ordered Core board. Restate it: its slice, its acceptance
criterion, and its definition of done. If no `todo` tickets remain, say the board
is clear, suggest pulling from backlog via `/plan-roadmap` if time allows, and
stop.

## Build it

First decide which kind of ticket this is. TDD governs *behavior*; it does not
govern *setup*.

**Scaffolding / setup tickets** — a ticket that only establishes structure or
tooling (the package manifest, typechecker config, test and run scripts,
directory layout, a mock upstream) has no behavior to assert yet. Do **not**
fabricate a test that a config file exists — that is a smell, not a test.
Establish the structure, then prove it by running: the test command executes
(even with zero or one placeholder test), the typechecker passes, and the app
starts. Verification here is execution, not a failing-test-first cycle.

**Behavior tickets** — everything that asserts observable behavior is test-first:

1. **Red.** Write a test that asserts the ticket's acceptance behavior, and watch
   it fail for the right reason. Test pure logic directly; test wired behavior
   through the running system. Do not write implementation first.
2. **Green.** Write the minimum implementation that makes the test pass. No
   speculative extras — only what this ticket needs.
3. **Refactor.** Clean up while the tests stay green: remove duplication, improve
   names, keep units small and single-purpose. The code must read on its own — if
   it needs a comment to be understood, rewrite it instead.

## Prove the definition of done

Do not claim done without the evidence in hand. Run and confirm, in order:

- **Tests green** — run the suite; report the actual result, don't assert it.
  For a behavior ticket the new test passes; for a scaffolding ticket the test
  command itself runs cleanly.
- **Typecheck clean** — run the typechecker.
- **It runs** — exercise the behavior end-to-end against the running system, not
  just the unit test.
- **Docs updated** — reflect the change in `docs/architecture.md` (the living
  spec) if the shape or behavior changed.

If any check fails, fix it before continuing. Evidence before assertions.

## Review before committing

Re-read your own diff with a critical eye, as a reviewer would:

- Does it actually satisfy the acceptance criterion, including edge cases?
- Any dead code, leftover comments, duplication, or a simpler equivalent?
- Does it match the conventions in `CLAUDE.md` and the surrounding code's style?

Fix what you find. If a real fork came up during the build — an implementation
approach with a defensible alternative, or a reversal of an earlier design
decision — record it with the **recording-decisions** skill.

## Commit and close

Commit the slice as one coherent change, following the commit convention in
`CLAUDE.md`. Then flip the ticket's status to `done` in `docs/roadmap.md`.

Report what shipped, the evidence that it's done, and which ticket is next. Then
**stop** — the user decides when to run the next ticket.
