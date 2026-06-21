import { spawnSync } from "node:child_process";

function git(cwd, args, maxBuffer = 64 * 1024 * 1024) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer });
  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? ""
  };
}

export function isGitRepo(cwd) {
  return git(cwd, ["rev-parse", "--is-inside-work-tree"]).stdout.trim() === "true";
}

export function statusPorcelain(cwd) {
  return git(cwd, ["status", "--porcelain", "--untracked-files=all"]).stdout;
}

export function hasWorkingChanges(cwd) {
  return statusPorcelain(cwd).trim().length > 0;
}

function clip(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[...truncated ${text.length - maxChars} chars; review the largest files directly...]`;
}

/**
 * A bounded snapshot of uncommitted work: status + staged diff + unstaged diff
 * + untracked file names. Untracked file *contents* are intentionally omitted
 * to keep the prompt bounded.
 */
export function workingTreeDiff(cwd, { maxChars = 60000 } = {}) {
  const status = statusPorcelain(cwd).trim();
  const staged = git(cwd, ["diff", "--cached"]).stdout;
  const unstaged = git(cwd, ["diff"]).stdout;
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"]).stdout.trim();

  let out = "";
  if (status) {
    out += `# git status --porcelain\n${status}\n\n`;
  }
  if (untracked) {
    out += `# untracked files (contents not shown)\n${untracked}\n\n`;
  }
  if (staged.trim()) {
    out += `# staged diff (git diff --cached)\n${staged}\n`;
  }
  if (unstaged.trim()) {
    out += `# unstaged diff (git diff)\n${unstaged}\n`;
  }
  return clip(out.trim(), maxChars);
}

/**
 * Diff of the current branch against a base ref using three-dot range, which
 * compares HEAD to the merge-base of base and HEAD (i.e. just this branch's work).
 */
export function branchDiff(cwd, base, { maxChars = 120000 } = {}) {
  const range = `${base}...HEAD`;
  const stat = git(cwd, ["diff", "--stat", range]).stdout;
  const diff = git(cwd, ["diff", range]).stdout;

  let out = "";
  if (stat.trim()) {
    out += `# git diff --stat ${range}\n${stat}\n\n`;
  }
  out += `# git diff ${range}\n${diff}\n`;
  return clip(out.trim(), maxChars);
}
