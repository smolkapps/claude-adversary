---
description: Run a steerable, adversarial second-Claude review that challenges the approach and design, not just the code
argument-hint: '[--base <ref>] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*)
---

Spawn a separate, headless Claude to run an **adversarial** review of the current changes — one that questions the chosen implementation, the design, the tradeoffs, and the assumptions, not just local defects.

Raw arguments: `$ARGUMENTS`

Rules:

- This command is review-only. Do NOT fix issues or apply patches; your only job is to run the review and return its output verbatim.
- Any text after the flags is treated as focus, e.g. `/adversary:adversarial-review --base main challenge whether this caching design is right`. Preserve the user's focus text exactly; do not weaken the adversarial framing.
- Default target is the working tree. `--base <ref>` reviews the branch against that ref.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" adversarial-review $ARGUMENTS
```

Return the command's stdout exactly as-is. Do not paraphrase or add commentary before or after it.
