#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

import { resolveWorkspaceRoot } from "./lib/workspace.mjs";
import { resetRounds } from "./lib/state.mjs";

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function main() {
  const event = process.argv[2] || "";
  const input = readHookInput();

  if (event === "SessionEnd") {
    const cwd = input.cwd || process.cwd();
    const sessionId = input.session_id || null;
    if (sessionId) {
      try {
        resetRounds(resolveWorkspaceRoot(cwd), sessionId);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

main();
