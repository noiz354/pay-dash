#!/usr/bin/env python3
"""Wave 7F Q6 — mutation harness for the identity & access slice.

Each mutation is a deliberate reintroduction of the defect the wave closed. The
harness applies it, runs the tests that are supposed to catch it, records whether
they went RED, and restores the file from a backup. A mutation that does NOT
redden a test is a hole in the net and gets reported as such.

The eight mutations are the ones WAVE_7F_IDENTITY_SPEC.md §6 Q6 pins:

  M1 member predicate removal      — the roster listing widens past the partition
  M2 global getMember              — the detail read crosses partitions
  M3 hardcoded export org          — the CSV route ignores the guard's tenant
  M4 MCP bypass                    — an unbound tool falls back to the demo tenant
  M5 quarantine import in prod     — a wired path reaches for an unscoped reader
  M6 API key metadata leak         — the secret surface lists every tenant's keys
  M7 role-before-tenant-check      — the escalation edge writes before it scopes
  M8 KYC document cross-tenant read— the PII slot falls back to any tenant's doc

Two Wave 7D lessons are baked into the assertions these mutations are measured
against: refusals are pinned to an exact phrase with zero payload (M4), and
collision/partition state is asserted on the raw store, not only on the victim's
view (M2, M7).
"""
import shutil, subprocess, sys, os

WEB = "/home/user/pay-dash/apps/web"
SRC = os.path.join(WEB, "src")
BAK = "/tmp/mutbak7f"
os.makedirs(BAK, exist_ok=True)

TEAM = "server/data/team.ts"
SETTINGS = "server/data/settings.ts"
KYC = "server/data/kyc.ts"
ROUTE = "app/api/exports/team/route.ts"
MCP = "server/mcp/domain-tools.ts"
PAGE = "app/[locale]/team/page.tsx"

TEAM_TESTS = ["src/server/data/team.tenant-isolation.test.ts"]
SETTINGS_TESTS = ["src/server/data/settings.tenant-isolation.test.ts"]
KYC_TESTS = ["src/server/data/kyc.tenant-isolation.test.ts"]
STRUCT_TESTS = ["src/server/data/identity-structural.test.ts"]
ROUTE_TESTS = ["src/app/api/exports/team/route.tenant.test.ts"]
MCP_TESTS = ["src/server/mcp/identity-tools.tenant.test.ts"]
ACTION_TESTS = ["src/server/actions/identity.tenant.test.ts"]

