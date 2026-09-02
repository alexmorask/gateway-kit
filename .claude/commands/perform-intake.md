---
description: Read the challenge prompt and understand it — restate the problem, set success criteria, and raise the questions that shape what gets built.
argument-hint: [prompt text, a path to the prompt file, or nothing to be asked for it]
---

You are starting a new build. This is the **intake** phase: understand the
problem through conversation before committing to anything. This phase makes no
decisions and writes no product spec — it exists to make sure you and the user
share the same picture of the problem first. No design, no scope commitment, no
code.

## Input

The challenge prompt is: $ARGUMENTS

If that is empty, ask the user to paste the prompt (or give a path to it) and
stop until they provide it.

## Work it through, conversationally

Read the prompt (read the file if a path was given), then talk it through with
the user:

1. **Restate the problem** in a short paragraph — what we're building, for whom,
   and the hard constraints (time budget, required stack, explicit must-haves).
   Anything the prompt does not actually say is an assumption, not a fact: call
   it out as an assumption for the user to confirm.
2. **State success criteria** — the handful of observable conditions that would
   mean the build is done and demoable. These anchor everything downstream.
3. **Sketch the feature universe** — enumerate what the prompt implies is
   possible, as raw material. Do *not* split it into core vs backlog or commit to
   scope; that is the product spec's job, next. Just get the possibilities on the
   table.
4. **Raise open questions** — the ambiguities that actually change what you'd
   build. Prefer questions whose answers move the shape of the product.

Lead with conversation. The goal is a shared understanding and a clear set of
questions, not a document.

## Then record and stop

Once the user has engaged with the restatement and questions, write a lean
`docs/intake.md` capturing what was discussed: Restatement, Success criteria,
Feature universe, Open questions & assumptions. It is a scannable record of the
conversation, not a specification.

Then **stop**. The next step is `/write-product-specification`, where the product
actually gets decided — do not run it yourself. Intake ends when you and the user
see the same problem the same way.
