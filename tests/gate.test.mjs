import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import {
  mkTmp,
  initRepoWithChange,
  commitAll,
  runGate,
  runCompanion
} from "./helpers.mjs";

function enableGate(repo, dataDir, extra = []) {
  const res = runCompanion(["setup", "--enable-gate", "--json", ...extra], { repo, dataDir });
  assert.equal(res.status, 0, `setup failed: ${res.stderr}`);
  return res;
}

test("gate disabled by default: no block even on a dirty tree", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  const res = runGate({ repo, dataDir, verdict: "BLOCK: bug" });
  assert.equal(res.stdout, "", "gate should be silent when disabled");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("gate BLOCKs and surfaces the reviewer reason", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  enableGate(repo, dataDir);
  const res = runGate({ repo, dataDir, verdict: "BLOCK: foo.js leaks a handle" });
  const payload = JSON.parse(res.stdout);
  assert.equal(payload.decision, "block");
  assert.match(payload.reason, /foo\.js leaks a handle/);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("gate ALLOWs when the reviewer is satisfied", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  enableGate(repo, dataDir);
  const res = runGate({ repo, dataDir, verdict: "ALLOW: clean" });
  assert.equal(res.stdout, "", "ALLOW should produce no decision payload");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("edits scope fast-path: clean tree is allowed without invoking the reviewer", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  enableGate(repo, dataDir);
  commitAll(repo); // tree now clean
  // Even with a BLOCK verdict configured, the clean-tree fast path must allow.
  const res = runGate({ repo, dataDir, verdict: "BLOCK: should never run" });
  assert.equal(res.stdout, "");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("recursion guard: reviewer's own Stop is a no-op", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  enableGate(repo, dataDir);
  const res = runGate({
    repo,
    dataDir,
    verdict: "BLOCK: bug",
    extraEnv: { CLAUDE_ADVERSARY_ACTIVE: "1" }
  });
  assert.equal(res.stdout, "", "nested reviewer must not trigger another gate");
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("max-rounds cap: stops blocking after the configured number of rounds", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  enableGate(repo, dataDir, ["--max-rounds", "1"]);

  const first = runGate({ repo, dataDir, verdict: "BLOCK: still broken" });
  assert.equal(JSON.parse(first.stdout).decision, "block", "first round should block");

  const second = runGate({ repo, dataDir, verdict: "BLOCK: still broken" });
  assert.equal(second.stdout, "", "second round should hit the cap and allow");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("companion review returns the reviewer output for a dirty tree", () => {
  const dataDir = mkTmp("adv-data-");
  const repo = initRepoWithChange();
  const res = runCompanion(["review"], { repo, dataDir, verdict: "no-ship: foo.js is wrong" });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /foo\.js is wrong/);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
