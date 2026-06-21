import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 1;
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";
const FALLBACK_STATE_ROOT_DIR = path.join(os.tmpdir(), "claude-adversary");
const STATE_FILE_NAME = "state.json";

export const DEFAULT_CONFIG = {
  // Off by default: the gate spawns a real Claude on every code-changing Stop.
  stopReviewGate: false,
  // Reviewer model alias passed to `claude --model`.
  reviewerModel: "opus",
  // Safety cap on consecutive BLOCKs per session (0 = unlimited). Prevents an
  // endless Claude-blocks-Claude loop that would drain usage.
  maxRounds: 3,
  // "edits" = only review turns that changed the working tree (cheap default).
  // "all"   = review every turn, even pure-prose answers.
  gateScope: "edits"
};

function defaultState() {
  return {
    version: STATE_VERSION,
    config: { ...DEFAULT_CONFIG },
    rounds: {}
  };
}

export function resolveStateDir(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonical = workspaceRoot;
  try {
    canonical = fs.realpathSync.native(workspaceRoot);
  } catch {
    canonical = workspaceRoot;
  }

  const slugSource = path.basename(workspaceRoot) || "workspace";
  const slug =
    slugSource.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  const dataDir = process.env[PLUGIN_DATA_ENV];
  const stateRoot = dataDir ? path.join(dataDir, "state") : FALLBACK_STATE_ROOT_DIR;
  return path.join(stateRoot, `${slug}-${hash}`);
}

export function resolveStateFile(cwd) {
  return path.join(resolveStateDir(cwd), STATE_FILE_NAME);
}

export function loadState(cwd) {
  const stateFile = resolveStateFile(cwd);
  if (!fs.existsSync(stateFile)) {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return {
      ...defaultState(),
      ...parsed,
      config: { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) },
      rounds: parsed.rounds && typeof parsed.rounds === "object" ? parsed.rounds : {}
    };
  } catch {
    return defaultState();
  }
}

export function saveState(cwd, state) {
  fs.mkdirSync(resolveStateDir(cwd), { recursive: true });
  const next = {
    version: STATE_VERSION,
    config: { ...DEFAULT_CONFIG, ...(state.config ?? {}) },
    rounds: state.rounds ?? {}
  };
  fs.writeFileSync(resolveStateFile(cwd), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function updateState(cwd, mutate) {
  const state = loadState(cwd);
  mutate(state);
  return saveState(cwd, state);
}

export function getConfig(cwd) {
  return loadState(cwd).config;
}

export function setConfig(cwd, key, value) {
  return updateState(cwd, (state) => {
    state.config = { ...state.config, [key]: value };
  });
}

export function getRounds(cwd, sessionId) {
  if (!sessionId) {
    return 0;
  }
  return Number(loadState(cwd).rounds?.[sessionId] ?? 0);
}

export function bumpRounds(cwd, sessionId) {
  if (!sessionId) {
    return 0;
  }
  let next = 0;
  updateState(cwd, (state) => {
    next = Number(state.rounds?.[sessionId] ?? 0) + 1;
    state.rounds = { ...state.rounds, [sessionId]: next };
  });
  return next;
}

export function resetRounds(cwd, sessionId) {
  if (!sessionId) {
    return;
  }
  updateState(cwd, (state) => {
    if (state.rounds && sessionId in state.rounds) {
      const rounds = { ...state.rounds };
      delete rounds[sessionId];
      state.rounds = rounds;
    }
  });
}
