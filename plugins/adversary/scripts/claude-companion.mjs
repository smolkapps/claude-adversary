#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getClaudeAvailability, runClaudeReview } from "./lib/claude.mjs";
import { loadPromptTemplate, interpolateTemplate } from "./lib/prompts.mjs";
import { getConfig, setConfig, loadState } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";
import { workingTreeDiff, branchDiff, hasWorkingChanges, isGitRepo } from "./lib/git.mjs";
import { fuse, formatPanel, clampPanel } from "./lib/fusion.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

function loadPersona() {
  try {
    return loadPromptTemplate(ROOT_DIR, "adversary-persona");
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--enable-gate") flags.enableGate = true;
    else if (arg === "--disable-gate") flags.disableGate = true;
    else if (arg === "--base") flags.base = argv[++i];
    else if (arg === "--model") flags.model = argv[++i];
    else if (arg === "--max-rounds") flags.maxRounds = argv[++i];
    else if (arg === "--scope") flags.scope = argv[++i];
    else if (arg === "--fusion") flags.fusion = true;
    else if (arg === "--panel") flags.panel = argv[++i];
    else positional.push(arg);
  }
  return { flags, positional };
}

function printJson(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function printText(text) {
  process.stdout.write(`${text}\n`);
}

function cmdSetup(flags, workspaceRoot) {
  if (flags.enableGate) setConfig(workspaceRoot, "stopReviewGate", true);
  if (flags.disableGate) setConfig(workspaceRoot, "stopReviewGate", false);
  if (flags.model) setConfig(workspaceRoot, "reviewerModel", flags.model);
  if (flags.maxRounds != null) {
    const parsed = parseInt(flags.maxRounds, 10);
    setConfig(workspaceRoot, "maxRounds", Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
  }
  if (flags.scope) setConfig(workspaceRoot, "gateScope", flags.scope === "all" ? "all" : "edits");
  if (flags.panel != null) {
    const parsedPanel = parseInt(flags.panel, 10);
    setConfig(workspaceRoot, "gatePanel", Number.isFinite(parsedPanel) ? Math.max(1, parsedPanel) : 1);
  }

  const availability = getClaudeAvailability();
  const config = getConfig(workspaceRoot);
  const result = {
    claudeAvailable: availability.available,
    claudeDetail: availability.detail,
    gateEnabled: config.stopReviewGate,
    reviewerModel: config.reviewerModel,
    maxRounds: config.maxRounds,
    gateScope: config.gateScope,
    gatePanel: config.gatePanel,
    workspace: workspaceRoot
  };

  if (flags.json) {
    printJson(result);
    return;
  }
  printText(
    [
      `claude CLI:        ${availability.available ? `ready (${availability.detail})` : `NOT available — ${availability.detail}`}`,
      `Stop review gate:  ${config.stopReviewGate ? "ENABLED" : "disabled"}`,
      `Reviewer model:    ${config.reviewerModel}`,
      `Max rounds:        ${config.maxRounds} ${config.maxRounds === 0 ? "(unlimited)" : ""}`.trim(),
      `Gate scope:        ${config.gateScope}`,
      `Gate panel:        ${config.gatePanel} ${config.gatePanel > 1 ? "(fusion)" : "(single critic)"}`,
      `Workspace:         ${workspaceRoot}`
    ].join("\n")
  );
}

function cmdStatus(flags, workspaceRoot) {
  const state = loadState(workspaceRoot);
  const availability = getClaudeAvailability();
  const result = {
    claudeAvailable: availability.available,
    claudeDetail: availability.detail,
    config: state.config,
    activeRounds: state.rounds,
    workspace: workspaceRoot
  };
  if (flags.json) {
    printJson(result);
    return;
  }
  printText(
    [
      `claude CLI:        ${availability.available ? "ready" : `NOT available — ${availability.detail}`}`,
      `Stop review gate:  ${state.config.stopReviewGate ? "ENABLED" : "disabled"}`,
      `Reviewer model:    ${state.config.reviewerModel}`,
      `Max rounds:        ${state.config.maxRounds}`,
      `Gate scope:        ${state.config.gateScope}`,
      `Gate panel:        ${state.config.gatePanel} ${state.config.gatePanel > 1 ? "(fusion)" : "(single critic)"}`,
      `Active round state: ${JSON.stringify(state.rounds)}`,
      `Workspace:         ${workspaceRoot}`
    ].join("\n")
  );
}

async function cmdReview(flags, positional, cwd, workspaceRoot, { adversarial }) {
  const availability = getClaudeAvailability();
  if (!availability.available) {
    const msg = `Adversary reviewer unavailable: claude CLI not found (${availability.detail}). Run /adversary:setup.`;
    if (flags.json) printJson({ ok: false, error: msg });
    else printText(msg);
    process.exitCode = 1;
    return;
  }

  if (!isGitRepo(cwd)) {
    const msg = "Not inside a git repository, so there are no changes to review.";
    if (flags.json) printJson({ ok: false, error: msg });
    else printText(msg);
    return;
  }

  let target;
  let diff;
  if (flags.base) {
    target = `branch vs ${flags.base}`;
    diff = branchDiff(cwd, flags.base);
  } else {
    if (!hasWorkingChanges(cwd)) {
      const msg = "No uncommitted changes to review. Use --base <ref> to review a whole branch.";
      if (flags.json) printJson({ ok: true, output: msg });
      else printText(msg);
      return;
    }
    target = "working tree (uncommitted changes)";
    diff = workingTreeDiff(cwd);
  }

  const focus = positional.join(" ").trim();
  const templateName = adversarial ? "adversarial-review" : "review";
  const model = flags.model || getConfig(workspaceRoot).reviewerModel || "opus";
  const persona = loadPersona();
  const basePrompt = interpolateTemplate(loadPromptTemplate(ROOT_DIR, templateName), {
    TARGET_LABEL: target,
    USER_FOCUS: focus || "(none provided)",
    REVIEW_INPUT: diff
  });

  const fusionActive = Boolean(flags.fusion) || (flags.panel != null && Number(flags.panel) > 1);

  let result;
  let panel = null;
  if (fusionActive) {
    const fused = await fuse({
      cwd: workspaceRoot,
      model,
      basePrompt,
      systemPrompt: persona,
      panel: flags.panel ?? 3,
      buildSynthesisPrompt: (panelOutputs) =>
        interpolateTemplate(loadPromptTemplate(ROOT_DIR, "fusion-synthesis"), {
          TARGET_LABEL: target,
          USER_FOCUS: focus || "(none provided)",
          REVIEW_INPUT: diff,
          PANEL_REVIEWS: formatPanel(panelOutputs)
        })
    });
    result = fused;
    panel = fused.panel;
  } else {
    result = runClaudeReview({ cwd: workspaceRoot, prompt: basePrompt, systemPrompt: persona, model });
  }

  if (flags.json) {
    printJson({
      ok: result.ok,
      mode: fusionActive ? "fusion" : "single",
      output: result.output,
      error: result.error,
      panel
    });
  } else {
    if (fusionActive) {
      printText(`# Fusion review — ${clampPanel(flags.panel ?? 3)} lens-diversified reviewers (${model}) synthesized\n`);
    }
    printText(result.output || result.error || "(no output)");
  }
  if (!result.ok) process.exitCode = 1;
}

async function main() {
  const subcommand = process.argv[2];
  const { flags, positional } = parseArgs(process.argv.slice(3));
  const cwd = process.cwd();
  const workspaceRoot = resolveWorkspaceRoot(cwd);

  switch (subcommand) {
    case "setup":
      return cmdSetup(flags, workspaceRoot);
    case "status":
      return cmdStatus(flags, workspaceRoot);
    case "review":
      return cmdReview(flags, positional, cwd, workspaceRoot, { adversarial: false });
    case "adversarial-review":
      return cmdReview(flags, positional, cwd, workspaceRoot, { adversarial: true });
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand ?? "(none)"}\n`);
      process.stderr.write("Usage: claude-companion.mjs <setup|status|review|adversarial-review> [options]\n");
      process.exitCode = 1;
      return undefined;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
