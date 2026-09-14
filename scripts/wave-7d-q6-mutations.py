#!/usr/bin/env python3
"""Wave 7D Q6 — mutation harness.

Each mutation is a deliberate reintroduction of the defect the wave closed. The
harness applies it, runs the tests that are supposed to catch it, records whether
they went RED, and restores the file from a backup. A mutation that does NOT
redden a test is a hole in the net and gets reported as such.
"""
import shutil, subprocess, sys, os

WEB = "/home/user/pay-dash/apps/web"
SRC = os.path.join(WEB, "src")
BAK = "/tmp/mutbak"
os.makedirs(BAK, exist_ok=True)

INV = "server/data/invoices.ts"
SUB = "server/data/subscriptions.ts"
ROUTE = "app/api/exports/invoices/route.ts"
MCP = "server/mcp/domain-tools.ts"

MUTATIONS = [
    dict(
        id="M1 predicate removal (subscriptions)",
        files={SUB: [(
            "  const all = readPartition(organizationId).plans;",
            "  const all = Array.from(store().tenants.values()).flatMap((t) => t.plans);",
        )]},
        tests=["src/server/data/subscriptions.tenant-isolation.test.ts"],
    ),
    dict(
        id="M2 global lookup (getInvoice crosses partitions)",
        files={INV: [(
            "  scopeOf(ctx);\n  const all = await buildInvoices(ctx);\n  // A foreign id and a missing id answer identically",
            "  scopeOf(ctx);\n  const all = [...(await buildInvoices(ctx)), ...(await buildInvoices(parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG })))];\n  // A foreign id and a missing id answer identically",
        )]},
        tests=["src/server/data/invoices.tenant-isolation.test.ts"],
    ),
    dict(
        id="M3 hardcoded export org (route ignores the guard)",
        files={ROUTE: [
            (
                'import { parseOrganizationContext } from "@/domain/tenancy/organization-context";',
                'import { parseOrganizationContext } from "@/domain/tenancy/organization-context";\nimport { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";',
            ),
            (
                "  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });",
                "  const ctx = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });",
            ),
        ]},
        tests=["src/app/api/exports/invoices/route.tenant.test.ts"],
    ),
    dict(
        id="M4 MCP bypass (demo fallback instead of refusal)",
        files={MCP: [
            (
                'import { TenantIsolationError } from "@/domain/security/tenant";',
                'import { TenantIsolationError } from "@/domain/security/tenant";\nimport { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";',
            ),
            (
                '    async ({ page, pageSize, status, ...input }) => {\n      if (!scoped) return textResult(NO_TENANT);\n      return sourceAware(input, () => listInvoices(scoped,',
                '    async ({ page, pageSize, status, ...input }) => {\n      const eff = scoped ?? parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });\n      return sourceAware(input, () => listInvoices(eff,',
            ),
        ]},
        tests=["src/server/mcp/billing-tools.tenant.test.ts"],
    ),
    dict(
        id="M5 quarantine import back in a prod path",
        files={INV: [
            (
                'import { countLedgerTenants, listTransactions, soleLedgerOrganizationId, type Transaction } from "./transactions";',
                'import { countLedgerTenants, listTransactions, soleLedgerOrganizationId, type Transaction } from "./transactions";\nimport { legacyListTransactions } from "./transactions-unscoped";',
            ),
            (
                "  const rows: Transaction[] = [];\n  let page = 1;",
                "  const quarantined = await legacyListTransactions(\"invoices\" as never, { page: 1, pageSize: 100 });\n  if (quarantined.rows.length) return quarantined.rows as Transaction[];\n  const rows: Transaction[] = [];\n  let page = 1;",
            ),
        ]},
        tests=["src/server/data/transactions-structural.test.ts"],
    ),
    dict(
        id="M6 tenant column leaks into the exported CSV",
        files={INV: [
            ('    "paid_at",\n  ];', '    "paid_at",\n    "organization_id",\n  ];'),
            ("      i.paidAt,\n    ]", "      i.paidAt,\n      i.organizationId,\n    ]"),
        ]},
        tests=["src/app/api/exports/invoices/route.tenant.test.ts"],
    ),
    dict(
        id="M7 payment overlay is process-wide, not per org",
        files={INV: [(
            "  const payment = readPayments(organizationId)[invoice.id];",
            "  const payment = Object.assign({}, ...Array.from(store().tenants.values()).map((t) => t.payments))[invoice.id];",
        )]},
        tests=["src/server/data/invoices.tenant-isolation.test.ts"],
    ),
    dict(
        id="M8 pay writes before the tenant check",
        files={INV: [(
            "  const { organizationId } = scopeOf(ctx);\n  const invoice = await getInvoice(ctx, id);\n  if (!invoice) {\n    const foreignOwner",
            "  const { organizationId } = scopeOf(ctx);\n  writePartition(organizationId).payments[id] = { paidAt: new Date().toISOString(), method, reference: \"PAY-MUTATION\" };\n  const invoice = await getInvoice(ctx, id);\n  if (!invoice) {\n    const foreignOwner",
        )]},
        tests=["src/server/data/invoices.tenant-isolation.test.ts"],
    ),
]


def run(tests):
    p = subprocess.run(
        ["npx", "vitest", "run", *tests],
        cwd=WEB, capture_output=True, text=True, timeout=600,
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
            if line.strip().startswith("×"):
                first_fail = line.strip()[:110]
                break
        results.append((m["id"], "RED" if red else "*** SURVIVED ***", first_fail))
    finally:
        for rel in touched:
            shutil.copy2(os.path.join(BAK, rel.replace("/", "__")), os.path.join(SRC, rel))

print("\n=== Q6 MUTATION RESULTS ===")
for mid, verdict, fail in results:
    print(f"{verdict:18} {mid}")
    if fail:
        print(f"{'':18} caught by: {fail}")
survivors = [r for r in results if r[1] != "RED"]
print(f"\n{len(results) - len(survivors)}/{len(results)} mutations reddened; survivors: {len(survivors)}")
sys.exit(1 if survivors else 0)
