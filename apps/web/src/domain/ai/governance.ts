/**
 * Wave 6 — AI agent governance and the human-approval boundary (priority 9).
 *
 * The repository exposes AI/MCP tools that can read financial data and, in
 * principle, be extended to act on it. The governing question is not "is the
 * model good?" — it is "what can the model do without a human, and what
 * happens when the classifier itself is wrong?"
 *
 * The design is **fail-closed**. An unknown tool is not "probably a read";
 * it is treated as the most dangerous thing it could be and blocked. This is
 * the opposite of the usual allow-by-default plumbing, and it is the only
 * defensible default when the downside is moving money.
 *
 * Three tiers:
 *   READ_ONLY      — autonomous. Cannot change state.
 *   WRITE_REVERSIBLE — autonomous with audit. A human can undo it.
 *   WRITE_MONEY    — NEVER autonomous. Requires explicit human approval,
 *                    from a human who is not the requester.
 */

export type ToolTier = "READ_ONLY" | "WRITE_REVERSIBLE" | "WRITE_MONEY";

export type ToolPolicy = {
  readonly tool: string;
  readonly tier: ToolTier;
  readonly rationale: string;
};

/**
 * The explicit allow-list. Anything absent is denied — see `classifyTool`.
 * Money-moving verbs are listed even though they are not yet AI-invocable, so
 * that the day someone wires them up, the policy already says no.
 */
export const TOOL_POLICIES: readonly ToolPolicy[] = [
  { tool: "list_transactions", tier: "READ_ONLY", rationale: "Read of already-visible data." },
  { tool: "get_balance", tier: "READ_ONLY", rationale: "Read of already-visible data." },
  { tool: "search_customers", tier: "READ_ONLY", rationale: "Read scoped to the caller's tenant." },
  { tool: "get_payout_batch", tier: "READ_ONLY", rationale: "Read of already-visible data." },
  { tool: "list_webhook_deliveries", tier: "READ_ONLY", rationale: "Operational read." },
  { tool: "journal_append", tier: "WRITE_REVERSIBLE", rationale: "Adds a note; no financial effect; deletable." },
  { tool: "tag_transaction", tier: "WRITE_REVERSIBLE", rationale: "Metadata only; reversible." },
  { tool: "create_case", tier: "WRITE_REVERSIBLE", rationale: "Opens an exception case; no money moves." },
  { tool: "release_payout", tier: "WRITE_MONEY", rationale: "Moves funds out of the account." },
  { tool: "execute_refund", tier: "WRITE_MONEY", rationale: "Returns funds to a customer." },
  { tool: "retry_operation", tier: "WRITE_MONEY", rationale: "May re-submit a provider write; can double-pay." },
  { tool: "update_payout_account", tier: "WRITE_MONEY", rationale: "Changes the destination of future money." },
];

const POLICY_BY_TOOL = new Map(TOOL_POLICIES.map((p) => [p.tool, p]));

export type Classification = {
  readonly tool: string;
  readonly tier: ToolTier;
  readonly known: boolean;
  readonly autonomousAllowed: boolean;
  readonly reason: string;
};

/**
 * Classify a tool call.
 *
 * An unknown tool returns `WRITE_MONEY` + `autonomousAllowed: false`. That is
 * not paranoia: the failure mode of guessing "read" for an unrecognised name
 * is an autonomous money movement, while the failure mode of guessing "money"
 * is a human being asked an unnecessary question.
 */
export function classifyTool(tool: string): Classification {
  const policy = POLICY_BY_TOOL.get(tool);
  if (!policy) {
    return {
      tool,
      tier: "WRITE_MONEY",
      known: false,
      autonomousAllowed: false,
      reason: `Unknown tool "${tool}" — fail-closed. Add an explicit policy entry before this can be called.`,
    };
  }
  return {
    tool,
    tier: policy.tier,
    known: true,
    autonomousAllowed: policy.tier !== "WRITE_MONEY",
    reason: policy.rationale,
  };
}

export type Approval = {
  readonly approverId: string;
  readonly at: string;
  /** The exact arguments the human saw. Approving a summary is not approving a call. */
  readonly approvedArgsHash: string;
};

export type ToolCallRequest = {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly argsHash: string;
  readonly requestedBy: string;
  readonly organizationId: string;
  readonly approval?: Approval | null;
};

