import { spawn, spawnSync } from "node:child_process";

// Set in the reviewer's environment so that the reviewer's OWN Stop hook
// becomes a no-op. Without this, a gate review would recursively trigger
// another gate review.
export const REVIEWER_ACTIVE_ENV = "CLAUDE_ADVERSARY_ACTIVE";

// Lets tests (and power users) point at a specific/fake claude binary.
const CLI_ENV = "CLAUDE_ADVERSARY_CLI";

// Read-only tool allowlist for the reviewer. Pre-approved tools run without a
// prompt in -p mode; anything not listed is denied (never blocks/hangs), so the
// reviewer cannot edit, commit, push, or run arbitrary commands.
const READONLY_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git status:*)",
  "Bash(git ls-files:*)",
  "Bash(git blame:*)",
  "Bash(cat:*)",
  "Bash(ls:*)",
  "Bash(rg:*)",
  "Bash(fd:*)",
  "Bash(sed:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(wc:*)",
  "Bash(find:*)"
];

export function claudeCli() {
  return process.env[CLI_ENV] || "claude";
}

export function getClaudeAvailability() {
  try {
    const res = spawnSync(claudeCli(), ["--version"], { encoding: "utf8" });
    if (res.status === 0) {
      return { available: true, detail: (res.stdout || "").trim() || "claude CLI available" };
    }
    return {
      available: false,
      detail: (res.stderr || res.stdout || "`claude --version` failed").trim()
    };
  } catch (err) {
    return { available: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run a one-shot, read-only adversarial review with a separate headless Claude.
 * Returns { ok, output, error, timedOut }.
 */
export function runClaudeReview({
  cwd,
  prompt,
  systemPrompt,
  model,
  timeoutMs = 14 * 60 * 1000,
  maxTurns = 40
}) {
  const args = ["-p"];
  if (model) {
    args.push("--model", model);
  }
  if (systemPrompt) {
    args.push("--append-system-prompt", systemPrompt);
  }
  args.push("--allowedTools", READONLY_TOOLS.join(","));
  args.push("--max-turns", String(maxTurns));
  args.push(prompt);

  const env = { ...process.env, [REVIEWER_ACTIVE_ENV]: "1" };

  let res;
  try {
    res = spawnSync(claudeCli(), args, {
      cwd,
      env,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      input: "" // close stdin so -p never waits on it
    });
  } catch (err) {
    return { ok: false, output: "", error: err instanceof Error ? err.message : String(err) };
  }

  if (res.error && res.error.code === "ETIMEDOUT") {
    return { ok: false, timedOut: true, output: "", error: "reviewer timed out" };
  }
  if (res.error) {
    return { ok: false, output: "", error: res.error.message || String(res.error) };
  }
  if (res.status !== 0) {
    return {
      ok: false,
      output: (res.stdout || "").trim(),
      error: (res.stderr || res.stdout || `claude exited ${res.status}`).trim()
    };
  }
  return { ok: true, output: (res.stdout || "").trim(), error: null };
}

/**
 * Async variant of runClaudeReview, for running a panel of reviewers in
 * parallel (fusion). Same flags and guards; never rejects — resolves to
 * { ok, output, error, timedOut }.
 */
export function runClaudeReviewAsync({
  cwd,
  prompt,
  systemPrompt,
  model,
  timeoutMs = 14 * 60 * 1000,
  maxTurns = 40
}) {
  return new Promise((resolve) => {
    const args = ["-p"];
    if (model) {
      args.push("--model", model);
    }
    if (systemPrompt) {
      args.push("--append-system-prompt", systemPrompt);
    }
    args.push("--allowedTools", READONLY_TOOLS.join(","));
    args.push("--max-turns", String(maxTurns));
    args.push(prompt);

    const env = { ...process.env, [REVIEWER_ACTIVE_ENV]: "1" };

    let child;
    try {
      child = spawn(claudeCli(), args, { cwd, env });
    } catch (err) {
      resolve({ ok: false, output: "", error: err instanceof Error ? err.message : String(err) });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish({ ok: false, timedOut: true, output: stdout.trim(), error: "reviewer timed out" });
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (err) => {
      finish({ ok: false, output: "", error: err instanceof Error ? err.message : String(err) });
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true, output: stdout.trim(), error: null });
      } else {
        finish({
          ok: false,
          output: stdout.trim(),
          error: (stderr || stdout || `claude exited ${code}`).trim()
        });
      }
    });

    if (child.stdin) {
      child.stdin.end();
    }
  });
}
