---
description: Check whether the adversary (a second Claude) is ready, and enable/disable the Stop-time review gate
argument-hint: '[--enable-gate|--disable-gate] [--model <m>] [--max-rounds <n>] [--scope edits|all] [--panel <n>]'
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" setup --json $ARGUMENTS
```

Then present the result to the user in plain language.

Notes:

- If `claudeAvailable` is false, tell the user the `claude` CLI was not found on PATH and that the gate and review commands cannot run until it is.
- If the gate was just enabled (`--enable-gate`), warn the user: the gate spawns a second Claude on every Stop that changed code, which costs tokens and adds latency. It is bounded by `maxRounds` per session and fails open, but they should disable it with `/adversary:setup --disable-gate` when they are done.
- `--scope all` reviews every turn (even pure answers), not just code-changing turns. `--scope edits` (default) only reviews turns that touched the working tree.
- `--panel N` (N>1) makes the gate itself a fusion panel: N parallel reviewers + a synthesizer per qualifying Stop, at N+1x the cost. `--panel 1` (default) is a single critic.
- Do not take any other action; this command only configures the plugin.
