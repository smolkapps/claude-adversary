import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Resolve the workspace root for a given cwd. Prefers the git toplevel so that
 * per-workspace state is shared across subdirectories of the same repo.
 */
export function resolveWorkspaceRoot(cwd = process.cwd()) {
  try {
    const res = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8"
    });
    if (res.status === 0) {
      const root = (res.stdout || "").trim();
      if (root) {
        return root;
      }
    }
  } catch {
    // fall through to cwd
  }
  return path.resolve(cwd);
}
