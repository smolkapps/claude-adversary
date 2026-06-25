---
description: Fuse several Claudes to produce a BETTER solution to a task — N independent drafts synthesized into one best answer (OpenRouter-Fusion style)
argument-hint: '[--panel N] [--model <m>] <task...>'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*)
---

Get a better result on a task by fusing multiple Claudes: N independent drafts run in parallel (each told to favor a different angle — simplicity, robustness, a different approach, performance, maintainability), then a synthesizer merges their strengths into one superior solution. This makes the *output* better; it is not a review and does not block anything.

Everything after the flags is the task. Raw arguments: `$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" fuse $ARGUMENTS
```

Then present the synthesized solution to the user. The individual drafts are intermediate scaffolding — lead with the final synthesized answer. If it is code or a diff, show it clearly and offer to apply it.

- `--panel N` sets how many drafts (default 3; `--panel 2` is the literal "two Claudes + a synthesizer").
- `--model <m>` overrides the model (default Opus, the most capable).
- Cost is N+1 model calls, run in parallel so wall-clock ≈ one call.
