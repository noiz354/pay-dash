// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Audit finding S-02 — the regression lock.
 *
 * 32 of 65 exported Server Actions had no authorization construct of any kind.
 * Fixing them file by file leaves nothing preventing action 33: a new
 * `"use server"` export is reachable over HTTP the moment it exists, whether or
 * not any component imports it, and nothing in the build or the type system asks
 * what privilege it needs.
 *
 * So this test scans the source instead. Every exported function under
 * `src/server/actions/` must either call an authorization seam, or appear in
 * ALLOWLIST below with a reason that a reviewer can argue with. Adding an ungated
 * action now fails a test rather than shipping.
 */

const ACTIONS_DIR = join(process.cwd(), "src/server/actions");

/**
 * Any awaited `require<Something>(...)` call. Every guard in this codebase
 * follows that shape — the imported seams (`requireStrictOrgContext`,
 * `requireOrgContext`, `requireTransactionOrganizationContext`,
 * `requirePayoutOrganizationContext`) and the file-local wrappers
 * (`requireTeamManage`, `requireSettingsManage`, `requireRiskManage`,
 * `requireInvoiceWrite`, `requireLinkWrite`, `requireBlocklistManage`,
 * `requireKycRemove`, `requireWebhookSimulation`, `requireRuntimePermission`).
 */
const AUTH_CALL = /await\s+require[A-Z]\w*\s*\(/;

/**
 * Exported actions that legitimately perform no authorization, each with the
 * reason. A new entry here should be a deliberate decision, not a convenience —
 * the point of the allowlist is that it is short enough to read.
 */
const ALLOWLIST: Record<string, string> = {
  // `setup.ts` persists the onboarding checklist in the *caller's own* cookie
  // (`kl.setup`) and reads it back from the same jar. There is no shared state
  // and no other principal's data, so there is nothing to authorize: a caller
  // can only falsify their own progress indicator. The real defect the audit
  // recorded here is that onboarding completion lives in a client cookie rather
  // than a `merchant.setup` column — a data-integrity problem, not an
  // authorization one. Gating it would add a failure mode without removing one.
  "setup.ts:getCompletedSteps": "reads only the caller's own cookie",
  "setup.ts:toggleSetupStepAction": "writes only the caller's own cookie",
};

function actionFiles(): string[] {
  return readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
}

/** Split a module into `{ name, body }` for each exported function. */
function exportedFunctions(source: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /^export (?:async )?function (\w+)/gm;
  const marks: Array<{ name: string; at: number }> = [];
  for (const m of source.matchAll(re)) marks.push({ name: m[1], at: m.index! });
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
    out.push({ name: mark.name, body: source.slice(mark.at, end) });
  });
  return out;
}

describe("S-02 — every exported Server Action authorizes or is explicitly excused", () => {
  const findings: string[] = [];
  const gated: string[] = [];
  const excused: string[] = [];

  for (const file of actionFiles()) {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    for (const fn of exportedFunctions(source)) {
      const key = `${file}:${fn.name}`;
      if (AUTH_CALL.test(fn.body)) gated.push(key);
      else if (key in ALLOWLIST) excused.push(key);
      else findings.push(key);
    }
  }

  it("has no ungated action outside the allowlist", () => {
    // The assertion message lists every offender so a new one is diagnosed from
    // the test output alone, without re-running the scan by hand.
    expect(
      findings,
      `These exported Server Actions perform no authorization. Gate them behind a
permission via requireStrictOrgContext (or a file-local wrapper around it), or
add them to ALLOWLIST in this file with a reason a reviewer can argue with:
  ${findings.join("\n  ")}`,
    ).toEqual([]);
  });

  it("still excuses only the two self-scoped cookie actions", () => {
    // If this list grows, the allowlist is being used to defer work rather than
    // to record a decision.
    expect(excused.sort()).toEqual(["setup.ts:getCompletedSteps", "setup.ts:toggleSetupStepAction"]);
  });

  it("covers the actions the audit counted", () => {
    // 65 exported actions in total per the audit; the scan must be seeing the
    // same population, or the lock above is narrower than it looks.
    expect(gated.length + excused.length + findings.length).toBeGreaterThanOrEqual(60);
    expect(gated.length).toBeGreaterThanOrEqual(50);
  });

  it("gates the specific actions the audit named", () => {
    // Named individually so that re-introducing one of these particular holes
    // fails with its own name rather than as one entry in a list.
    const required = [
      "team.ts:inviteMemberAction",
      "team.ts:changeRoleAction",
      "team.ts:deactivateAction",
      "settings.ts:createApiKeyAction",
      "settings.ts:rollApiKeyAction",
      "settings.ts:revokeApiKeyAction",
      "settings.ts:addIpAllowAction",
      "risk.ts:setVolumeEnabledAction",
      "risk.ts:deployRiskAction",
      "invoices.ts:payInvoiceAction",
      "invoices.ts:payInvoicesAction",
      "links.ts:expirePaymentLinkAction",
      "blocklist.ts:removeBlocklistAction",
      "kyc.ts:removeKycDocumentAction",
      "webhooks.ts:replayWebhookAction",
      "runtime.ts:rotateMcpTokenAction",
    ];
    for (const key of required) expect(gated, key).toContain(key);
  });
});
