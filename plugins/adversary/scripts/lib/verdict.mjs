/**
 * Parse the reviewer's verdict. The contract is that the first non-empty line
 * starts with "ALLOW:" or "BLOCK:". We scan a little more leniently than that
 * (first matching line wins) so a stray blank line or token doesn't flip it.
 *
 * Fail-open: empty / malformed output resolves to ALLOW so a broken reviewer
 * can never trap the user in an un-stoppable loop.
 */
export function parseVerdict(output) {
  const text = String(output ?? "").trim();
  if (!text) {
    return { decision: "allow", reason: null, malformed: true };
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("ALLOW:")) {
      return { decision: "allow", reason: line.slice("ALLOW:".length).trim() || null };
    }
    if (line.startsWith("BLOCK:")) {
      return { decision: "block", reason: line.slice("BLOCK:".length).trim() || text };
    }
  }
  return { decision: "allow", reason: null, malformed: true };
}

export function formatBlockReason(fullOutput) {
  const head =
    "A second (adversarial) Claude reviewed your last turn and is NOT satisfied. " +
    "Address the problems below before stopping — or, if a point is wrong, rebut it " +
    "explicitly with evidence rather than silently complying.";
  const body = String(fullOutput ?? "").trim();
  return body ? `${head}\n\n${body}` : head;
}
