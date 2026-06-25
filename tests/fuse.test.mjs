import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { approachFor } from "../plugins/adversary/scripts/lib/fusion.mjs";
import { mkTmp, runCompanion } from "./helpers.mjs";

function countCalls(logFile) {
  if (!fs.existsSync(logFile)) return 0;
  return fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).length;
}

test("approachFor gives distinct angles and cycles", () => {
  assert.notEqual(approachFor(0), approachFor(1));
  assert.equal(approachFor(0), approachFor(5));
});

test("companion fuse runs N parallel drafts + 1 synthesizer and returns the synthesis", () => {
  const dataDir = mkTmp("adv-data-");
  const dir = mkTmp("adv-fuse-");
  const calllog = path.join(mkTmp("adv-log-"), "calls.log");
  const res = runCompanion(["fuse", "--panel", "3", "implement", "a", "rate", "limiter"], {
    repo: dir,
    dataDir,
    verdict: "FINAL: use a token-bucket limiter with a refill timer",
    extraEnv: { FAKE_CLAUDE_CALLLOG: calllog }
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /token-bucket limiter/); // synthesized answer surfaced
  assert.match(res.stdout, /synthesized solution/); // header present
  assert.equal(countCalls(calllog), 4, "expected 3 drafts + 1 synthesizer");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("companion fuse with no task errors out", () => {
  const dataDir = mkTmp("adv-data-");
  const dir = mkTmp("adv-fuse-");
  const res = runCompanion(["fuse", "--json"], { repo: dir, dataDir, verdict: "x" });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /Give a task/);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
