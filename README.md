# adversary — Claude reviews Claude

A Claude Code plugin that puts a **second, adversarial Claude** between your work and "done." It is the Claude-on-Claude analogue of the OpenAI `codex` plugin's review gate: instead of GPT/Codex reviewing Claude, a separate Claude instance reviews Claude — and can refuse to let you stop until real problems are addressed.

> The point of an adversary is independence, not a different model. The reviewer is a *separate* Claude process with its own context and a system prompt whose entire job is to prove the work wrong, not to confirm it is right.

## Why Claude-on-Claude?

The reviewer defaults to **Opus 4.8 reviewing Opus 4.8** — the same model on both sides. The value isn't a smarter judge; it's a *second pass with independent context whose only goal is to find fault.*

There's evidence the self-review step itself carries most of the weight. In OpenRouter's **Fusion** testing on the DRACO deep-research benchmark, **Opus 4.8 paired with itself scored 65.5% — up 6.7 points from solo Opus 4.8 (58.8%), essentially matching solo Claude Fable 5 (65.3%)** — and OpenRouter attributed roughly three-quarters of that lift to the synthesis/self-review step rather than to model diversity ([OpenRouter](https://openrouter.ai/blog/announcements/fusion-beats-frontier/)).

Treat that as support for the *idea*, not a benchmark of this plugin: OpenRouter measured a fusion setup (parallel panel → judge → Opus synthesizer) on a research task, with caveats (a web-access rubric-contamination risk; Fable had 7/100 tasks blocked by its own filters). A same-model critique loop measurably lifts quality. A future `--fusion` mode (N drafts → judge → synthesize) would track that setup more closely than the current single-critic gate.

## What you get

- **`/adversary:setup`** — check the `claude` CLI is ready and enable/disable the Stop-time review gate.
- **`/adversary:review`** — a skeptical, read-only review of your current diff by a separate headless Claude.
- **`/adversary:adversarial-review "<focus>"`** — a steerable challenge review that questions the *approach and design*, not just the code.
- **`/adversary:status`** — show the gate config and per-session round state.
- **`adversary-reviewer` subagent** — dispatch an in-session second opinion via the Agent tool.
- **The Stop review gate** — the headline feature: after any turn that changed code, a separate Claude reviews the work. If it answers `BLOCK`, the stop is blocked and the main Claude must fix the issue (or rebut it) before it can finish. This is the "consistently tells you when you're wrong" mode.

## Install

```bash
/plugin marketplace add ~/Documents/projects/claude-adversary
/plugin install adversary@claude-adversary
/reload-plugins
/adversary:setup
```

`/adversary:setup` confirms the `claude` CLI is on your PATH (the reviewer is just `claude -p` under the hood).

## The review gate

```bash
/adversary:setup --enable-gate              # turn it on
/adversary:setup --disable-gate             # turn it off
/adversary:setup --model sonnet             # cheaper/faster reviewer
/adversary:setup --max-rounds 3             # cap consecutive blocks per session (0 = unlimited)
/adversary:setup --scope all                # review every turn, not just code-changing ones
```

When enabled, a `Stop` hook runs a targeted review of your last turn. `BLOCK` ->
the stop is blocked with the reviewer's findings; `ALLOW` -> you stop normally.

**It costs tokens and adds latency** — it spawns a full Claude on every qualifying Stop. Enable it when you are actively monitoring a session. It is bounded and safe by design:

- **Recursion guard** — the reviewer runs with `CLAUDE_ADVERSARY_ACTIVE=1`, so its own Stop never triggers another review.
- **Max-rounds cap** — after N consecutive blocks in a session it allows the stop so you can never get trapped in a Claude-blocks-Claude loop. (The Codex plugin's own README warns its gate can loop and "drain usage limits quickly"; this one bounds it.)
- **Fails open** — a broken, timed-out, or verdict-less reviewer allows the stop rather than trapping you.
- **Edits-scope fast path** — in the default `edits` scope, a clean working tree is allowed without spending a review at all.
- **Read-only reviewer** — the reviewer is restricted to read/inspect tools; it cannot edit, commit, or push.

## Layout

```
plugins/adversary/
  .claude-plugin/plugin.json
  hooks/hooks.json                 # Stop + SessionEnd
  commands/                        # setup, review, adversarial-review, status
  agents/adversary-reviewer.md     # in-session second-opinion subagent
  prompts/                         # persona + task templates (ALLOW/BLOCK contract)
  skills/adversary-review/         # discovery skill
  scripts/
    stop-review-gate-hook.mjs      # the gate
    session-lifecycle-hook.mjs     # per-session round cleanup
    claude-companion.mjs           # setup/status/review/adversarial-review CLI
    lib/                           # claude, git, state, verdict, prompts, workspace
```

## Develop

```bash
npm test        # node --test; uses a fake claude binary, spends no tokens
```

Requirements: Node 18.18+ and the `claude` CLI on PATH.

## Acknowledgements & license

Licensed under **Apache-2.0** (see `LICENSE` / `NOTICE`). This is an independent, Claude-on-Claude reimplementation inspired by OpenAI's [Codex plugin for Claude Code](https://github.com/openai/codex-plugin-cc) (Copyright 2026 OpenAI, Apache-2.0): the optional Stop-gate hook contract, some prompt scaffolding, and the per-workspace state layout are adapted from it. The reviewer here is Claude via the `claude` CLI, not Codex.