MUTATIONS = [
    dict(
        id="M1 member predicate removal (listMembers reads every partition)",
        files={TEAM: [(
            "  const filtered = readPartition(organizationId).members.filter((m) => {",
            "  const filtered = Array.from(store().tenants.values()).flatMap((t) => t.members).filter((m) => {",
        )]},
        tests=TEAM_TESTS + ACTION_TESTS,
    ),
    dict(
        id="M2 global getMember (detail read crosses partitions)",
        files={TEAM: [(
            "  return readPartition(organizationId).members.find((m) => m.id === id) ?? null;",
            "  return Array.from(store().tenants.values()).flatMap((t) => t.members).find((m) => m.id === id) ?? null;",
        )]},
        tests=TEAM_TESTS + STRUCT_TESTS,
    ),
    dict(
        id="M3 hardcoded export org (CSV route ignores the guard's tenant)",
        files={ROUTE: [
            (
                'import { parseOrganizationContext } from "@/domain/tenancy/organization-context";',
                'import { parseOrganizationContext } from "@/domain/tenancy/organization-context";\n'
                'import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";',
            ),
            (
                "  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });",
                "  const ctx = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });",
            ),
        ]},
        tests=ROUTE_TESTS,
    ),
    dict(
        id="M4 MCP bypass (demo fallback instead of refusal)",
        files={MCP: [
            (
                'import { TenantIsolationError } from "@/domain/security/tenant";',
                'import { TenantIsolationError } from "@/domain/security/tenant";\n'
                'import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";',
            ),
            (
                "    async ({ page, pageSize, ...input }) => {\n"
                "      if (!scoped) return textResult(NO_TENANT);\n"
                "      return sourceAware(\n"
                "        input,\n"
                "        () => listMembers(scoped,",
                "    async ({ page, pageSize, ...input }) => {\n"
                "      const eff = scoped ?? parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });\n"
                "      return sourceAware(\n"
                "        input,\n"
                "        () => listMembers(eff,",
            ),
        ]},
        tests=MCP_TESTS,
    ),
    dict(
        id="M5 quarantine import back in a wired production path",
        files={PAGE: [
            (
                'import { resolveIdentityOrganizationContext } from "@/server/services/identity-organization-context";',
                'import { resolveIdentityOrganizationContext } from "@/server/services/identity-organization-context";\n'
                'import { legacyListMembers } from "@/server/data/team-unscoped";',
            ),
            (
                "  const result = await listMembers(context, { statuses: [\"INVITED\"], pageSize: 100 });",
                "  const quarantined = await legacyListMembers(\"audit\", { statuses: [\"INVITED\"], pageSize: 100 });\n"
                "  if (quarantined.rows.length) return <PendingInvites invites={quarantined.rows} />;\n"
                "  const result = await listMembers(context, { statuses: [\"INVITED\"], pageSize: 100 });",
            ),
        ]},
        tests=STRUCT_TESTS,
    ),
    dict(
        id="M6 API key metadata leak (listApiKeys spans every tenant)",
        files={SETTINGS: [(
            "  const keys = readState(organizationId).keys.map((k) => ({ ...k }));",
            "  const keys = Array.from(store().tenants.values()).flatMap((t) => t.keys).map((k) => ({ ...k }));",
        )]},
        tests=SETTINGS_TESTS + MCP_TESTS,
    ),
    dict(
        id="M7 role-before-tenant-check (escalation writes before it scopes)",
        files={TEAM: [(
            "  const { organizationId } = scopeOf(ctx);\n"
            "  const member = readPartition(organizationId).members.find((m) => m.id === id);",
            "  const anywhere = Array.from(store().tenants.values()).flatMap((t) => t.members).find((m) => m.id === id);\n"
            "  if (anywhere) anywhere.role = role;\n"
            "  const { organizationId } = scopeOf(ctx);\n"
            "  const member = readPartition(organizationId).members.find((m) => m.id === id);",
        )]},
        tests=TEAM_TESTS + STRUCT_TESTS + ACTION_TESTS,
    ),
    dict(
        id="M8 KYC document cross-tenant read (the PII slot falls back)",
        files={KYC: [(
            "  const s = store().tenants.get(organizationId);\n"
            "  return s ? { ...s } : null;",
            "  const s = store().tenants.get(organizationId) ?? store().tenants.values().next().value;\n"
            "  return s ? { ...s } : null;",
        )]},
        tests=KYC_TESTS,
    ),
]


def run(tests):
    p = subprocess.run(
        ["npx", "vitest", "run", *tests],
        cwd=WEB, capture_output=True, text=True, timeout=900,
    )
    out = p.stdout + p.stderr
    return p.returncode, out


results = []
for m in MUTATIONS:
    touched = []
    try:
        for rel, pairs in m["files"].items():
            path = os.path.join(SRC, rel)
            shutil.copy2(path, os.path.join(BAK, rel.replace("/", "__")))
            touched.append(rel)
            s = open(path).read()
            for old, new in pairs:
                if old not in s:
                    raise SystemExit(f"[{m['id']}] ANCHOR MISSING: {old[:70]!r}")
                s = s.replace(old, new, 1)
            open(path, "w").write(s)

        code, out = run(m["tests"])
        red = code != 0
        first_fail = ""
        for line in out.splitlines():
            stripped = line.strip()
            if stripped.startswith("FAIL") or stripped.startswith("×"):
                first_fail = stripped[:120]
                break
        summary = ""
        for line in out.splitlines():
            if "Tests " in line and "failed" in line:
                summary = line.strip()[:80]
        results.append((m["id"], "RED" if red else "*** SURVIVED ***", first_fail or summary))
    finally:
        for rel in touched:
            shutil.copy2(os.path.join(BAK, rel.replace("/", "__")), os.path.join(SRC, rel))

print("\n=== WAVE 7F Q6 MUTATION RESULTS ===")
for mid, verdict, fail in results:
    print(f"{verdict:18} {mid}")
    if fail:
        print(f"{'':18} caught by: {fail}")
survivors = [r for r in results if r[1] != "RED"]
print(f"\n{len(results) - len(survivors)}/{len(results)} mutations reddened; survivors: {len(survivors)}")
sys.exit(1 if survivors else 0)
