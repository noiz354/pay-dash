import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";

/**
 * Test fixture: the tenant the in-memory dev/demo store bootstraps rows under.
 *
 * Tests in modules that have not been tenant-scoped yet (Wave 7B) read the demo
 * ledger, so they need a context to hand the transaction DAL. This is the one
 * place a test may name a tenant by default — production code resolves it from a
 * session or refuses. Kept in `src/test/` so it cannot be imported from `src/app`
 * or `src/components`; `transactions-structural.test.ts` (S-5) enforces that
 * production files never touch the store slot directly.
 */
export const DEMO_CONTEXT = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

/** A second tenant, for cross-tenant fixtures. */
export const OTHER_CONTEXT = parseOrganizationContext({ organizationId: "org_other_under_test" });
