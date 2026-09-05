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
import { getWebhookEvent, listWebhooks } from "@/server/data/webhooks";
import { dataSourceError, resolveDataSource } from "@/server/settings/data-source";
import { textResult } from "./handlers";
import { getBalanceOverviewPostgres, getTransactionPostgres, listTransactionsPostgres } from "./pg-stores";

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

export function registerDomainTools(server: McpServer): void {
  // Transactions
  server.registerTool(
    "list_transactions",
    {
      title: "List transactions",
      description: "List the payment transaction ledger. dataSource=postgres reads real Cloud SQL ledger rows.",
      inputSchema: { ...pageSchema, ...sourceSchema, status: z.string().optional(), channel: z.string().optional() },
    },
    async (input) =>
      sourceAware(
        input,
        () => listTransactions(asFilters<Parameters<typeof listTransactions>[0]>(filterFrom(input))),
        () => listTransactionsPostgres({ page: input.page, pageSize: input.pageSize })
      )
  );
  server.registerTool(
    "get_transaction",
    {
      title: "Get transaction",
      description: "Get one transaction by id. dataSource=postgres reads the real Cloud SQL ledger.",
      inputSchema: { id: z.string(), ...sourceSchema },
    },
    async ({ id, ...input }) => sourceAware(input, () => getTransaction(id), () => getTransactionPostgres(id))
  );
  server.registerTool(
    "refund_transaction",
    {
      title: "Refund transaction",
      description: "Refund a transaction (full amount by default). In-memory store only for now.",
      inputSchema: { id: z.string(), amount: z.number().positive().optional(), reason: z.string().optional(), ...sourceSchema },
    },
    async ({ id, amount, reason, ...input }) =>
      sourceAware(input, () => refundTransaction(id, amount ?? 0, reason ?? "Refunded via MCP"), notImplementedPg("refund_transaction"))
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

  // Payouts
  server.registerTool(
    "list_payout_batches",
    { title: "List payout batches", description: "Payout batches (withdrawals).", inputSchema: { ...pageSchema, ...sourceSchema } },
    async ({ page, pageSize, ...input }) =>
      sourceAware(input, () => listBatches(asFilters<Parameters<typeof listBatches>[0]>({ page, pageSize })), notImplementedPg("list_payout_batches"))
  );
  server.registerTool(
    "get_payout_batch",
    { title: "Get payout batch", description: "Get one payout batch by id.", inputSchema: { id: z.string(), ...sourceSchema } },
    async ({ id, ...input }) => sourceAware(input, () => getBatch(id), notImplementedPg("get_payout_batch"))
  );
  server.registerTool(
    "get_payouts_overview",
    { title: "Get payouts overview", description: "Payout summary metrics.", inputSchema: sourceSchema },
    async (input) => sourceAware(input, () => getPayoutsOverview(), notImplementedPg("get_payouts_overview"))
  );

  // Customers
  server.registerTool(
    "list_customers",
    { title: "List customers", description: "List merchants' customers.", inputSchema: { ...pageSchema, ...sourceSchema, status: z.string().optional() } },
    async ({ page, pageSize, status, ...input }) =>
      sourceAware(input, () => listCustomers(asFilters<Parameters<typeof listCustomers>[0]>({ page, pageSize, status })), notImplementedPg("list_customers"))
  );
  server.registerTool(
    "get_customer",
    { title: "Get customer", description: "Get a customer by id or email.", inputSchema: { idOrEmail: z.string(), ...sourceSchema } },
    async ({ idOrEmail, ...input }) => sourceAware(input, () => getCustomer(idOrEmail), notImplementedPg("get_customer"))
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