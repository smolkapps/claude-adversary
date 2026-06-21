---
description: Show the adversary gate configuration and current per-session round state
allowed-tools: Bash(node:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" status --json
```

Present the configuration to the user: whether the Stop review gate is enabled, the reviewer model, the max-rounds cap, the gate scope, and any active per-session round counters. Do not change anything.
