import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  REVIEW_LENSES,
  lensFor,
  clampPanel
} from "../plugins/adversary/scripts/lib/fusion.mjs";
import { mkTmp, initRepoWithChange, runCompanion, runGate } from "./helpers.mjs";

function countCalls(logFile) {
  if (!fs.existsSync(logFile)) return 0;
  return fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).length;
}

function newCallLog() {
  return path.join(mkTmp("adv-log-"), "calls.log");
}

test("clampPanel clamps to [2, lens count] with a sane fallback", () => {
  assert.equal(clampPanel(3), 3);
  assert.equal(clampPanel(1), 2);
  assert.equal(clampPanel(99), REVIEW_LENSES.length);
  assert.equal(clampPanel("nonsense"), 3);
});

test("lensFor cycles through the lens list", () => {
  assert.equal(lensFor(0), REVIEW_LENSES[0]);
  assert.equal(lensFor(REVIEW_LENSES.length), REVIEW_LENSES[0]);
  assert.notEqual(lensFor(0), lensFor(1));
});

test("companion fusion review runs N panel reviewers + 1 synthesizer", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  const calllog = newCallLog();
  const res = runCompanion(["review", "--fusion", "--panel", "3"], {
    repo,
    dataDir,
    verdict: "no-ship: foo.js is broken",
    extraEnv: { FAKE_CLAUDE_CALLLOG: calllog }
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /foo\.js is broken/); // synthesized output surfaced
  assert.match(res.stdout, /Fusion review/); // header present
  assert.equal(countCalls(calllog), 4, "expected 3 panel + 1 synthesizer calls");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("gate fusion (gatePanel>1) runs the panel + synthesizer and can BLOCK", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  // enable gate AND set panel to 2 in one setup call
  const setup = runCompanion(["setup", "--enable-gate", "--json", "--panel", "2"], { repo, dataDir });
  assert.equal(setup.status, 0, setup.stderr);

  const calllog = newCallLog();
  const res = runGate({
    repo,
    dataDir,
    verdict: "BLOCK: panel found a real bug",
    extraEnv: { FAKE_CLAUDE_CALLLOG: calllog }
  });
  assert.equal(JSON.parse(res.stdout).decision, "block");
  assert.equal(countCalls(calllog), 3, "expected 2 panel + 1 synthesizer calls");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("single-critic gate (default panel=1) makes exactly one review call", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  const setup = runCompanion(["setup", "--enable-gate", "--json"], { repo, dataDir });
  assert.equal(setup.status, 0, setup.stderr);

  const calllog = newCallLog();
  const res = runGate({
    repo,
    dataDir,
    verdict: "BLOCK: one critic",
    extraEnv: { FAKE_CLAUDE_CALLLOG: calllog }
  });
  assert.equal(JSON.parse(res.stdout).decision, "block");
  assert.equal(countCalls(calllog), 1, "single critic should make exactly one call");
  fs.rmSync(dataDir, { recursive: true, force: true });
});
