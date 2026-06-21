import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { parseVerdict, formatBlockReason } from "../plugins/adversary/scripts/lib/verdict.mjs";
import {
  hasWorkingChanges,
  workingTreeDiff,
  isGitRepo
} from "../plugins/adversary/scripts/lib/git.mjs";
import {
  getRounds,
  bumpRounds,
  resetRounds,
  getConfig,
  setConfig
} from "../plugins/adversary/scripts/lib/state.mjs";
import { mkTmp, initRepoWithChange, commitAll } from "./helpers.mjs";

test("parseVerdict: BLOCK on first line", () => {
  const v = parseVerdict("BLOCK: missing null check\n- foo.js:10 explodes");
  assert.equal(v.decision, "block");
  assert.match(v.reason, /missing null check/);
});

test("parseVerdict: ALLOW on first line", () => {
  const v = parseVerdict("ALLOW: looks fine");
  assert.equal(v.decision, "allow");
  assert.equal(v.malformed, undefined);
});

test("parseVerdict: tolerates a leading blank line", () => {
  const v = parseVerdict("\n\nBLOCK: bad\nrest");
  assert.equal(v.decision, "block");
});

test("parseVerdict: empty output fails open to ALLOW", () => {
  const v = parseVerdict("");
  assert.equal(v.decision, "allow");
  assert.equal(v.malformed, true);
});

test("parseVerdict: garbage with no verdict fails open to ALLOW", () => {
  const v = parseVerdict("the change looks good to me");
  assert.equal(v.decision, "allow");
  assert.equal(v.malformed, true);
});

test("formatBlockReason embeds the full review body", () => {
  const reason = formatBlockReason("BLOCK: x\n- detail");
  assert.match(reason, /NOT satisfied/);
  assert.match(reason, /- detail/);
});

test("git helpers detect working changes and clear after commit", () => {
  const repo = initRepoWithChange();
  assert.equal(isGitRepo(repo), true);
  assert.equal(hasWorkingChanges(repo), true);
  assert.match(workingTreeDiff(repo), /foo\.js/);
  commitAll(repo);
  assert.equal(hasWorkingChanges(repo), false);
});

test("round counters bump and reset per session", () => {
  const dataDir = mkTmp("adv-data-");
  process.env.CLAUDE_PLUGIN_DATA = dataDir;
  const ws = mkTmp("adv-ws-");
  assert.equal(getRounds(ws, "sess"), 0);
  assert.equal(bumpRounds(ws, "sess"), 1);
  assert.equal(bumpRounds(ws, "sess"), 2);
  assert.equal(getRounds(ws, "sess"), 2);
  resetRounds(ws, "sess");
  assert.equal(getRounds(ws, "sess"), 0);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("config round-trips through state", () => {
  const dataDir = mkTmp("adv-data-");
  process.env.CLAUDE_PLUGIN_DATA = dataDir;
  const ws = mkTmp("adv-ws-");
  assert.equal(getConfig(ws).stopReviewGate, false);
  setConfig(ws, "stopReviewGate", true);
  setConfig(ws, "reviewerModel", "sonnet");
  const cfg = getConfig(ws);
  assert.equal(cfg.stopReviewGate, true);
  assert.equal(cfg.reviewerModel, "sonnet");
  fs.rmSync(dataDir, { recursive: true, force: true });
});