export type GovernanceDecision = {
  readonly allowed: boolean;
  readonly tier: ToolTier;
  readonly requiresApproval: boolean;
  readonly code:
    | "ALLOWED_READ"
    | "ALLOWED_REVERSIBLE"
    | "ALLOWED_WITH_APPROVAL"
    | "DENIED_UNKNOWN_TOOL"
    | "DENIED_NO_APPROVAL"
    | "DENIED_SELF_APPROVAL"
    | "DENIED_ARGS_CHANGED";
  readonly message: string;
};

/**
 * The gate every AI-initiated tool call must pass.
 *
 * The `argsHash` check is the subtle one: a human approving "refund 50,000 IDR
 * to customer X" must not have their approval reused for a different amount.
 * Binding the approval to a hash of the exact arguments makes approval
 * non-transferable between calls.
 */
export function governToolCall(req: ToolCallRequest): GovernanceDecision {
  const c = classifyTool(req.tool);

  if (!c.known) {
    return {
      allowed: false,
      tier: c.tier,
      requiresApproval: true,
      code: "DENIED_UNKNOWN_TOOL",
      message: c.reason,
    };
  }
  if (c.tier === "READ_ONLY") {
    return { allowed: true, tier: c.tier, requiresApproval: false, code: "ALLOWED_READ", message: c.reason };
  }
  if (c.tier === "WRITE_REVERSIBLE") {
    return {
      allowed: true,
      tier: c.tier,
      requiresApproval: false,
      code: "ALLOWED_REVERSIBLE",
      message: `${c.reason} Audited, and reversible by a human.`,
    };
  }

  // WRITE_MONEY from here down.
  if (!req.approval) {
    return {
      allowed: false,
      tier: c.tier,
      requiresApproval: true,
      code: "DENIED_NO_APPROVAL",
      message: `"${req.tool}" moves money and requires explicit human approval before execution.`,
    };
  }
  if (req.approval.approverId === req.requestedBy) {
    return {
      allowed: false,
      tier: c.tier,
      requiresApproval: true,
      code: "DENIED_SELF_APPROVAL",
      message: `The approver of "${req.tool}" must be a different human from the requester (ADR-0035 dual control).`,
    };
  }
  if (req.approval.approvedArgsHash !== req.argsHash) {
    return {
      allowed: false,
      tier: c.tier,
      requiresApproval: true,
      code: "DENIED_ARGS_CHANGED",
      message: `The arguments changed after approval — the human approved a different call. Re-approve the exact request.`,
    };
  }
  return {
    allowed: true,
    tier: c.tier,
    requiresApproval: true,
    code: "ALLOWED_WITH_APPROVAL",
    message: `Approved by ${req.approval.approverId} for these exact arguments.`,
  };
}

/* --------------------------------------------------------------------- */
/* Eval harness                                                          */
/* --------------------------------------------------------------------- */

export type EvalCase = {
  readonly name: string;
  readonly request: ToolCallRequest;
  readonly expect: { allowed: boolean; code: GovernanceDecision["code"] };
};

export type EvalResult = {
  readonly total: number;
  readonly passed: number;
  readonly failed: readonly { name: string; expected: string; actual: string }[];
  readonly score: number;
  /** The one number that matters: did anything money-moving slip through? */
  readonly unsafeEscapes: number;
};

/**
 * Score the governance layer against fixtures.
 *
 * `unsafeEscapes` is tracked separately from the pass rate because the two
 * failures are not equally bad. Blocking something we should have allowed is
 * an annoyance; allowing an unapproved money movement is an incident. A 95%
 * score with one unsafe escape is a FAIL.
 */
export function runEval(cases: readonly EvalCase[]): EvalResult {
  const failed: { name: string; expected: string; actual: string }[] = [];
  let unsafeEscapes = 0;

  for (const c of cases) {
    const d = governToolCall(c.request);
    const ok = d.allowed === c.expect.allowed && d.code === c.expect.code;
    if (!ok) {
      failed.push({
        name: c.name,
        expected: `${c.expect.allowed}/${c.expect.code}`,
        actual: `${d.allowed}/${d.code}`,
      });
    }
    if (!c.expect.allowed && d.allowed && d.tier === "WRITE_MONEY") unsafeEscapes += 1;
  }

  return {
    total: cases.length,
    passed: cases.length - failed.length,
    failed,
    score: cases.length === 0 ? 0 : (cases.length - failed.length) / cases.length,
    unsafeEscapes,
  };
}
