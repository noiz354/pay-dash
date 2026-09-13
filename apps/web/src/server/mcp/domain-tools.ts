import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAuditEvents } from "@/server/data/audit";
import { getBalanceOverview, listMovements } from "@/server/data/balance";
import { listBlocklist } from "@/server/data/blocklist";
import { getCustomer, listCustomers } from "@/server/data/customers";
import { getInvoice, listInvoices } from "@/server/data/invoices";
import { getKycSubmission } from "@/server/data/kyc";
import { listLinks } from "@/server/data/links";
import { getOnboardingStatus } from "@/server/data/onboarding";
import { getBatch, getPayoutsOverview, listBatches } from "@/server/data/payouts";
import { getRiskOverview } from "@/server/data/risk";
import { getMerchantProfile, getSettingsOverview } from "@/server/data/settings";
import { listSubscriptions } from "@/server/data/subscriptions";
import { listMembers } from "@/server/data/team";
import { getTransaction, listTransactions, refundTransaction } from "@/server/data/transactions";
import { OrganizationContextError, parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { getWebhookEvent, listWebhooks } from "@/server/data/webhooks";
import { dataSourceError, resolveDataSource } from "@/server/settings/data-source";
import { textResult } from "./handlers";
import { getBalanceOverviewPostgres } from "./pg-stores";

function asFilters<T>(input: Record<string, unknown>): T {
  return input as unknown as T;
}

const pageSchema = { page: z.number().int().positive().optional(), pageSize: z.number().int().positive().max(200).optional() };
const sourceSchema = { dataSource: z.enum(["memory", "postgres"]).optional() };

function filterFrom(input: { page?: number; pageSize?: number; status?: string; channel?: string }) {
  return { page: input.page, pageSize: input.pageSize, status: input.status, channel: input.channel };
}

async function sourceAware(
  input: { dataSource?: "memory" | "postgres" },
  memory: () => unknown | Promise<unknown>,
  pg: () => unknown | Promise<unknown>
) {
  const source = await resolveDataSource(input.dataSource);
  if (source === "postgres") {
    try {
      return textResult(await pg());
    } catch (error) {
      return textResult({ error: error instanceof Error ? error.message : "PostgreSQL store failed." });
    }
  }
  return textResult(await memory());
}

function notImplementedPg(domain: string): () => unknown {
  return () => Promise.resolve(dataSourceError(domain));
}

/**
 * Wave 7A — the transaction tools are the money-moving surface of the MCP
 * endpoint, and an endpoint with one shared bearer token cannot answer
 * "which ledger?" on its own. Two rules, both fail-closed:
 *
 *   • no organization on the request  → the tool refuses and touches no store.
 *     Refusing is a *better* answer than the previous behaviour, which was
 *     "read everybody", and a better one than defaulting to the demo tenant,
 *     which would be a tenant chosen by the absence of an answer.
 *   • dataSource=postgres              → refused too, and for an honest reason:
 *     `LedgerEntry` has no `organizationId` column at all (schema.prisma), so no
 *     `where` clause can express the predicate. Debt D-26 tracks the column/RLS
 *     work; until then the Postgres transaction read is *unavailable*, not
 *     *unscoped*.
 *
 * `organization` is `null`-able rather than optional-with-a-default so the
 * "we could not tell" state is a value the caller has to handle.
 */
const NO_TENANT = {
  error:
    "This MCP request is not bound to an organization, so the transaction tools are unavailable. A shared MCP token authorizes the agent, not a tenant — pass through an authenticated session or bind the token to an organization.",
};

const PG_UNSCOPED = (tool: string) => ({
  error: `${tool}: the Postgres ledger table (LedgerEntry) carries no organizationId column, so its rows cannot be read tenant-scoped. Refused rather than leaked — see debt D-26. Use dataSource=memory.`,
});

export function registerDomainTools(server: McpServer, organization?: OrganizationContext | null): void {
  let scoped: OrganizationContext | null = null;
  try {
    scoped = organization ? parseOrganizationContext(organization) : null;
  } catch (e) {
    // A malformed context must not degrade into "no tenant, read everything".
    if (!(e instanceof OrganizationContextError)) throw e;
    scoped = null;
  }
  const tenantOnly = async (
    tool: (ctx: OrganizationContext) => unknown | Promise<unknown>,
  ): Promise<ReturnType<typeof textResult>> => {
    if (!scoped) return textResult(NO_TENANT);
    return textResult(await tool(scoped));
  };

  // Transactions
  server.registerTool(
    "list_transactions",
    {
      title: "List transactions",
      description:
        "List the payment transaction ledger **for the organization bound to this request**. dataSource=postgres is refused until the ledger table carries an organization (D-26).",
      inputSchema: { ...pageSchema, ...sourceSchema, status: z.string().optional(), channel: z.string().optional() },
    },
    async (input) => {
      if (!scoped) return textResult(NO_TENANT);
      const source = await resolveDataSource(input.dataSource);
      if (source === "postgres") return textResult(PG_UNSCOPED("list_transactions"));
      return textResult(
        await listTransactions(scoped, asFilters<Parameters<typeof listTransactions>[1]>(filterFrom(input))),
      );
    }
  );
  server.registerTool(
    "get_transaction",
    {
      title: "Get transaction",
      description: "Get one transaction by id, within the bound organization. A foreign id is indistinguishable from a missing one.",
      inputSchema: { id: z.string(), ...sourceSchema },
    },
    async ({ id, ...input }) => {
      if (!scoped) return textResult(NO_TENANT);
      const source = await resolveDataSource(input.dataSource);
      if (source === "postgres") return textResult(PG_UNSCOPED("get_transaction"));
      return textResult(await getTransaction(scoped, id));
    }
  );
  server.registerTool(
    "refund_transaction",
    {
      title: "Refund transaction",
      description: "Refund a transaction of the bound organization (full amount by default). In-memory store only for now.",
      inputSchema: { id: z.string(), amount: z.number().positive().optional(), reason: z.string().optional(), ...sourceSchema },
    },
    async ({ id, amount, reason }) =>
      tenantOnly(async (ctx) => {
        try {
          return await refundTransaction(ctx, id, amount ?? 0, reason ?? "Refunded via MCP");
        } catch (e) {
          // Same uniform answer as the dashboard: a foreign row is reported as
          // not-found, so the tool cannot be used to probe which ids exist in
          // another tenant. The denial itself is recorded server-side.
          if (e instanceof TenantIsolationError) return { error: "Transaction not found." };
          throw e;
        }
      })
  );

  // Balance
  server.registerTool(
    "get_balance",
    {
      title: "Get balance",
      description: "Balance overview (available, settled, pending). dataSource=postgres derives from Cloud SQL ledger.",
      inputSchema: sourceSchema,
    },
    async (input) => sourceAware(input, () => getBalanceOverview(), () => getBalanceOverviewPostgres())
  );
  server.registerTool(
    "list_movements",
    {
      title: "List balance movements",
      description: "Ledger movements that make up the balance.",
      inputSchema: { ...pageSchema, ...sourceSchema, type: z.string().optional(), status: z.string().optional() },
    },
    async ({ page, pageSize, type, status, ...input }) =>
      sourceAware(input, () => listMovements(asFilters<Parameters<typeof listMovements>[0]>({ page, pageSize, type, status })), notImplementedPg("list_movements"))
  );

  // Payouts — Wave 7B Q4: tenant-bound like the transaction tools above. The
  // request's organization is the only tenant these tools can see; without one
  // they refuse (NO_TENANT) instead of defaulting, and a foreign id reads as
  // not-found so ids cannot be probed across tenants.
  server.registerTool(
    "list_payout_batches",
    { title: "List payout batches", description: "List payout batches (withdrawals) **for the organization bound to this request**.", inputSchema: { ...pageSchema, ...sourceSchema } },
    async ({ page, pageSize, ...input }) => {
      if (!scoped) return textResult(NO_TENANT);
      return sourceAware(input, () => listBatches(scoped, asFilters<Parameters<typeof listBatches>[1]>({ page, pageSize })), notImplementedPg("list_payout_batches"));
    }
  );
  server.registerTool(
    "get_payout_batch",
    { title: "Get payout batch", description: "Get one payout batch by id, within the bound organization. A foreign id is indistinguishable from a missing one.", inputSchema: { id: z.string(), ...sourceSchema } },
    async ({ id, ...input }) => {
      if (!scoped) return textResult(NO_TENANT);
      return sourceAware(input, () => getBatch(scoped, id), notImplementedPg("get_payout_batch"));
    }
  );
  server.registerTool(
    "get_payouts_overview",
    { title: "Get payouts overview", description: "Payout summary metrics for the bound organization.", inputSchema: sourceSchema },
    async (input) => {
      if (!scoped) return textResult(NO_TENANT);
      return sourceAware(input, () => getPayoutsOverview(scoped), notImplementedPg("get_payouts_overview"));
    }
  );

  // Customers — tenant-bound (Wave 7C). No tenant on the request ⇒ refuse;
  // a foreign id/email is not-found, never forbidden (no enumeration oracle).
  server.registerTool(
    "list_customers",
    { title: "List customers", description: "List the customer directory **for the organization bound to this request**.", inputSchema: { ...pageSchema, ...sourceSchema, status: z.string().optional() } },
    async ({ page, pageSize, status, ...input }) => {
      if (!scoped) return textResult(NO_TENANT);
      return sourceAware(input, () => listCustomers(scoped, asFilters<Parameters<typeof listCustomers>[1]>({ page, pageSize, status })), notImplementedPg("list_customers"));
    }
  );
  server.registerTool(
    "get_customer",
    { title: "Get customer", description: "Get one customer by id or email, within the bound organization. A foreign id/email is indistinguishable from a missing one.", inputSchema: { idOrEmail: z.string(), ...sourceSchema } },
    async ({ idOrEmail, ...input }) => {
      if (!scoped) return textResult(NO_TENANT);
      return sourceAware(input, async () => (await getCustomer(scoped, idOrEmail)) ?? { error: "Customer not found." }, notImplementedPg("get_customer"));
    }
  );

  // Invoices
  server.registerTool(
    "list_invoices",
    { title: "List invoices", description: "List hosted payment invoices.", inputSchema: { ...pageSchema, ...sourceSchema, status: z.string().optional() } },
    async ({ page, pageSize, status, ...input }) =>
      sourceAware(input, () => listInvoices(asFilters<Parameters<typeof listInvoices>[0]>({ page, pageSize, status })), notImplementedPg("list_invoices"))
  );
  server.registerTool(
    "get_invoice",
    { title: "Get invoice", description: "Get one invoice by id.", inputSchema: { id: z.string(), ...sourceSchema } },
    async ({ id, ...input }) => sourceAware(input, () => getInvoice(id), notImplementedPg("get_invoice"))
  );

  // Subscriptions / links / kyc / risk / webhooks / blocklist / settings / team / audit / onboarding
  server.registerTool(
    "list_subscriptions",
    { title: "List subscriptions", description: "List recurring subscriptions.", inputSchema: { ...pageSchema, ...sourceSchema } },
    async ({ page, pageSize, ...input }) =>
      sourceAware(input, () => listSubscriptions(asFilters<Parameters<typeof listSubscriptions>[0]>({ page, pageSize })), notImplementedPg("list_subscriptions"))
  );
  server.registerTool(
    "list_links",
    { title: "List payment links", description: "List payment links.", inputSchema: { ...pageSchema, ...sourceSchema } },
    async ({ page, pageSize, ...input }) =>
      sourceAware(input, () => listLinks(asFilters<Parameters<typeof listLinks>[0]>({ page, pageSize })), notImplementedPg("list_links"))
  );
  server.registerTool(
    "get_kyc_submission",
    { title: "Get KYC submission", description: "Current KYC submission status.", inputSchema: sourceSchema },
    async (input) => sourceAware(input, () => getKycSubmission(), notImplementedPg("get_kyc_submission"))
  );
  server.registerTool(
    "get_risk_overview",
    { title: "Get risk overview", description: "Risk alerts and settings overview.", inputSchema: sourceSchema },
    async (input) => sourceAware(input, () => getRiskOverview(), notImplementedPg("get_risk_overview"))
  );
  server.registerTool(
    "list_webhooks",
    { title: "List webhook deliveries", description: "List webhook events and deliveries.", inputSchema: { ...pageSchema, ...sourceSchema } },
    async ({ page, pageSize, ...input }) =>
      sourceAware(input, () => listWebhooks(asFilters<Parameters<typeof listWebhooks>[0]>({ page, pageSize })), notImplementedPg("list_webhooks"))
  );
  server.registerTool(
    "get_webhook_event",
    { title: "Get webhook event", description: "Get one webhook event by id.", inputSchema: { id: z.string(), ...sourceSchema } },
    async ({ id, ...input }) => sourceAware(input, () => getWebhookEvent(id), notImplementedPg("get_webhook_event"))
  );
  server.registerTool(
    "list_blocklist",
    { title: "List blocklist", description: "Blocklisted IPs, card ranges and email domains.", inputSchema: { ...pageSchema, ...sourceSchema } },
    async ({ page, pageSize, ...input }) =>
      sourceAware(input, () => listBlocklist(asFilters<Parameters<typeof listBlocklist>[0]>({ page, pageSize })), notImplementedPg("list_blocklist"))
  );
  server.registerTool(
    "get_merchant_profile",
    { title: "Get merchant profile", description: "Merchant profile settings.", inputSchema: sourceSchema },
    async (input) => sourceAware(input, () => getMerchantProfile(), notImplementedPg("get_merchant_profile"))
  );
  server.registerTool(
    "get_settings_overview",
    { title: "Get settings overview", description: "High-level settings section summary.", inputSchema: sourceSchema },
    async (input) => sourceAware(input, () => getSettingsOverview(), notImplementedPg("get_settings_overview"))
  );
  server.registerTool(
    "list_team_members",
    { title: "List team members", description: "List organization members.", inputSchema: { ...pageSchema, ...sourceSchema } },
    async ({ page, pageSize, ...input }) =>
      sourceAware(input, () => listMembers(asFilters<Parameters<typeof listMembers>[0]>({ page, pageSize })), notImplementedPg("list_team_members"))
  );
  server.registerTool(
    "list_audit_events",
    { title: "List audit events", description: "Security/audit event log.", inputSchema: { ...pageSchema, ...sourceSchema, status: z.string().optional() } },
    async ({ page, pageSize, status, ...input }) =>
      sourceAware(input, () => listAuditEvents(asFilters<Parameters<typeof listAuditEvents>[0]>({ page, pageSize, status })), notImplementedPg("list_audit_events"))
  );
  server.registerTool(
    "get_onboarding_status",
    { title: "Get onboarding status", description: "Merchant onboarding progress.", inputSchema: sourceSchema },
    async (input) => sourceAware(input, () => getOnboardingStatus(), notImplementedPg("get_onboarding_status"))
  );
}