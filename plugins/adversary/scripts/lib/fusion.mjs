import { runClaudeReviewAsync } from "./claude.mjs";

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
