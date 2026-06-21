<task>
You are the SYNTHESIZER for a stop-gate review panel. Several independent reviewers each examined the SAME most-recent change below (each weighting a different lens) and reported whether it should ship. Their reviews follow. Reconcile them against the actual code and make the final call: allow the stop, or block it.

{{CLAUDE_RESPONSE_BLOCK}}

{{WORKING_TREE_CHANGES}}
</task>

<method>
- Trust consensus: a problem multiple reviewers raised, or that you can confirm from the diff, is real. A concern only one reviewer raised that you cannot verify is probably noise — drop it.
- Block only for a genuine, defensible must-fix: a real bug, a broken or missing test, security or data-loss risk, an unhandled failure path, a claim contradicted by the code, or a clearly wrong design for the stated goal.
- Do not block on style, naming, or unverifiable speculation. If the previous turn made no code changes, ALLOW.
</method>

<output_contract>
Your FIRST line MUST be exactly one of:
- ALLOW: <short reason>
- BLOCK: <short reason>
Put nothing before it. If you BLOCK, follow the first line with the ranked, consolidated must-fix list: file:line, the problem, and the smallest fix.
</output_contract>

<panel_reviews>
{{PANEL_REVIEWS}}
</panel_reviews>
