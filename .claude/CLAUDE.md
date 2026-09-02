# gateway-kit

A lightweight, config-driven API gateway in Node.js/TypeScript — routing,
proxying, and a middleware pipeline built primarily on the standard library.

This file is the always-on convention layer. The slash commands below drive the
process; the conventions here hold in every phase, on every change.

## How we work

Build proceeds through deliberate phases, each its own command. Every phase ends
at a **human checkpoint** — the point is that a person, not autopilot, signs off
before the next phase begins.

| Command | Decides / does | Reads | Writes |
| --- | --- | --- | --- |
| `/perform-intake` | Understand the problem (conversational) | the prompt | `docs/intake.md` |
| `/write-product-specification` | The product: requirements + acceptance + non-goals | `intake.md` | `docs/product-spec.md` |
| `/design-architecture` | The shape that satisfies the spec + per-requirement cost | `product-spec.md` | `docs/architecture.md`, `docs/decisions.md` |
| `/plan-roadmap` | What fits the budget, ordered, as a ticket board | `product-spec.md`, `architecture.md` | `docs/roadmap.md` |
| `/implement-ticket` | Build the next ticket to done (TDD) | `roadmap.md` | code, doc + decision updates |
| `/finalize-readme` | Write the README + root DECISIONS.md from what actually shipped | all docs + code | `README.md`, `DECISIONS.md` |

`/implement-ticket` repeats — one ticket per run — until the board's core is done
or the time-box is reached; then `/finalize-readme` closes out the build.

Do not skip ahead or run the next phase automatically. Each command stops and
hands back.

## Stack

- **TypeScript on Node**, run directly via native type-stripping — no build step.
  This requires **Node ≥ 22.6** (flagged) or **≥ 23** (default); the graders run
  our gateway on their own machine, so the required Node version is a promise the
  README must state up front, and `package.json` should pin it via `engines`.
- **`node --test`** for tests; **`tsc --noEmit`** for typechecking.
- **Minimal runtime dependencies.** The standard library is the default. A
  dependency has to earn its place against the cost of adding it; reach for one
  only when the stdlib genuinely can't do the job, and record the decision. The
  one place the stdlib genuinely can't help is **YAML parsing** — a parser is
  explicitly permitted by the challenge, and the config must load *any* valid
  file following the schema, not just the sample. Whether we take a small YAML
  dependency or hand-roll a scoped parser is an architecture decision to settle
  and record, not a foregone conclusion — but a hand-rolled parser that breaks on
  the graders' unseen config fails a non-negotiable requirement, so weigh that
  risk explicitly.

## Code conventions

- **No code comments.** The code must read on its own. A comment that explains
  *what* the code is doing is a signal the code should be rewritten — clearer
  names, smaller functions, better structure carry the meaning instead. (Comments
  that are part of an API contract, like a config schema, are not this.)
- **Small, single-purpose units** with clear interfaces — each understandable and
  testable in isolation. If a unit's internals must be explained before it can be
  used, the boundary is wrong.
- **Config is data.** Routes and policies live in a config file loaded and
  validated at startup, never hardcoded.
- **Structured logging** — one JSON line per request, with the correlation id.

## Testing

- **TDD for behavior:** failing test → minimum code to pass → refactor. Test pure
  logic directly; test wired behavior through the running system.
- **Setup is proven by running,** not test-first. Scaffolding and tooling
  (manifest, config, scripts) have no behavior to assert — don't fabricate tests
  for them; run them to prove they work.

## Definition of done

Every ticket clears the same bar before it is `done`:

- tests green (reported, not asserted)
- typecheck clean
- it runs end-to-end
- docs updated (`docs/architecture.md` is the living spec)
- committed

Evidence before assertions — never claim done without having run the checks.

## Commits

One coherent slice per commit. Imperative subject line; the body says *why*, not
just what. (The harness appends its own session trailer — don't add one by hand.)

## Decisions

When you settle a genuine fork — an architectural choice, a scope cut, a reversal
of an earlier call — record it with the **recording-decisions** skill, in
`docs/decisions.md`. Routine mechanics with no defensible alternative are not
decisions. The log is the defense script: why the system is the way it is.

`docs/decisions.md` is the running fork-by-fork log we keep as we build. The
**graded deliverable is a `DECISIONS.md` at the repo root** — a different, more
narrative document the challenge requires, covering: how we prioritized which
config features to implement, the architecture choices and trade-offs, what we'd
build next, the current state of anything partially built, and how AI tools were
used. `/finalize-readme` authors it at the end, drawing on the running log; don't
conflate the two.
