import "server-only";

import { resolveProviderWrite, type ProviderWriteDeps } from "@/server/payment-flows/execute-provider-write";
import type { ProviderConnectionContext, ProviderRegistry } from "@/server/providers/registry";
import type { ProviderCustomer, ProviderInvoice, ProviderRecurringPlan } from "@/domain/payments/commerce";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";

/**
 * Commerce capabilities (customer vault / billing / recurring). Routes creates
 * through the provider adapters when a persisted ACTIVE connection + unsealed
 * secret resolves for an org (org-scoped, fail-closed). `{ connected: false }`
 * means no connection → caller falls back to the in-memory dev/demo store; a
 * configured-but-failing provider propagates (never mocked).
 */

type Ctx = Extract<Awaited<ReturnType<typeof resolveProviderWrite>>, { connected: true }>;

let cachedRegistry: ProviderRegistry | null = null;

async function getRegistry(deps: ProviderWriteDeps): Promise<ProviderRegistry> {
  if (deps.registry) return deps.registry;
  if (!cachedRegistry) {
    const { buildRuntimeConnectionResolver } = await import("@/server/repositories/runtime-connection-resolver");
    const c = await buildRuntimeConnectionResolver();
    const { buildProviderRuntimeRegistry } = await import("@/server/payment-flows/money-in-runtime");
    cachedRegistry = buildProviderRuntimeRegistry(c);
  }
  return cachedRegistry;
}

async function makeCtx(organizationId: string | undefined, deps: ProviderWriteDeps): Promise<{ connected: false } | { connected: true; ctx: ProviderConnectionContext; res: Ctx }> {
  const res = await resolveProviderWrite(organizationId ?? DEFAULT_DEMO_ORG, deps);
  if (!res.connected) {
    return { connected: false };
  }
  return { connected: true, ctx: { organizationId: res.organizationId, connectionId: res.connectionId, provider: res.provider, mode: res.mode }, res };
}

export async function createProviderCustomer(
  input: { organizationId?: string; referenceId: string; name?: string; email?: string | null },
  deps: ProviderWriteDeps = {},
): Promise<{ connected: false } | { connected: true; customer: ProviderCustomer }> {
  const m = await makeCtx(input.organizationId, deps);
  if (!m.connected) return { connected: false };
  const registry = await getRegistry(deps);
  const raw = (await registry.invokeCapability(m.ctx.provider, "customers", m.ctx, {
    referenceId: input.referenceId,
    name: input.name,
    email: input.email ?? null,
  })) as ProviderCustomer;
  return { connected: true, customer: raw };
}

export async function createProviderInvoice(
  input: { organizationId?: string; externalId: string; amountMinor: string; currency: string; description?: string; payerEmail?: string | null },
  deps: ProviderWriteDeps = {},
): Promise<{ connected: false } | { connected: true; invoice: ProviderInvoice }> {
  const m = await makeCtx(input.organizationId, deps);
  if (!m.connected) return { connected: false };
  const registry = await getRegistry(deps);
  const raw = (await registry.invokeCapability(m.ctx.provider, "hostedPaymentLinks", m.ctx, {
    externalId: input.externalId,
    amount: Number(input.amountMinor),
    currency: input.currency,
    description: input.description,
    payerEmail: input.payerEmail ?? null,
  })) as { id: string; checkoutUrl: string; status: string };
  return {
    connected: true,
    invoice: { id: raw.id, provider: m.ctx.provider, checkoutUrl: raw.checkoutUrl, status: raw.status, amountMinor: Number(input.amountMinor), currency: input.currency },
  };
}

export async function createProviderRecurringPlan(
  input: { organizationId?: string; idempotencyKey: string; planName: string; currency: string; interval: "monthly" | "yearly"; amountMinor: number; customerId: string },
  deps: ProviderWriteDeps = {},
): Promise<{ connected: false } | { connected: true; plan: ProviderRecurringPlan }> {
  const m = await makeCtx(input.organizationId, deps);
  if (!m.connected) return { connected: false };
  const registry = await getRegistry(deps);
  const raw = (await registry.invokeCapability(m.ctx.provider, "recurringBilling", m.ctx, {
    idempotencyKey: input.idempotencyKey,
    planName: input.planName,
    currency: input.currency,
    interval: input.interval,
    amountMinor: input.amountMinor,
    customerId: input.customerId,
  })) as ProviderRecurringPlan;
  return { connected: true, plan: raw };
}
