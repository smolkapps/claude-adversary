---
description: Have a second, adversarial Claude review your current changes (read-only)
argument-hint: '[--fusion] [--panel N] [--base <ref>] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*)
---

Spawn a separate, headless Claude as a skeptical reviewer over the current changes and return its findings verbatim.

Raw arguments: `$ARGUMENTS`

Rules:

- This command is review-only. Do NOT fix anything, apply patches, or act on the findings unless the user explicitly asks afterward.
- Default target is the working tree (uncommitted changes). `--base <ref>` reviews the branch against that ref instead.
- A full review with a capable model can take a minute or two on a large diff. That is expected.
- `--fusion` (optionally `--panel N`, default 3) runs an N-reviewer panel — each weighting a different lens — plus a synthesizer, instead of a single critic. Broader coverage, ~N+1x cost, run in parallel.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" review $ARGUMENTS
```

Return the command's stdout exactly as-is. Do not summarize, soften, or pre-empt it.
