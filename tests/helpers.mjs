import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(HERE, "..", "plugins", "adversary");
export const SCRIPTS_DIR = path.join(PLUGIN_ROOT, "scripts");
export const GATE_HOOK = path.join(SCRIPTS_DIR, "stop-review-gate-hook.mjs");
export const COMPANION = path.join(SCRIPTS_DIR, "claude-companion.mjs");
export const FAKE_CLAUDE = path.join(HERE, "fake-claude.mjs");

export function mkTmp(prefix = "adv-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function git(cwd, args) {
  return spawnSync(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" }
  );
}

export function initRepoWithChange() {
  const repo = mkTmp("adv-repo-");
  git(repo, ["init", "-q"]);
  fs.writeFileSync(path.join(repo, "foo.js"), "export const x = 1;\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "init"]);
  // leave an uncommitted change so the working tree is dirty
  fs.writeFileSync(path.join(repo, "foo.js"), "export const x = 2;\n");
  return repo;
}

export function commitAll(repo) {
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "snapshot"]);
}

/** Run the Stop gate hook as a child, feeding hook JSON on stdin. */
export function runGate({ repo, dataDir, verdict, extraEnv = {}, hookInput = {} }) {
  const input = JSON.stringify({
    session_id: "s1",
    cwd: repo,
    last_assistant_message: "I edited foo.js",
    ...hookInput
  });
  const res = spawnSync(process.execPath, [GATE_HOOK], {
    cwd: repo,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      CLAUDE_ADVERSARY_CLI: FAKE_CLAUDE,
      CLAUDE_PLUGIN_DATA: dataDir,
      ...(verdict ? { FAKE_CLAUDE_VERDICT: verdict } : {}),
      ...extraEnv
    }
  });
  return { stdout: (res.stdout || "").trim(), stderr: (res.stderr || "").trim(), status: res.status };
}

/** Run the companion CLI as a child. */
export function runCompanion(subArgs, { repo, dataDir, verdict, extraEnv = {} }) {
  const res = spawnSync(process.execPath, [COMPANION, ...subArgs], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_ADVERSARY_CLI: FAKE_CLAUDE,
      CLAUDE_PLUGIN_DATA: dataDir,
      ...(verdict ? { FAKE_CLAUDE_VERDICT: verdict } : {}),
      ...extraEnv
    }
  });
  return { stdout: (res.stdout || "").trim(), stderr: (res.stderr || "").trim(), status: res.status };
}
