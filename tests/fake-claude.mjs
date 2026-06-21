#!/usr/bin/env node
// Test double for the `claude` CLI. Honors `--version` (availability checks)
// and otherwise prints the canned verdict in FAKE_CLAUDE_VERDICT so the gate
// and companion can be exercised end-to-end without spending real tokens.
import process from "node:process";

const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("fake-claude 0.0.0 (Claude Code)\n");
  process.exit(0);
}

const verdict = process.env.FAKE_CLAUDE_VERDICT || "ALLOW: nothing to flag";
process.stdout.write(`${verdict}\n`);
process.exit(0);
