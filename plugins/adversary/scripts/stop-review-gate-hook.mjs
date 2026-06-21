#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  getClaudeAvailability,
  runClaudeReview,
  REVIEWER_ACTIVE_ENV
} from "./lib/claude.mjs";
import { loadPromptTemplate, interpolateTemplate } from "./lib/prompts.mjs";
import { getConfig, getRounds, bumpRounds, resetRounds } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";
import { hasWorkingChanges, workingTreeDiff } from "./lib/git.mjs";
import { parseVerdict, formatBlockReason } from "./lib/verdict.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emitDecision(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function logNote(message) {
  if (message) {
    process.stderr.write(`${message}\n`);
  }
}

function loadPersona() {
  try {
    return loadPromptTemplate(ROOT_DIR, "adversary-persona");
  } catch {
    return "";
  }
}

function buildPrompt(input, diffBlock) {
  const last = String(input.last_assistant_message ?? "").trim();
  const template = loadPromptTemplate(ROOT_DIR, "stop-review-gate");
  const claudeResponseBlock = last
    ? ["<previous_claude_response>", last, "</previous_claude_response>"].join("\n")
    : "";
  const changes = diffBlock
    ? ["<working_tree_changes>", diffBlock, "</working_tree_changes>"].join("\n")
    : "<working_tree_changes>(working tree is clean)</working_tree_changes>";
  return interpolateTemplate(template, {
    CLAUDE_RESPONSE_BLOCK: claudeResponseBlock,
    WORKING_TREE_CHANGES: changes
  });
}

function main() {
  // The reviewer's own Stop must never trigger another review.
  if (process.env[REVIEWER_ACTIVE_ENV]) {
    return;
  }

  const input = readHookInput();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const config = getConfig(workspaceRoot);
  const sessionId = input.session_id || null;

  // Gate disabled -> allow the stop silently.
  if (!config.stopReviewGate) {
    return;
  }

  const availability = getClaudeAvailability();
  if (!availability.available) {
    logNote(
      `Adversary gate: claude CLI unavailable (${availability.detail}). Allowing stop. Run /adversary:setup.`
    );
    return;
  }

  // In "edits" scope, skip the review entirely when nothing changed.
  let diffBlock = "";
  if (config.gateScope !== "all") {
    if (!hasWorkingChanges(cwd)) {
      resetRounds(workspaceRoot, sessionId);
      return;
    }
    diffBlock = workingTreeDiff(cwd);
  } else {
    diffBlock = hasWorkingChanges(cwd) ? workingTreeDiff(cwd) : "";
  }

  // Safety cap: never trap the user in an endless Claude-blocks-Claude loop.
  const maxRounds = Number(config.maxRounds ?? 0);
  if (maxRounds > 0 && sessionId) {
    if (getRounds(workspaceRoot, sessionId) >= maxRounds) {
      resetRounds(workspaceRoot, sessionId);
      logNote(
        `Adversary gate: hit max ${maxRounds} review round(s) this session without converging — allowing stop so you are not trapped. Run /adversary:review for another pass if you want one.`
      );
      return;
    }
  }

  const review = runClaudeReview({
    cwd: workspaceRoot,
    prompt: buildPrompt(input, diffBlock),
    systemPrompt: loadPersona(),
    model: config.reviewerModel || "opus"
  });

  if (!review.ok) {
    // Fail open: a broken or timed-out reviewer must not block the user.
    logNote(`Adversary gate: review did not complete (${review.error || "unknown error"}). Allowing stop.`);
    return;
  }

  const verdict = parseVerdict(review.output);
  if (verdict.decision === "block") {
    if (sessionId) {
      bumpRounds(workspaceRoot, sessionId);
    }
    emitDecision({ decision: "block", reason: formatBlockReason(review.output) });
    return;
  }

  // Allowed -> clear the counter so the next independent issue starts fresh.
  resetRounds(workspaceRoot, sessionId);
  if (verdict.malformed) {
    logNote("Adversary gate: reviewer returned no explicit ALLOW/BLOCK verdict; treating as ALLOW.");
  }
}

try {
  main();
} catch (error) {
  // Never let a gate crash block the user.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}
