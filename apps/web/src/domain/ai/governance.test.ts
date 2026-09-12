import { describe, expect, it } from "vitest";

import {
  TOOL_POLICIES,
  classifyTool,
  governToolCall,
  runEval,
  type EvalCase,
  type ToolCallRequest,
} from "./governance";

function req(over: Partial<ToolCallRequest> & { tool: string }): ToolCallRequest {
  return {
    args: {},
    argsHash: "hash-a",
    requestedBy: "agent-1",
    organizationId: "org-1",
    approval: null,
    ...over,
  };
}

describe("tool classification", () => {
  it("classifies reads as autonomous", () => {
    const c = classifyTool("get_balance");
    expect(c.tier).toBe("READ_ONLY");
    expect(c.autonomousAllowed).toBe(true);
  });

  it("classifies money movers as never autonomous", () => {
    for (const tool of ["release_payout", "execute_refund", "retry_operation", "update_payout_account"]) {
      const c = classifyTool(tool);
      expect(c.tier).toBe("WRITE_MONEY");
      expect(c.autonomousAllowed).toBe(false);
    }
  });

  describe("fail-closed", () => {
    it("treats an UNKNOWN tool as money-moving and blocks it", () => {
      const c = classifyTool("definitely_not_a_real_tool");
      expect(c.known).toBe(false);
      expect(c.tier).toBe("WRITE_MONEY");
      expect(c.autonomousAllowed).toBe(false);
      expect(c.reason).toContain("fail-closed");
    });

    it("is not fooled by a read-sounding unknown name", () => {
      // The dangerous case: a name that *looks* harmless.
      expect(classifyTool("get_everything_and_wire_it_out").autonomousAllowed).toBe(false);
      expect(classifyTool("list_refunds").autonomousAllowed).toBe(false);
    });

    it("has no duplicate policy entries", () => {
      const names = TOOL_POLICIES.map((p) => p.tool);
      expect(new Set(names).size).toBe(names.length);
    });

    it("gives every policy a rationale a reviewer can check", () => {
      for (const p of TOOL_POLICIES) expect(p.rationale.length).toBeGreaterThan(10);
    });
  });
});

describe("the human approval boundary", () => {
  it("allows a read without approval", () => {
    const d = governToolCall(req({ tool: "get_balance" }));
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("ALLOWED_READ");
  });

  it("allows a reversible write without approval", () => {
    const d = governToolCall(req({ tool: "journal_append" }));
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("ALLOWED_REVERSIBLE");
  });

  it("BLOCKS a money movement with no approval", () => {
    const d = governToolCall(req({ tool: "release_payout" }));
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("DENIED_NO_APPROVAL");
  });

  it("BLOCKS an unknown tool outright", () => {
    const d = governToolCall(req({ tool: "mystery_tool" }));
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("DENIED_UNKNOWN_TOOL");
  });

  it("BLOCKS self-approval — the agent cannot approve its own payout", () => {
    const d = governToolCall(
      req({
        tool: "release_payout",
        requestedBy: "alice",
        approval: { approverId: "alice", at: "2026-09-12T00:00:00.000Z", approvedArgsHash: "hash-a" },
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("DENIED_SELF_APPROVAL");
  });

  it("BLOCKS a call whose arguments changed after approval", () => {
    const d = governToolCall(
      req({
        tool: "execute_refund",
        argsHash: "hash-CHANGED",
        requestedBy: "agent-1",
        approval: { approverId: "bob", at: "2026-09-12T00:00:00.000Z", approvedArgsHash: "hash-a" },
      }),
    );
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("DENIED_ARGS_CHANGED");
    expect(d.message).toContain("approved a different call");
  });

  it("ALLOWS a money movement with a valid third-party approval of the exact args", () => {
    const d = governToolCall(
      req({
        tool: "release_payout",
        argsHash: "hash-a",
        requestedBy: "agent-1",
        approval: { approverId: "bob", at: "2026-09-12T00:00:00.000Z", approvedArgsHash: "hash-a" },
      }),
    );
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("ALLOWED_WITH_APPROVAL");
    expect(d.requiresApproval).toBe(true);
  });

  it("an approval for one tool does not authorise another", () => {
    // Same approval object, different tool: the args hash binds to the call.
    const approval = { approverId: "bob", at: "2026-09-12T00:00:00.000Z", approvedArgsHash: "hash-refund" };
    const d = governToolCall(req({ tool: "release_payout", argsHash: "hash-payout", approval }));
    expect(d.allowed).toBe(false);
  });
});

describe("eval harness", () => {
  const cases: EvalCase[] = [
    { name: "read is allowed", request: req({ tool: "get_balance" }), expect: { allowed: true, code: "ALLOWED_READ" } },
    {
      name: "unapproved payout is blocked",
      request: req({ tool: "release_payout" }),
      expect: { allowed: false, code: "DENIED_NO_APPROVAL" },
    },
    {
      name: "unknown tool is blocked",
      request: req({ tool: "wat" }),
      expect: { allowed: false, code: "DENIED_UNKNOWN_TOOL" },
    },
    {
      name: "self-approval is blocked",
      request: req({
        tool: "execute_refund",
        requestedBy: "alice",
        approval: { approverId: "alice", at: "t", approvedArgsHash: "hash-a" },
      }),
      expect: { allowed: false, code: "DENIED_SELF_APPROVAL" },
    },
    {
      name: "properly approved payout runs",
      request: req({
        tool: "release_payout",
        approval: { approverId: "bob", at: "t", approvedArgsHash: "hash-a" },
      }),
      expect: { allowed: true, code: "ALLOWED_WITH_APPROVAL" },
    },
  ];

  it("scores the committed fixtures at 100% with zero unsafe escapes", () => {
    const r = runEval(cases);
    expect(r.total).toBe(5);
    expect(r.passed).toBe(5);
    expect(r.score).toBe(1);
    expect(r.unsafeEscapes).toBe(0);
    expect(r.failed).toEqual([]);
  });

  it("counts an unsafe escape separately from an ordinary miss", () => {
    // A fixture that expects a block but would be allowed is an escape.
    const bad: EvalCase[] = [
      {
        name: "wrongly expects a block on a read",
        request: req({ tool: "get_balance" }),
        expect: { allowed: false, code: "DENIED_NO_APPROVAL" },
      },
    ];
    const r = runEval(bad);
    expect(r.passed).toBe(0);
    // A read slipping through is a failed expectation but NOT a money escape.
    expect(r.unsafeEscapes).toBe(0);
  });

  it("reports what actually happened for each failure", () => {
    const r = runEval([
      { name: "x", request: req({ tool: "get_balance" }), expect: { allowed: false, code: "DENIED_UNKNOWN_TOOL" } },
    ]);
    expect(r.failed[0]).toMatchObject({ name: "x", expected: "false/DENIED_UNKNOWN_TOOL", actual: "true/ALLOWED_READ" });
  });

  it("an empty suite scores zero rather than a vacuous 100%", () => {
    expect(runEval([]).score).toBe(0);
  });
});
