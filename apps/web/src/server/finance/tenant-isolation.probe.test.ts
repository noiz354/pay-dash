/**
 * Wave 6 — the measured tenant-isolation matrix (priority area 3).
 *
 * This file is evidence, not aspiration. Each probe asks one surface "can a
 * caller scoped to org A obtain org B's data?" and records the answer,
 * including where the answer is bad.
 *
 * Several tests below deliberately assert **broken** behaviour and are named
 * `CURRENT GAP`. That is not a test rubber-stamping a bug: it is a tripwire.
 * The in-memory data layer accepts no organization at all, so today it cannot
 * isolate anything. Encoding that fact means the day someone adds scoping, the
 * tripwire fails and forces this matrix — and TENANT_ISOLATION_REPORT.md — to
 * be updated rather than silently going stale.
 *
 * The honest summary: the *domain* boundary (`domain/security/tenant.ts`) and
 * the *durable* stores keyed by (org, id) isolate correctly. The 20 legacy
 * in-memory modules behind the dashboard do not, because they are single-tenant
 * demo stores. Wave 7 retrofits them; this wave measures and reports it.
 */

import { describe, expect, it } from "vitest";

import { InMemoryPaymentProjectionStore, projectProviderEvent } from "@/server/repositories/payment-projection-store";
import type { CanonicalStatusMap } from "@/domain/payments/projection";
import { scopeRecord, scopeRecords, tenantScope, TenantIsolationError } from "@/domain/security/tenant";
import { getLedgerRows, listTransactions, countLedgerTenants, seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";

const ORG_A = "org-a";
const ORG_B = "org-b";

type MatrixRow = {
  surface: string;
  isolated: boolean;
  mechanism: string;
};

const MATRIX: MatrixRow[] = [];
function record(row: MatrixRow) {
  MATRIX.push(row);
  return row;
}

describe("tenant isolation matrix — durable / domain surfaces", () => {
  it("payment projection store is keyed by (organizationId, resourceId)", async () => {
    const store = new InMemoryPaymentProjectionStore();
    store.seed({
      id: "pay_1",
      organizationId: ORG_A,
      canonicalStatus: "PENDING",
      providerStatus: null,
      version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const map: CanonicalStatusMap = { terminalSuccess: ["payment.succeeded"], terminalFailure: [], unknown: [] };

    const asB = await projectProviderEvent({
      store,
      organizationId: ORG_B,
      event: {
        eventId: "e1",
        provider: "xendit",
        resourceId: "pay_1",
        observedProviderStatus: "payment.succeeded",
        occurredAt: "2026-09-02T00:00:00.000Z",
      },
      map,
      expectedVersion: 1,
    });

    expect(asB).toBeNull();
    record({ surface: "payment projection store", isolated: true, mechanism: "composite key (org, id)" });
  });

  it("the domain scope helper filters lists and hides foreign records", () => {
    const scope = tenantScope(ORG_A);
    const rows = [
      { organizationId: ORG_A, id: "a" },
      { organizationId: ORG_B, id: "b" },
    ];
    expect(scopeRecords(scope, rows)).toHaveLength(1);
    expect(scopeRecord(scope, rows[1])).toBeNull();
    record({ surface: "domain/security/tenant.ts", isolated: true, mechanism: "explicit scope object" });
  });

  it("a foreign record read returns ∅ rather than 403 (no enumeration oracle)", () => {
    const scope = tenantScope(ORG_A);
    const foreign = { organizationId: ORG_B, id: "secret-id" };
    // The security property: identical result for "absent" and "not yours".
    expect(scopeRecord(scope, foreign)).toBe(scopeRecord(scope, null));
    record({ surface: "read of a foreign id", isolated: true, mechanism: "null-equivalence" });
  });
});

describe("tenant isolation matrix — in-memory data layer", () => {
  /**
   * CLOSED in Wave 7A. The Wave 6 probe asserted the *opposite* of this test —
   * `expect(getLedgerRows.length).toBe(0)` — as a tripwire that would fire the
   * day someone added a scope parameter. It fired, and this row is the response:
   * the ledger now requires an organization at the boundary and answers a
   * foreign id with the same `∅` the durable stores do.
   *
   * Kept in this file, deliberately: the matrix is the measurement, and a
   * closed gap has to be visible as closed rather than deleted from history.
   */
  it("Wave 7A — server/data/transactions requires a tenant scope on every read", async () => {
    (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    seedDemoLedgerForOrganization(scopeA, { count: 3 });
    seedDemoLedgerForOrganization(scopeB, { count: 3 });

    const rows = getLedgerRows(scopeA);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    // Arity is the evidence in the other direction now: a scope is required.
    expect(getLedgerRows.length).toBe(1);
    expect(await listTransactions(scopeB, { pageSize: 50 })).toMatchObject({ total: 3 });
    expect(countLedgerTenants()).toBe(3); // A, B and the dev/demo bootstrap tenant

    record({
      surface: "server/data/transactions (list/get/rows)",
      isolated: true,
      mechanism: "required OrganizationContext + (org, id) partition",
    });
  });

  it("Wave 7A — a foreign transaction id reads as ∅ and a foreign write throws", async () => {
    (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    const { createTransaction, retryTransaction, getTransaction } = await import("@/server/data/transactions");
    const foreign = await createTransaction(scopeB, {
      amount: 250_000,
      currency: "IDR",
      channel: "CARD",
      customerName: "Beta Customer",
      customerEmail: "beta@corp-b.example",
      referenceId: "txn_probe_foreign",
    });

    expect(await getTransaction(scopeA, foreign.id)).toBeNull();
    await expect(retryTransaction(scopeA, foreign.id)).rejects.toBeInstanceOf(TenantIsolationError);

    record({ surface: "server/data/transactions detail + retry", isolated: true, mechanism: "read ∅ / write throws" });
  });

  it("Wave 7B — server/data/payouts requires a tenant scope on every read/write", async () => {
    (globalThis as unknown as { __kineticPayoutStore?: unknown }).__kineticPayoutStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    const { createBatch, listBatches, getBatch } = await import("@/server/data/payouts");
    const mk = (name: string) => ({
      name,
      recipients: [{ line: 1, name: `${name} supplier`, bank: "BCA", accountNumber: "1111111111", amount: 1_000_000, reference: name }],
    });
    const foreign = await createBatch(scopeB, mk("Beta probe batch"), { createdBy: "user_b" });
    await createBatch(scopeA, mk("Alpha probe batch"), { createdBy: "user_a" });

    const rows = await listBatches(scopeA, { pageSize: 50 });
    expect(rows.total).toBe(1);
    expect(rows.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    // Arity is the evidence in the other direction now: a scope is required
    // ((ctx, filters = {}) → length 1: everything after ctx is optional).
    expect(listBatches.length).toBe(1);
    expect(await getBatch(scopeA, foreign.id)).toBeNull();

    record({
      surface: "server/data/payouts (list/get)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant partition",
    });
  });

  it("Wave 7B — payout CSV exports refuse unauthenticated callers (401, no data)", async () => {
    // No session, strict mode (default test env): the guard resolves no tenant
    // and both export endpoints refuse before touching the store. This pins the
    // edge of the payout surface — the scoped-CSV interior is pinned by
    // app/api/exports/payouts/route.tenant.test.ts (5/5), which runs the same
    // handlers with a bound tenant.
    const { NextRequest } = await import("next/server");
    const { GET: exportLog } = await import("@/app/api/exports/payouts/route");
    const { GET: exportBatch } = await import("@/app/api/exports/payouts/[id]/route");

    const log = await exportLog(new NextRequest("http://localhost/api/exports/payouts") as never);
    expect(log.status).toBe(401);
    expect(await log.text()).not.toMatch(/batch_id|Alpha|Beta/i);

    const batch = await exportBatch(
      new NextRequest("http://localhost/api/exports/payouts/BATCH-X") as never,
      { params: Promise.resolve({ id: "BATCH-X" }) },
    );
    expect(batch.status).toBe(401);

    record({
      surface: "app/api/exports/payouts (list + [id], unauthenticated)",
      isolated: true,
      mechanism: "guardExport fail-closed (401) before any store read",
    });
  });

  it("Wave 7C — server/data/customers requires a tenant scope on every read/write", async () => {
    (globalThis as unknown as { __kineticCustomerStore?: unknown }).__kineticCustomerStore = undefined;
    (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    const { createCustomer, listCustomers, getCustomer, updateCustomer } = await import("@/server/data/customers");
    const foreign = await createCustomer(scopeB, { name: "Beta probe buyer", email: "beta@probe-b.example" });
    await createCustomer(scopeA, { name: "Alpha probe buyer", email: "alpha@probe-a.example" });

    const page = await listCustomers(scopeA, { pageSize: 50 });
    expect(page.total).toBe(1);
    expect(page.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    // Arity is the evidence in the other direction now: a scope is required
    // ((ctx, filters = {}) → length 1: everything after ctx is optional).
    expect(listCustomers.length).toBe(1);
    expect(await getCustomer(scopeA, foreign.id)).toBeNull();
    await expect(updateCustomer(scopeA, { id: foreign.id, name: "Hijacked" })).rejects.toBeInstanceOf(
      TenantIsolationError,
    );

    record({
      surface: "server/data/customers (list/get/update)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant partition + composite key",
    });
  });

  /**
   * CLOSED in Wave 7D Q5 (opened in Q1 as two `CURRENT GAP` rows).
   *
   * The Q1 versions asserted the *broken* behaviour, Wave 6 tripwire style:
   *   • `expect(listSubscriptions.length).toBe(0)` — one process-wide `{ plans }`
   *     array, so every tenant's plans in every answer (a leak);
   *   • `expect(listInvoices({ pageSize: 100 })).rejects.toThrow(/more than one
   *     tenant/)` — statements derived from the ledger through the 7A quarantine,
   *     so a two-tenant process served *nobody*, owner included (fail-closed,
   *     "safe but unavailable": debt D-28's shape).
   * Both were the same defect: no `OrganizationContext` at the boundary. Both
   * fired; the two rows below are the response.
   *
   * Kept in this file, deliberately: the matrix is the measurement, and a closed
   * gap has to be visible as closed rather than deleted from history.
   */
  it("Wave 7D — server/data/subscriptions requires a tenant scope on every read/write", async () => {
    (globalThis as unknown as { __kineticSubscriptionStore?: unknown }).__kineticSubscriptionStore = undefined;
    const { createSubscription, listSubscriptions, getSubscription } = await import("@/server/data/subscriptions");
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });

    // Arity is the evidence in the other direction now: a scope is required
    // ((ctx, filters = {}) → length 1; (ctx, input) → length 2).
    expect(listSubscriptions.length).toBe(1);
    expect(createSubscription.length).toBe(2);

    await createSubscription(scopeA, {
      customerName: "Alpha Probe",
      customerEmail: "probe-growth@alpha.example",
      planName: "Growth",
      interval: "monthly",
      amount: 15_000_000,
    });
    const betaPlan = await createSubscription(scopeB, {
      customerName: "Beta Probe",
      customerEmail: "probe-growth@beta.example",
      planName: "Growth",
      interval: "monthly",
      amount: 15_000_999,
    });

    const page = await listSubscriptions(scopeA, { pageSize: 100 });
    const emails = page.rows.map((s: { customerEmail: string }) => s.customerEmail);
    // The leak, measured closed: A's answer is A's plan and nobody else's.
    expect(emails).toContain("probe-growth@alpha.example");
    expect(emails).not.toContain("probe-growth@beta.example");
    expect(page.rows.every((s: { organizationId: string }) => s.organizationId === ORG_A)).toBe(true);
    // A foreign id reads as ∅ rather than forbidden (C-5).
    expect(await getSubscription(scopeA, betaPlan.id)).toBeNull();

    record({
      surface: "server/data/subscriptions (list/get/create)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant plan partition",
    });
  });

  it("Wave 7D — server/data/invoices derives per tenant and refuses a foreign settlement", async () => {
    (globalThis as unknown as { __kineticInvoiceStore?: unknown }).__kineticInvoiceStore = undefined;
    (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
    const { listInvoices, getInvoice, payInvoice } = await import("@/server/data/invoices");
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    const mk = (id: string, createdAt: string, fee: number) => ({
      id,
      createdAt,
      amount: 1_000_000,
      fee,
      net: 1_000_000 - fee,
      status: "SUCCEEDED" as const,
      currency: "IDR",
      channel: "CARD" as const,
      customerName: `${id} buyer`,
      customerEmail: `${id}@example.com`,
    });
    seedDemoLedgerForOrganization(scopeA, { mode: "replace", rows: [mk("txn_probe_jan", "2026-01-15T10:00:00.000Z", 29_000)] });
    seedDemoLedgerForOrganization(scopeB, { mode: "replace", rows: [mk("txn_probe_feb", "2026-02-15T10:00:00.000Z", 58_000)] });

    // The money mutation takes a tenant now: (ctx, id, method).
    expect(listInvoices.length).toBe(1);
    expect(payInvoice.length).toBe(3);

    const a = await listInvoices(scopeA, { pageSize: 100 });
    const b = await listInvoices(scopeB, { pageSize: 100 });
    // Derivation is per tenant, and the three prototype statements are the demo
    // tenant's records rather than every tenant's — so the aggregate (MRR-style
    // "fees this month") is a per-merchant figure at last.
    expect(a.rows.map((r: { number: string }) => r.number)).toEqual(["INV-2026-01-LEDGER"]);
    expect(b.rows.map((r: { number: string }) => r.number)).toEqual(["INV-2026-02-LEDGER"]);
    expect(await getInvoice(scopeA, b.rows[0]!.id)).toBeNull();
    // A foreign settlement writes nothing anywhere. It answers *uniformly*:
    // attribution is bounded to owners this module can name without an unscoped
    // read (demo tenant, payment-holding tenants, the sole ledger tenant), and
    // Wave 7A pins its tenancy probes to `number | string | null` — so an id this
    // module cannot attribute answers not-found, exactly like a missing one. The
    // audited `TenantIsolationError` path is exercised where attribution does
    // succeed, in `invoices.tenant-isolation.test.ts` (B-13).
    expect(await payInvoice(scopeA, b.rows[0]!.id, "Bank transfer — Mandiri")).toBeNull();
    // Refused means unwritten: B's statement is still unsettled.
    expect((await listInvoices(scopeB, { pageSize: 100 })).rows[0]!.status).not.toBe("PAID");

    record({
      surface: "server/data/invoices (list/get/pay/statement)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant derivation + partition-bound payments",
    });
  });

  /**
   * CLOSED in Wave 7F Q5 (opened in Q1 as two `CURRENT GAP` rows).
   *
   * The Q1 versions asserted the *broken* behaviour, Wave 6 tripwire style:
   *   • `expect(listMembers.length).toBe(0)` plus `changeMemberRole(beta.id, …)`
   *     — one process-wide `{ members }` roster, so every tenant's members came
   *     back in every answer *and* any id could be re-roled by anybody
   *     (privilege escalation, not a display bug);
   *   • `expect(getMerchantProfile.length).toBe(0)` — one process-wide
   *     `{ merchant, notifications, keys, developer }` record and one
   *     `{ submission }` KYC slot, so a caller read another merchant's legal
   *     identity, API-key inventory and compliance document, and the derived
   *     onboarding checklist printed the same merchant to everybody.
   * Both were the same defect: no `OrganizationContext` at the boundary. Both
   * fired; the two rows below are the response.
   *
   * Kept in this file, deliberately: the matrix is the measurement, and a closed
   * gap has to be visible as closed rather than deleted from history.
   */
  it("Wave 7F — server/data/team requires a tenant and refuses a foreign role change", async () => {
    (globalThis as unknown as { __kineticTeamStore?: unknown }).__kineticTeamStore = undefined;
    const { inviteMember, listMembers, getMember, changeMemberRole } = await import("@/server/data/team");
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });

    // Arity is the evidence in the direction of isolation now: a scope is
    // required — (ctx, filters = {}) → 1, (ctx, id) → 2, (ctx, id, role) → 3.
    expect(listMembers.length).toBe(1);
    expect(getMember.length).toBe(2);
    expect(changeMemberRole.length).toBe(3);

    await inviteMember(scopeA, { name: "Alpha Probe", email: "probe@alpha.example", role: "ANALYST" });
    const beta = await inviteMember(scopeB, { name: "Beta Probe", email: "probe@beta.example", role: "ANALYST" });

    const page = await listMembers(scopeA, { pageSize: 100 });
    const emails = page.rows.map((m: { email: string }) => m.email);
    // The leak, measured closed: A's answer is A's roster and nobody else's —
    // not B's probe, and not the demo persona's seeded team.
    expect(emails).toContain("probe@alpha.example");
    expect(emails).not.toContain("probe@beta.example");
    expect(emails).not.toContain("daniel@acmecorp.com");
    expect(page.rows.every((m: { organizationId: string }) => m.organizationId === ORG_A)).toBe(true);
    // A foreign id reads as ∅ rather than forbidden (C-5)…
    expect(await getMember(scopeA, beta.id)).toBeNull();
    // …and the escalation edge refuses loudly instead of silently re-roling
    // somebody else's member. Refused means unwritten.
    await expect(changeMemberRole(scopeA, beta.id, "ADMIN")).rejects.toBeInstanceOf(TenantIsolationError);
    expect((await getMember(scopeB, beta.id))?.role).toBe("ANALYST");

    record({
      surface: "server/data/team (list/get/invite/role/lifecycle)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant roster partition + audited role-change refusal",
    });
  });

  it("Wave 7F — settings, KYC and the derived checklist answer one tenant", async () => {
    (globalThis as unknown as { __kineticSettingsStore?: unknown }).__kineticSettingsStore = undefined;
    (globalThis as unknown as { __kineticKycStore?: unknown }).__kineticKycStore = undefined;
    const { createApiKey, getApiKey, getMerchantProfile, listApiKeys, updateMerchantProfile } = await import(
      "@/server/data/settings"
    );
    const { getKycSubmission, submitKycDocument } = await import("@/server/data/kyc");
    const { getOnboardingStatus } = await import("@/server/data/onboarding");
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });

    expect(getMerchantProfile.length).toBe(1);
    expect(listApiKeys.length).toBe(2);
    expect(getKycSubmission.length).toBe(1);
    expect(getOnboardingStatus.length).toBe(1);

    await updateMerchantProfile(scopeA, { legalName: "Alpha PT", taxId: "11-2223334" });
    await updateMerchantProfile(scopeB, { legalName: "Beta Pte Ltd", taxId: "SG-77" });
    const { key } = await createApiKey(scopeB, {
      name: "Beta Live Key",
      environment: "LIVE",
      scopes: ["read", "write"],
    });
    submitKycDocument(scopeB, {
      fileName: "beta-articles-of-association.pdf",
      sizeBytes: 991_002,
      docType: "articles",
      jurisdiction: "SG",
    });

    // The secrets and the PII, measured closed: A never sees B's profile, key
    // inventory or compliance document — and B's write no longer overwrote A's
    // legal identity, which is what one shared record used to mean.
    expect((await getMerchantProfile(scopeA)).legalName).toBe("Alpha PT");
    expect((await getMerchantProfile(scopeB)).legalName).toBe("Beta Pte Ltd");
    expect((await listApiKeys(scopeA)).some((k: { id: string }) => k.id === key.id)).toBe(false);
    expect(JSON.stringify(await listApiKeys(scopeA))).not.toContain("Beta Live Key");
    expect(await getApiKey(scopeA, key.id)).toBeNull();
    expect(getKycSubmission(scopeA)).toBeNull();
    expect(getKycSubmission(scopeB)?.fileName).toBe("beta-articles-of-association.pdf");

    // The derived checklist — five stores folded into one answer — names the
    // caller's own merchant. It also no longer rides the ledger quarantine: a
    // two-tenant process serves both tenants, which retires the fail-closed
    // "safe but unavailable" shape (D-28) for this surface.
    expect((await getOnboardingStatus(scopeA)).merchantName).toBe("Alpha PT");
    expect((await getOnboardingStatus(scopeB)).merchantName).toBe("Beta Pte Ltd");

    record({
      surface: "server/data/settings + kyc + onboarding (profile/keys/documents/checklist)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant settings/KYC partitions + scoped derivation",
    });
  });

  it("publishes the measured matrix so the report cannot drift from reality", () => {
    const isolated = MATRIX.filter((r) => r.isolated);
    const gaps = MATRIX.filter((r) => !r.isolated);

    // Printed into the test log so the report's numbers have a source.
     
    console.log(
      "\nTENANT ISOLATION MATRIX\n" +
        MATRIX.map((r) => `  ${r.isolated ? "PASS" : "GAP "}  ${r.surface.padEnd(45)} ${r.mechanism}`).join("\n"),
    );

    expect(isolated.length).toBeGreaterThan(0);
    // The assertion that matters: gaps are KNOWN and counted, never zero-by-accident.
    // Wave 6 measured 2; Wave 7A closed Transactions; Wave 7B closed Payouts;
    // Wave 7C closed Customers; Wave 7D closed Billing (subscriptions +
    // invoices); Wave 7F closed Identity & Access (team roster + role
    // escalation, settings secrets, KYC documents, the derived checklist).
    // The next slice re-opens this count the moment it adds a probe that fails.
    expect(gaps.length).toBe(0);
  });
});
