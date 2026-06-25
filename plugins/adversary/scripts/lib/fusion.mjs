import { runClaudeReviewAsync } from "./claude.mjs";
import { loadPromptTemplate, interpolateTemplate } from "./prompts.mjs";

// Same-model diversity comes from distinct LENSES (we only have Claude, not a
// multi-vendor panel). Each panel member weights one lens but still reports
// anything material, so coverage widens without N identical reviews.
export const REVIEW_LENSES = [
  "correctness, logic errors, off-by-ones, and broken or missing tests",
  "security, authn/authz, secrets handling, data loss, and irreversible state changes",
  "concurrency and ordering, edge cases (empty/null/timeout/large input), and failure, retry, and rollback paths",
  "design and simplicity — whether this is even the right approach, plus hidden coupling and assumptions",
  "performance, resource use, allocations, and behavior under load"
];

export function lensFor(index) {
  return REVIEW_LENSES[index % REVIEW_LENSES.length];
}

export function clampPanel(panel, fallback = 3) {
  const n = Number(panel);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(Math.trunc(n), REVIEW_LENSES.length));
}

function withLens(basePrompt, index, total) {
  return [
    basePrompt,
    "",
    "<panel_assignment>",
    `You are reviewer ${index + 1} of ${total} on an independent panel. Other reviewers cover other angles, so you do not have to. Weight this lens most heavily, but still report any material issue you find: ${lensFor(index)}.`,
    "</panel_assignment>"
  ].join("\n");
}

export function formatPanel(panelOutputs) {
  return panelOutputs
    .map((p) => `### Reviewer ${p.reviewer} — lens: ${p.lens}\n${p.output}`)
    .join("\n\n");
}

/**
 * Run an N-member review panel in parallel, then synthesize a single review.
 *
 * @param buildSynthesisPrompt (panelOutputs) => string  caller builds the
 *        synthesizer prompt (it knows whether this is a gate or on-demand run).
 * @returns { ok, output, error, panel } where panel is the per-reviewer outputs.
 */
export async function fuse({
  cwd,
  model,
  basePrompt,
  systemPrompt,
  synthSystemPrompt,
  panel,
  buildSynthesisPrompt
}) {
  const total = clampPanel(panel);
  const reviewers = [];
  for (let i = 0; i < total; i += 1) {
    reviewers.push(
      runClaudeReviewAsync({ cwd, model, prompt: withLens(basePrompt, i, total), systemPrompt })
    );
  }
  const results = await Promise.all(reviewers);
  const panelOutputs = results.map((r, i) => ({
    reviewer: i + 1,
    lens: lensFor(i),
    ok: r.ok,
    output: r.ok ? r.output : `(reviewer ${i + 1} did not complete: ${r.error || "unknown error"})`
  }));

  if (!panelOutputs.some((p) => p.ok)) {
    return { ok: false, output: "", error: "all panel reviewers failed", panel: panelOutputs };
  }

  const synth = await runClaudeReviewAsync({
    cwd,
    model,
    prompt: buildSynthesisPrompt(panelOutputs),
    systemPrompt: synthSystemPrompt ?? systemPrompt
  });

  return { ok: synth.ok, output: synth.output, error: synth.error, panel: panelOutputs };
}

// ---------------------------------------------------------------------------
// Task fusion (OpenRouter-Fusion style): N Claudes draft the SAME task in
// parallel from different angles, then a synthesizer merges them into one
// better solution. Unlike the review fuse() above, the *output is the answer*,
// not a critique. This is the "two Claudes working together to get it done"
// mode.
// ---------------------------------------------------------------------------

const FUSE_PERSONA =
  "You are a strong, careful engineer producing the best possible solution to a task — correct, complete, and grounded in the actual code. You may read the repository with your tools, but do not edit files; deliver your solution as text.";

const DRAFT_APPROACHES = [
  "the simplest thing that fully works",
  "maximum robustness — handle the edge cases, failure modes, and inputs others will overlook",
  "a genuinely different approach (different algorithm, data structure, or framing) than the obvious one",
  "performance and efficiency",
  "clarity and long-term maintainability"
];

export function approachFor(index) {
  return DRAFT_APPROACHES[index % DRAFT_APPROACHES.length];
}

export async function fuseTask({ rootDir, cwd, model, task, panel }) {
  const total = clampPanel(panel);
  const tmpl = (name, vars) => interpolateTemplate(loadPromptTemplate(rootDir, name), vars);

  const drafts = await Promise.all(
    Array.from({ length: total }, (_, i) =>
      runClaudeReviewAsync({
        cwd,
        model,
        systemPrompt: FUSE_PERSONA,
        prompt: tmpl("fuse-draft", {
          N: String(i + 1),
          TOTAL: String(total),
          APPROACH: approachFor(i),
          TASK: task
        })
      }).then((r) => ({
        draft: i + 1,
        approach: approachFor(i),
        ok: r.ok,
        output: r.ok ? r.output : `(draft ${i + 1} did not complete: ${r.error || "unknown error"})`
      }))
    )
  );

  if (!drafts.some((d) => d.ok)) {
    return { ok: false, output: "", error: "all drafts failed", drafts };
  }

  const draftsBlock = drafts
    .map((d) => `### Draft ${d.draft} — approach: ${d.approach}\n${d.output}`)
    .join("\n\n");

  const synth = await runClaudeReviewAsync({
    cwd,
    model,
    systemPrompt: FUSE_PERSONA,
    prompt: tmpl("fuse-final", { TASK: task, DRAFTS: draftsBlock })
  });

  return { ok: synth.ok, output: synth.output, error: synth.error, drafts };
}
