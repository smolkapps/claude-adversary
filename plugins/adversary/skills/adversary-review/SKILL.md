---
name: adversary-review
description: Use when the user wants a second, adversarial Claude opinion on work — "second-guess this", "red-team my change", "what's wrong with this", "poke holes in this", "review before I commit/ship", "tell me why this is wrong", or when about to claim something is done and it should be challenged first. Routes to the adversary-reviewer subagent or the /adversary review commands.
---

# Adversary Review (Claude vs Claude)

A second, adversarial Claude that second-guesses the work — whose job is to prove it wrong, not to confirm it. Three ways to invoke it:

1. **In-session second opinion (fastest):** dispatch the `adversary-reviewer` subagent (via the Agent tool). It is a fresh Claude with its own context and read-only-leaning tools, told to attack the change and report findings. Best when you are mid-task and want the current work challenged immediately.

2. **Headless review of the diff:** run `/adversary:review` (balanced-but-skeptical) or `/adversary:adversarial-review "<focus>"` (challenges the approach and design). These spawn a *separate* `claude -p` process over the current `git` diff and return its findings verbatim. Use `--base <ref>` to review a whole branch. Review-only — they never edit.

3. **Continuous gate:** `/adversary:setup --enable-gate` turns on a `Stop` hook. After every turn that changed code, a separate Claude reviews the work; if it answers `BLOCK`, the stop is blocked and the main Claude must address the findings (or rebut them) before it can finish. Bounded by `maxRounds` per session and fails open. Disable with `/adversary:setup --disable-gate`. This is the "consistently tells you when you're wrong" mode — it costs tokens, so enable it when you are actively monitoring.

## When to reach for it

- Before a commit, PR, or "this is done" claim.
- When a design decision was made quickly and you want it pressure-tested.
- When the user explicitly asks to be second-guessed, red-teamed, or told why they are wrong.

## Notes

- The reviewer is a different Claude instance, not the same context — it does not share the main thread's assumptions, which is the point.
- It is grounded: it inspects the real diff and code and is told not to invent issues. A clean change should come back "no material findings", not a pile of nitpicks.
- Run `/adversary:setup` first to confirm the `claude` CLI is on PATH.
